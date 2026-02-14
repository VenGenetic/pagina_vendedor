-- Migration: Add Default Account Fallback for Transactions
-- Purpose: Prevent "null account_id" errors by ensuring a default account exists
--          and providing better error messages
-- Date: 2026-02-16

BEGIN;

-- 1. Ensure a default "Caja Principal" account exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE name = 'Caja Principal' AND type = 'CASH') THEN
        INSERT INTO public.accounts (name, type, balance, currency, is_active, is_nominal)
        VALUES ('Caja Principal', 'CASH', 0.00, 'USD', true, false);
        RAISE NOTICE 'Created default account: Caja Principal';
    END IF;
END $$;

-- 2. Add a helpful constraint with a better error message
-- This will replace the generic "null value" error with something more actionable
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_account_id_check;

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_account_id_check 
CHECK (account_id IS NOT NULL);

COMMENT ON CONSTRAINT transactions_account_id_check ON public.transactions IS 
'Every transaction must have an account_id. Ensure the account is selected in the UI before submitting.';

-- 3. Create a helper function to get default account ID
CREATE OR REPLACE FUNCTION public.get_default_account_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_account_id UUID;
BEGIN
    -- Try to get "Caja Principal" first
    SELECT id INTO v_account_id 
    FROM public.accounts 
    WHERE name = 'Caja Principal' AND type = 'CASH' AND is_active = true
    LIMIT 1;
    
    -- If not found, get any active CASH account
    IF v_account_id IS NULL THEN
        SELECT id INTO v_account_id
        FROM public.accounts
        WHERE type = 'CASH' AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;
    
    -- If still not found, get ANY active account
    IF v_account_id IS NULL THEN
        SELECT id INTO v_account_id
        FROM public.accounts
        WHERE is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;
    
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'No active accounts found in the system. Please create at least one account before creating transactions.';
    END IF;
    
    RETURN v_account_id;
END;
$$;

COMMENT ON FUNCTION public.get_default_account_id() IS 
'Returns the ID of the default account (Caja Principal) or the first active account. Raises an exception if no accounts exist.';

COMMIT;
