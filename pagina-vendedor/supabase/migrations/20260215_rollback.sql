-- Rollback: Revert Single-Row Transfer Fix
-- Description: Restores the Zero-Sum constraint and removes the new Transfer check.

BEGIN;

-- 1. Remove the new constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS check_transfer_partners;

-- 2. Restore Zero-Sum Constraint Function
CREATE OR REPLACE FUNCTION public.check_transaction_group_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_sum DECIMAL;
    v_group_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_group_id := OLD.group_id;
    ELSE
        v_group_id := NEW.group_id;
    END IF;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Ledger Integrity Violation: All financial transactions must have a group_id.';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_sum
    FROM public.transactions
    WHERE group_id = v_group_id;

    IF v_sum != 0 THEN
        RAISE EXCEPTION 'Ledger Integrity Violation: Transaction Group % is unbalanced (Net: %). Each group must sum to 0.00.', v_group_id, v_sum;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Restore Zero-Sum Triggers (Both versions if needed, but one is enough for logic)
DROP TRIGGER IF EXISTS enforce_zero_sum_final ON public.transactions;
CREATE CONSTRAINT TRIGGER enforce_zero_sum_final
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_transaction_group_balance();

-- Restore the original trigger name as well to be safe
DROP TRIGGER IF EXISTS enforce_zero_sum ON public.transactions;
CREATE CONSTRAINT TRIGGER enforce_zero_sum
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_transaction_group_balance();

-- Note: The rest of the functions (fn_reconcile_account_balance, transfer_funds) 
-- are "replaced" so dropping them isn't quite right, but we could revert them 
-- to their previous state if we had the code. 
-- However, restoring the CONSTRAINT is the main "Rollback" action to strictly failing 
-- single-row transfers again.

COMMIT;
