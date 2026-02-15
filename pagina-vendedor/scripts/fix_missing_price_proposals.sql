-- FIX: Missing Price Proposals and WAC Logic
-- Run this in your Supabase SQL Editor to resolve the "relation 'price_proposals' does not exist" error.

BEGIN;

-- 1. Create price_proposals table
CREATE TABLE IF NOT EXISTS price_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  inventory_movement_id UUID REFERENCES inventory_movements(id),
  
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
ALTER TABLE product_cost_history 
ADD COLUMN IF NOT EXISTS related_proposal_id UUID REFERENCES price_proposals(id);

-- 3. Update the Trigger Function to capture the proposal ID from session config
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

-- 4. Potential Valuation View
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

-- 5. RPC: Approve Price Proposal
CREATE OR REPLACE FUNCTION approve_price_proposal(
    p_proposal_id UUID,
    p_user_id UUID,
    p_final_price DECIMAL DEFAULT NULL
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
    SELECT * INTO v_proposal FROM price_proposals WHERE id = p_proposal_id AND status = 'PENDING';
    
    IF v_proposal IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Proposal not found or not pending');
    END IF;

    v_final_cost := v_proposal.proposed_cost;
    v_final_selling_price := COALESCE(p_final_price, v_proposal.proposed_price);

    PERFORM set_config('app.current_proposal_id', p_proposal_id::TEXT, true);

    UPDATE products
    SET cost_price = v_final_cost,
        selling_price = v_final_selling_price,
        updated_at = NOW()
    WHERE id = v_proposal.product_id;

    UPDATE price_proposals
    SET status = 'APPROVED',
        applied_at = NOW(),
        applied_by = p_user_id,
        proposed_price = v_final_selling_price
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

COMMIT;
