-- Migration: Implement WAC and Price Proposals
-- Description: Adds price_proposals table, updates history tracking, adds strict WAC RPCs.

-- 1. Create price_proposals table
CREATE TABLE IF NOT EXISTS price_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  inventory_movement_id UUID REFERENCES inventory_movements(id), -- Context of the latest restock
  
  -- Snapshot BEFORE batch
  current_cost DECIMAL(12,2) NOT NULL,
  current_stock INTEGER NOT NULL,
  
  -- The Batch (Cumulative)
  new_quantity INTEGER NOT NULL,
  new_unit_cost DECIMAL(12,2) NOT NULL,
  
  -- The Result
  proposed_cost DECIMAL(12,2) NOT NULL,
  proposed_price DECIMAL(12,2) NOT NULL,
  
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EDITED')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_price_proposals_status ON price_proposals(status);
CREATE INDEX IF NOT EXISTS idx_price_proposals_product ON price_proposals(product_id);

-- 2. Enhance Product Cost History for Audit Linking
-- Add link to proposal
ALTER TABLE product_cost_history 
ADD COLUMN IF NOT EXISTS related_proposal_id UUID REFERENCES price_proposals(id);

-- Update the Trigger Function to capture the proposal ID from session config
CREATE OR REPLACE FUNCTION log_product_cost_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tax_rate NUMERIC;
    v_system_settings JSONB;
    v_proposal_id UUID;
