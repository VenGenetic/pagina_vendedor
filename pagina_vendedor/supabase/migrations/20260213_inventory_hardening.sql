-- Migration: Inventory Hardening (WAC Sync & Negative Stock Firewall)
-- Date: 2026-02-13
-- Description: Enforces atomic cost updates on proposal approval and blocks negative stock quantities.

BEGIN;

-- ============================================
-- 1. NEGATIVE STOCK FIREWALL (Task 3.2)
-- ============================================

-- Function to block negative stock
CREATE OR REPLACE FUNCTION public.check_negative_stock_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_stock < 0 THEN
        RAISE EXCEPTION 'Stock Integrity Violation: Product % (SKU: %) cannot have negative stock (%). Adjustment rejected.', 
            NEW.name, NEW.sku, NEW.current_stock;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply as BEFORE UPDATE trigger
DROP TRIGGER IF EXISTS enforce_positive_stock_firewall ON public.products;
CREATE TRIGGER enforce_positive_stock_firewall
BEFORE UPDATE OR INSERT ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.check_negative_stock_trigger();


-- ============================================
-- 2. WAC ATOMIC SYNC (Task 3.1)
-- ============================================
-- Redefining approve_price_proposal to ensure atomicity and explicit cost_price update

CREATE OR REPLACE FUNCTION public.approve_price_proposal(
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
    -- 1. Get Proposal (Must be PENDING)
    SELECT * INTO v_proposal 
    FROM public.price_proposals 
    WHERE id = p_proposal_id AND status = 'PENDING';
    
    IF v_proposal IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Proposal not found or not pending');
    END IF;

    v_final_cost := v_proposal.proposed_cost;
    v_final_selling_price := COALESCE(p_final_price, v_proposal.proposed_price);

    -- 2. Set Config for Trigger Linkage (Audit Trail)
    PERFORM set_config('app.current_proposal_id', p_proposal_id::TEXT, true);

    -- 3. Atomic Update: Product Cost & Price (Closing the WAC Gap)
    UPDATE public.products
    SET cost_price = v_final_cost,
        selling_price = v_final_selling_price,
        updated_at = NOW()
    WHERE id = v_proposal.product_id;

    -- 4. Update Proposal Status
    UPDATE public.price_proposals
    SET status = 'APPROVED',
        applied_at = NOW(),
        applied_by = p_user_id,
        proposed_price = v_final_selling_price 
    WHERE id = p_proposal_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Cost synchronization completed. Product ' || v_proposal.product_id || ' now active with cost ' || v_final_cost
    );
END;
$$;

COMMIT;
