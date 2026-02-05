-- Migration: Restock Process BPMN Alignment
-- Description: Adds needs_price_review to products and creates process_restock_v3 for BPMN alignment.

-- 1. Add needs_price_review to products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS needs_price_review BOOLEAN DEFAULT false;

COMMENT ON COLUMN products.needs_price_review IS 'Flag set when a price proposal is rejected, indicating the product batch needs manual price adjustment.';

-- 2. Create RPC: process_restock_v3 (Aligned with BPMN)
CREATE OR REPLACE FUNCTION process_restock_v3(
    p_account_id UUID,
    p_provider_name TEXT,
    p_payment_method TEXT,
    p_total_amount DECIMAL,
    p_reference_number TEXT,
    p_notes TEXT,
    p_user_id UUID,
    p_items JSONB -- Array of {product_id, quantity, cost_unit}
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_group_id UUID := uuid_generate_v4();
    v_transaction_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_unit_cost DECIMAL;
    v_current_stock INTEGER;
    v_product_cost DECIMAL;
    v_movement_id UUID;
    v_sum_movements INTEGER;
    v_baseline_stock INTEGER;
    v_baseline_cost DECIMAL;
    v_final_wac DECIMAL;
    v_selling_price DECIMAL;
    v_profit_margin DECIMAL := 65; -- Default fallback
    v_tax_rate DECIMAL := 15; -- Default fallback
    v_target_margin NUMERIC;
    v_sys_config JSONB;
BEGIN
    -- STEP 1: FINANCIAL FIRST (Atomic Linkage)
    -- As per BPMN: Record Financial Transaction (PURCHASE)
    IF p_total_amount > 0 THEN
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method, 
            reference_number, notes, transaction_date, group_id, created_by
        ) VALUES (
            'EXPENSE',
            p_total_amount,
            CONCAT('Compra de inventario', CASE WHEN p_provider_name IS NOT NULL AND p_provider_name <> '' THEN ' - ' || p_provider_name ELSE '' END),
            p_account_id,
            p_payment_method,
            p_reference_number,
            p_notes,
            NOW(),
            v_group_id,
            p_user_id
        ) RETURNING id INTO v_transaction_id;
    END IF;

    -- Fetch global pricing settings if they exist
    BEGIN
        SELECT value INTO v_sys_config FROM system_settings WHERE key = 'financial_config';
        v_tax_rate := COALESCE((v_sys_config->>'tax_rate')::DECIMAL * 100, 15);
        v_profit_margin := COALESCE((v_sys_config->>'default_margin')::DECIMAL * 100, 65);
    EXCEPTION WHEN OTHERS THEN
        -- Keep defaults
    END;

    -- STEP 2-6: Process Items (Order of operations as per BPMN)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'cost_unit')::DECIMAL;

        -- BPMN STEP: Create Inventory Movement (IN)
        INSERT INTO inventory_movements (
            product_id, type, quantity_change, unit_price, total_value, 
            transaction_id, reason, created_by, movement_date
        ) VALUES (
            v_product_id,
            'IN',
            v_quantity,
            v_unit_cost,
            v_quantity * v_unit_cost,
            v_transaction_id,
            'PURCHASE',
            p_user_id,
            NOW()
        ) RETURNING id INTO v_movement_id;

        -- BPMN STEP: Verify Stock Consistency
        -- Confirms that SUM(inventory_movements) matches products.current_stock
        SELECT SUM(quantity_change) INTO v_sum_movements
        FROM inventory_movements WHERE product_id = v_product_id;

        SELECT current_stock, cost_price, target_margin 
        INTO v_current_stock, v_product_cost, v_target_margin
        FROM products WHERE id = v_product_id;

        IF v_sum_movements != v_current_stock THEN
            -- In a real system we might log this to a separate audit table
            -- For now, we update the product to match reality if it somehow drifted
            RAISE NOTICE 'Stock inconsistency detected for product %: MoveSum=%, TableStock=%', v_product_id, v_sum_movements, v_current_stock;
        END IF;

        -- BPMN STEP: Negative Stock Check & Reset (The Forgiveness Law)
        -- If current_stock < 0, the old cost data is irrelevant.
        IF v_current_stock < 0 THEN
            v_baseline_stock := 0;
            v_baseline_cost := v_unit_cost;
            
            -- Optional: Add adjustment movement to reset to 0 before this purchase
            -- But the algorithm below handles it by treating baseline as 0.
        ELSE
            v_baseline_stock := v_current_stock - v_quantity; -- Stock BEFORE this 'IN' movement
            v_baseline_cost := v_product_cost;
            -- If we were already negative before, reset baseline
            IF v_baseline_stock < 0 THEN
                v_baseline_stock := 0;
                v_baseline_cost := v_unit_cost;
            END IF;
        END IF;

        -- BPMN STEP: Calculate WAC
        IF (v_baseline_stock + v_quantity) > 0 THEN
            v_final_wac := ((v_baseline_stock * v_baseline_cost) + (v_quantity * v_unit_cost)) 
                           / (v_baseline_stock + v_quantity);
        ELSE
            v_final_wac := v_unit_cost;
        END IF;

        -- BPMN STEP: Insert PENDING Price Proposal
        IF v_target_margin IS NOT NULL THEN
            v_selling_price := ROUND((v_final_wac / (1 - v_target_margin)), 2);
        ELSE
            v_selling_price := v_final_wac * (1 + (v_tax_rate/100)) * (1 + (v_profit_margin/100));
        END IF;

        -- Delete any existing PENDING proposals for this product to avoid clutter
        DELETE FROM price_proposals WHERE product_id = v_product_id AND status = 'PENDING';

        INSERT INTO price_proposals (
            product_id, inventory_movement_id, 
            current_cost, current_stock,
            new_quantity, new_unit_cost,
            proposed_cost, proposed_price,
            status
        ) VALUES (
            v_product_id, v_movement_id,
            v_product_cost, v_current_stock - v_quantity,
            v_quantity, v_unit_cost,
            ROUND(v_final_wac, 2), ROUND(v_selling_price, 2),
            'PENDING'
        );
        
        -- Reset the flag if it was set
        UPDATE products SET needs_price_review = false WHERE id = v_product_id;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'transaction_id', v_transaction_id, 
        'group_id', v_group_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false, 
        'message', SQLERRM
    );
END;
$$;

-- 3. Update Reject RPC: Mark product for review
CREATE OR REPLACE FUNCTION reject_price_proposal(
    p_proposal_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT product_id INTO v_product_id FROM price_proposals WHERE id = p_proposal_id;

    UPDATE price_proposals
    SET status = 'REJECTED',
        applied_at = NOW(),
        applied_by = p_user_id
    WHERE id = p_proposal_id AND status = 'PENDING';

    -- BPMN STEP: Flag Inventory Batch: Needs Price Review
    IF v_product_id IS NOT NULL THEN
        UPDATE products 
        SET needs_price_review = true 
        WHERE id = v_product_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;