BEGIN
    -- Only proceed if cost_price has changed or it's a new insert
    IF (TG_OP = 'UPDATE' AND OLD.cost_price = NEW.cost_price) THEN
        RETURN NEW;
    END IF;

    -- Try to get the proposal ID from the current transaction context
    BEGIN
        v_proposal_id := NULLIF(current_setting('app.current_proposal_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_proposal_id := NULL;
    END;

    -- Fetch current tax rate
    BEGIN
        SELECT value INTO v_system_settings
        FROM system_settings
        WHERE key = 'financial_config';
        
        IF v_system_settings IS NULL THEN
            v_tax_rate := 0; 
        ELSE
            v_tax_rate := COALESCE((v_system_settings->>'tax_rate')::NUMERIC, 0);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_tax_rate := 0; 
    END;

    -- Close the previous history record
    IF TG_OP = 'UPDATE' THEN
        UPDATE product_cost_history
        SET active_until = NOW()
        WHERE product_id = NEW.id 
          AND active_until IS NULL;
    END IF;

    -- Insert new history record
    INSERT INTO product_cost_history (
        product_id,
        cost_before_tax,
        tax_rate,
        cost_after_tax,
        created_by,
        related_proposal_id
    ) VALUES (
        NEW.id,
        NEW.cost_price,
        v_tax_rate,
        ROUND((NEW.cost_price * (1 + v_tax_rate)), 2),
        auth.uid(),
        v_proposal_id
    );

    RETURN NEW;
END;
$$;

-- 3. Potential Valuation View
CREATE OR REPLACE VIEW view_potential_inventory_valuation AS
SELECT 
  p.id as product_id,
  p.sku,
  p.name as product_name,
  p.current_stock,
  p.cost_price as current_unit_cost,
  (p.current_stock * p.cost_price) as current_total_value,
  
  pp.id as proposal_id,
  pp.proposed_cost as potential_unit_cost,
  pp.proposed_price as potential_selling_price,
  (p.current_stock * pp.proposed_cost) as potential_total_value,
  
  ((p.current_stock * pp.proposed_cost) - (p.current_stock * p.cost_price)) as value_diff,
  pp.created_at as proposal_date
FROM products p
JOIN price_proposals pp ON p.id = pp.product_id 
WHERE pp.status = 'PENDING';

-- 4. RPC: Process Restock V2 (Atomic Batch: Transaction + Moves + WAC + Proposals)
CREATE OR REPLACE FUNCTION process_restock_v2(
    p_account_id UUID,
    p_provider_name TEXT,
    p_payment_method TEXT,
    p_amount DECIMAL,
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
    v_transaction_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_unit_cost DECIMAL;
    
    v_current_stock INTEGER;
    v_current_cost DECIMAL;
    v_movement_id UUID;
    v_existing_proposal_id UUID;
    v_prev_batch_qty INTEGER;
    v_prev_batch_cost DECIMAL;
    v_new_batch_qty INTEGER;
    v_new_batch_cost DECIMAL;
    v_final_wac DECIMAL;
    v_selling_price DECIMAL;
    v_profit_margin DECIMAL := 65;
    v_tax_rate DECIMAL := 15; 
BEGIN
    -- 1. Create Financial Transaction (if amount > 0)
    -- If p_amount is 0 (Free Entry), we might skip this or create a zero-val transaction.
    -- Assuming provided p_amount is usually > 0 for Purchases.
    
    IF p_amount > 0 THEN
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method, reference_number, notes, created_at, transaction_date, created_by
        ) VALUES (
            'EXPENSE',
            p_amount,
            CONCAT('Compra de inventario', CASE WHEN p_provider_name IS NOT NULL AND p_provider_name <> '' THEN ' - ' || p_provider_name ELSE '' END),
            p_account_id,
            p_payment_method,
            p_reference_number,
            p_notes,
            NOW(),
            NOW(),
            p_user_id
        ) RETURNING id INTO v_transaction_id;
    END IF;

    -- 2. Loop Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'cost_unit')::DECIMAL;
        
        -- A. Get Product State
        SELECT current_stock, cost_price INTO v_current_stock, v_current_cost
        FROM products
        WHERE id = v_product_id; -- FOR UPDATE?

        -- B. Insert Inventory Movement
        INSERT INTO inventory_movements (
            product_id, type, quantity_change, unit_price, total_value, transaction_id, reason, notes, created_by
        ) VALUES (
            v_product_id,
            'IN',
            v_quantity,
            v_unit_cost,
            v_quantity * v_unit_cost,
            v_transaction_id,
            'PURCHASE',
            CASE WHEN p_amount = 0 THEN 'Ingreso Gratuito' ELSE NULL END,
            p_user_id
        ) RETURNING id INTO v_movement_id;

        -- C. Handle Price Proposal Logic
        v_existing_proposal_id := NULL;
        
        SELECT id, new_quantity, new_unit_cost INTO v_existing_proposal_id, v_prev_batch_qty, v_prev_batch_cost
        FROM price_proposals
        WHERE product_id = v_product_id AND status = 'PENDING'
        LIMIT 1;

        IF v_existing_proposal_id IS NOT NULL THEN
            -- Cumulative Update
            v_new_batch_qty := v_prev_batch_qty + v_quantity;
            IF v_new_batch_qty > 0 THEN
                 v_new_batch_cost := ((v_prev_batch_qty * v_prev_batch_cost) + (v_quantity * v_unit_cost)) / v_new_batch_qty;
            ELSE
                 v_new_batch_cost := v_unit_cost;
            END IF;
            
            -- Re-fetch snapshot from existing proposal to maintain baseline
            SELECT current_stock, current_cost INTO v_current_stock, v_current_cost
            FROM price_proposals WHERE id = v_existing_proposal_id;
            
        ELSE
            -- New Proposal
            v_new_batch_qty := v_quantity;
            v_new_batch_cost := v_unit_cost;
            -- Snapshot is v_current_stock/cost from Step A
        END IF;

        -- D. Calculate Final WAC (Reset logic handled here)
        IF v_current_stock < 0 THEN
            v_final_wac := v_new_batch_cost;
        ELSE
            IF (v_current_stock + v_new_batch_qty) = 0 THEN
                 v_final_wac := v_new_batch_cost;
            ELSE
                 v_final_wac := ((v_current_stock * v_current_cost) + (v_new_batch_qty * v_new_batch_cost)) / (v_current_stock + v_new_batch_qty);
            END IF;
        END IF;

        v_selling_price := v_final_wac * 1.65;

        -- E. Upsert Proposal
        IF v_existing_proposal_id IS NOT NULL THEN
            UPDATE price_proposals
            SET new_quantity = v_new_batch_qty,
                new_unit_cost = v_new_batch_cost,
                proposed_cost = ROUND(v_final_wac, 2),
                proposed_price = ROUND(v_selling_price, 2),
                inventory_movement_id = v_movement_id,
                updated_at = NOW()
            WHERE id = v_existing_proposal_id;
        ELSE
            INSERT INTO price_proposals (
                product_id, inventory_movement_id, 
                current_cost, current_stock,
                new_quantity, new_unit_cost,
                proposed_cost, proposed_price,
                status
            ) VALUES (
                v_product_id, v_movement_id,
                v_current_cost, v_current_stock,
                v_new_batch_qty, v_new_batch_cost,
                ROUND(v_final_wac, 2), ROUND(v_selling_price, 2),
                'PENDING'
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id);
END;
$$;

-- 5. RPC: Approve Price Proposal
CREATE OR REPLACE FUNCTION approve_price_proposal(
    p_proposal_id UUID,
    p_user_id UUID,
    p_final_price DECIMAL DEFAULT NULL -- Optional override
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_proposal RECORD;
    v_final_cost DECIMAL;
    v_final_selling_price DECIMAL;
BEGIN
    -- Get Proposal
    SELECT * INTO v_proposal FROM price_proposals WHERE id = p_proposal_id AND status = 'PENDING';
    
    IF v_proposal IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Proposal not found or not pending');
    END IF;

    v_final_cost := v_proposal.proposed_cost;
    v_final_selling_price := COALESCE(p_final_price, v_proposal.proposed_price);

    -- Set Config for Trigger Linkage (The "Audit Link" requested)
    PERFORM set_config('app.current_proposal_id', p_proposal_id::TEXT, true);

    -- Update Product
    UPDATE products
    SET cost_price = v_final_cost,
        selling_price = v_final_selling_price,
        updated_at = NOW()
    WHERE id = v_proposal.product_id;

    -- Update Proposal Status
    UPDATE price_proposals
    SET status = 'APPROVED',
        applied_at = NOW(),
        applied_by = p_user_id,
        proposed_price = v_final_selling_price -- Store the actual final price if overridden
    WHERE id = p_proposal_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. RPC: Reject Price Proposal
CREATE OR REPLACE FUNCTION reject_price_proposal(
    p_proposal_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE price_proposals
    SET status = 'REJECTED',
        applied_at = NOW(),
        applied_by = p_user_id
    WHERE id = p_proposal_id AND status = 'PENDING';

    RETURN jsonb_build_object('success', true);
END;
$$;
