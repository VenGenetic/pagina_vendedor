-- Migration: Ledger Hardening (Double Entry & Account Segregation)
-- Date: 2026-02-12
-- Description: Implements strict zero-sum validation for group_id and prevents transfers involving nominal accounts.

BEGIN;

-- ============================================
-- 1. ZERO-SUM VALIDATOR (Task 2.1)
-- ============================================

-- Function to check group balance
CREATE OR REPLACE FUNCTION public.check_transaction_group_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_sum DECIMAL;
    v_group_id UUID;
BEGIN
    -- Determine Group ID
    IF TG_OP = 'DELETE' THEN
        v_group_id := OLD.group_id;
    ELSE
        v_group_id := NEW.group_id;
    END IF;

    -- If no group_id, block it (Strict Mode)
    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Ledger Integrity Violation: All financial transactions must have a group_id.';
    END IF;

    -- Calculate Sum (at this point in the transaction block)
    SELECT COALESCE(SUM(amount), 0) INTO v_sum
    FROM public.transactions
    WHERE group_id = v_group_id;

    -- Check if balanced
    IF v_sum != 0 THEN
        RAISE EXCEPTION 'Ledger Integrity Violation: Transaction Group % is unbalanced (Net: %). Each group must sum to 0.00.', v_group_id, v_sum;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply as CONSTRAINT TRIGGER (Deferred to COMMIT)
DROP TRIGGER IF EXISTS enforce_zero_sum_final ON public.transactions;
CREATE CONSTRAINT TRIGGER enforce_zero_sum_final
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_transaction_group_balance();

-- ============================================
-- 2. ACCOUNT SEGREGATION (Task 2.2)
-- ============================================

-- Function to block nominal accounts from transfers
CREATE OR REPLACE FUNCTION public.check_transfer_account_segregation()
RETURNS TRIGGER AS $$
DECLARE
    v_is_nominal BOOLEAN;
BEGIN
    -- Only applies to TRANSFERS
    IF NEW.type = 'TRANSFER' THEN
        -- Check primary account_id
        SELECT is_nominal INTO v_is_nominal FROM public.accounts WHERE id = NEW.account_id;
        IF v_is_nominal THEN
            RAISE EXCEPTION 'Accounting Violation: Account % is nominal and cannot participate in fund transfers.', NEW.account_id;
        END IF;

        -- Check account_out_id if present
        IF NEW.account_out_id IS NOT NULL THEN
            SELECT is_nominal INTO v_is_nominal FROM public.accounts WHERE id = NEW.account_out_id;
            IF v_is_nominal THEN
                RAISE EXCEPTION 'Accounting Violation: Source account % is nominal.', NEW.account_out_id;
            END IF;
        END IF;

        -- Check account_in_id if present
        IF NEW.account_in_id IS NOT NULL THEN
            SELECT is_nominal INTO v_is_nominal FROM public.accounts WHERE id = NEW.account_in_id;
            IF v_is_nominal THEN
                RAISE EXCEPTION 'Accounting Violation: Destination account % is nominal.', NEW.account_in_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply as BEFORE trigger
DROP TRIGGER IF EXISTS enforce_account_segregation ON public.transactions;
CREATE TRIGGER enforce_account_segregation
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.check_transfer_account_segregation();

COMMIT;
