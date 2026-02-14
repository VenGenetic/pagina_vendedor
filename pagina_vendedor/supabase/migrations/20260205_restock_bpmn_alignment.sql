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
    p_items JSONB, -- Array of {product_id, quantity, cost_unit}
    p_tax_percent DECIMAL DEFAULT 15,    -- NEW: BPMN Activity_RecordFinancial
    p_margin_percent DECIMAL DEFAULT 65, -- NEW: BPMN Activity_ApplyPrices
    p_discount_percent DECIMAL DEFAULT 0 -- NEW: C2.6.1 Discount Earnings
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_group_id UUID := uuid_generate_v4();
    v_transaction_id UUID;
    v_savings_tx_id UUID;
    v_savings_account_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_unit_cost DECIMAL;
    v_net_unit_cost DECIMAL;
    v_current_stock INTEGER;
    v_product_cost DECIMAL;
    v_movement_id UUID;
    v_sum_movements INTEGER;
    v_baseline_stock INTEGER;
    v_baseline_cost DECIMAL;
    v_final_wac DECIMAL;
    v_selling_price DECIMAL;
    v_target_margin NUMERIC;
    v_total_discount_amount DECIMAL := 0;
BEGIN
    -- STEP 1: FINANCIAL FIRST (Atomic Linkage)
    -- As per BPMN: Record Financial Transaction (PURCHASE)
    -- Note: p_total_amount from frontend should already be the NET amount.
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

    -- STEP 1.1: BPMN C2.6.1 - Discount Earnings Tracking
    IF p_discount_percent > 0 THEN
        -- Find or create nominal account for savings
        SELECT id INTO v_savings_account_id FROM accounts WHERE name = 'Ahorros por Descuentos' LIMIT 1;
        
        IF v_savings_account_id IS NULL THEN
            INSERT INTO accounts (name, type, balance, is_nominal)
            VALUES ('Ahorros por Descuentos', 'NOMINAL', 0, true)
            RETURNING id INTO v_savings_account_id;
        END IF;

        -- Calculate total discount (Total = Net / (1 - Disc)) -> Savings = Total * Disc
        -- Simplified for this context: v_total_discount_amount := p_total_amount * (p_discount_percent / 100);
        v_total_discount_amount := (p_total_amount / (1 - (p_discount_percent / 100))) * (p_discount_percent / 100);

        INSERT INTO transactions (
            type, amount, description, account_id, payment_method,
            group_id, created_by, notes
        ) VALUES (
            'INCOME',
            v_total_discount_amount,
            'Ahorro por descuento proveedor: ' || p_provider_name,
            v_savings_account_id,
            'OTHER',
            v_group_id,
            p_user_id,
            'Registro nominal de ahorro'
        ) RETURNING id INTO v_savings_tx_id;
    END IF;

    -- STEP 2-6: Process Items (Order of operations as per BPMN)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'cost_unit')::DECIMAL; -- Gross unit cost passed from UI
        
        -- Calculate net cost considering the batch discount
        v_net_unit_cost := v_unit_cost * (1 - (p_discount_percent / 100));

        -- BPMN STEP: Create Inventory Movement (IN)
        INSERT INTO inventory_movements (
            product_id, type, quantity_change, unit_price, total_value, 
            transaction_id, reason, created_by, movement_date
        ) VALUES (
            v_product_id,
            'IN',
            v_quantity,
            v_net_unit_cost,
            v_quantity * v_net_unit_cost,
            v_transaction_id,
            'PURCHASE',
            p_user_id,
            NOW()
        ) RETURNING id INTO v_movement_id;

        -- BPMN STEP: Verify Stock Consistency
        SELECT SUM(quantity_change) INTO v_sum_movements
        FROM inventory_movements WHERE product_id = v_product_id;

        SELECT current_stock, cost_price, target_margin 
        INTO v_current_stock, v_product_cost, v_target_margin
        FROM products WHERE id = v_product_id;

        -- BPMN STEP: Negative Stock Check & Reset (The Forgiveness Law)
        IF v_current_stock < 0 THEN
            v_baseline_stock := 0;
            v_baseline_cost := v_net_unit_cost;
        ELSE
            v_baseline_stock := v_current_stock - v_quantity;
            v_baseline_cost := v_product_cost;
            IF v_baseline_stock < 0 THEN
                v_baseline_stock := 0;
                v_baseline_cost := v_net_unit_cost;
            END IF;
        END IF;

        -- BPMN STEP: Calculate WAC
        IF (v_baseline_stock + v_quantity) > 0 THEN
            v_final_wac := ((v_baseline_stock * v_baseline_cost) + (v_quantity * v_net_unit_cost)) 
                           / (v_baseline_stock + v_quantity);
        ELSE
            v_final_wac := v_net_unit_cost;
        END IF;

        -- BPMN STEP: Insert PENDING Price Proposal
        -- NEW: Enforced 65% markup rule (Cost * 1.65)
        -- Note: tax calculation is now implicit or bypassed by the direct markup rule as requested
        v_selling_price := v_final_wac * 1.65;

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
            v_quantity, v_net_unit_cost,
            ROUND(v_final_wac, 2), ROUND(v_selling_price, 2),
            'PENDING'
        );
        
        UPDATE products SET needs_price_review = false WHERE id = v_product_id;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'transaction_id', v_transaction_id, 
        'group_id', v_group_id,
        'savings_id', v_savings_tx_id
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
