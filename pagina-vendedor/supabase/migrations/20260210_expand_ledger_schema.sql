-- Migration: Expand Ledger Schema
-- Date: 2026-02-10
-- Description: Adds account_in_id, account_out_id, and group_id to transactions for full ledger support.

-- 1. Add new columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS account_in_id UUID REFERENCES public.accounts(id),
ADD COLUMN IF NOT EXISTS account_out_id UUID REFERENCES public.accounts(id),
ADD COLUMN IF NOT EXISTS group_id UUID;

-- 2. Create indexes for the new columns to improve reporting performance
CREATE INDEX IF NOT EXISTS idx_transactions_account_in ON public.transactions(account_in_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_out ON public.transactions(account_out_id);
CREATE INDEX IF NOT EXISTS idx_transactions_group_id ON public.transactions(group_id);

-- 3. Re-create the transaction_audit_log view to utilize these new columns
-- We drop and recreate it to ensure the structure is exactly what's needed for "Money From" vs "Money To" reporting.
DROP VIEW IF EXISTS transaction_audit_log;

CREATE OR REPLACE VIEW transaction_audit_log AS
SELECT
    t.id,
    t.transaction_date,
    t.created_at,
    t.type,
    t.amount,
    t.description,
    t.reference_number,
    t.payment_method,
    
    -- Original account (backward compatibility)
    a.name AS main_account_name,
    
    -- New double-entry reporting
    acc_in.name AS money_to_account,
    acc_out.name AS money_from_account,
    
    -- Grouping for double-entry movements
    t.group_id,
    
    -- Metadata (if columns exist from other migrations)
    t.notes
FROM public.transactions t
LEFT JOIN public.accounts a ON t.account_id = a.id
LEFT JOIN public.accounts acc_in ON t.account_in_id = acc_in.id
LEFT JOIN public.accounts acc_out ON t.account_out_id = acc_out.id
ORDER BY t.transaction_date DESC, t.created_at DESC;

COMMENT ON VIEW transaction_audit_log IS 'Enhanced audit log for double-entry accounting reporting';
