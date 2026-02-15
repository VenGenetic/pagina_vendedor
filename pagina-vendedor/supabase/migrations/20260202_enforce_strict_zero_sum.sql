-- Migration: Strict Zero-Sum Enforcement
-- Description: Implements a "Hard-Stop" constraint to ensure Ledger Integrity.
--              Every transaction group MUST sum to 0.00 at Commit time.

-- 1. Create the Validation Function
CREATE OR REPLACE FUNCTION check_transaction_group_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_sum DECIMAL;
    v_group_id UUID;
BEGIN
    -- Determine Group ID (Handle both Insert and Update cases where group_id might change, though rare)
    IF TG_OP = 'DELETE' THEN
        v_group_id := OLD.group_id;
    ELSE
        v_group_id := NEW.group_id;
    END IF;

    -- If no group_id, we can't balance it. 
    -- POLICY: Single-entry without group_id is now ILLEGAL for strict mode, 
    -- UNLESS we are in a migration phase. But user asked for "Hard-Stop".
    -- We assume all valid transactions MUST have a group_id.
    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Ledger Integrity Violation: Transaction must belong to a Group (group_id is NULL).';
    END IF;

    -- Calculate Sum for the Group
    -- We use a precise sum check.
    SELECT COALESCE(SUM(amount), 0) INTO v_sum
    FROM transactions
    WHERE group_id = v_group_id;

    -- Check Validation
    -- Use a small epsilon for floating point safety if using float, but DECIMAL is exact.
    IF v_sum != 0 THEN
        RAISE EXCEPTION 'Ledger Integrity Violation: Transaction Group % is unbalanced. Net Sum: % (Must be 0.00)', v_group_id, v_sum;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the Deferred Constraint Trigger
-- "DEFERRABLE INITIALLY DEFERRED" means it runs at the very end of the transaction (COMMIT).
-- This allows us to insert Entry A, then Entry B, and only check when done.

DROP TRIGGER IF EXISTS enforce_zero_sum ON transactions;

CREATE CONSTRAINT TRIGGER enforce_zero_sum
AFTER INSERT OR UPDATE OR DELETE ON transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_transaction_group_balance();
