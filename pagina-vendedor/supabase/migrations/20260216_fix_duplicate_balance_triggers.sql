-- Migration: Fix Duplicate Balance Triggers
-- Date: 2026-02-16
-- Description: Drops conflicting triggers that were causing double balance adjustments.
--              Ensures only 'trg_singleton_account_reconciliation' remains active.

BEGIN;

-- 1. DROP DUPLICATE/CONFLICTING TRIGGERS
-- These triggers were identified as duplicates of the logic in fn_reconcile_account_balance
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS trg_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS update_account_balance_trigger ON transactions;
DROP TRIGGER IF EXISTS trg_auto_balance ON transactions; 
DROP TRIGGER IF EXISTS on_transaction_created ON transactions;

-- 2. DROP OLD/CONFLICTING FUNCTIONS
-- Drop the function used by the duplicate trigger if it exists
DROP FUNCTION IF EXISTS update_account_balance() CASCADE;

-- 3. ENSURE CORRECT TRIGGER EXISTS (Idempotent check)
-- This is just to be safe, ensuring the correct one is still there.
-- If it was dropped by accident, we recreate it (referencing the existing function).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_singleton_account_reconciliation') THEN
        CREATE TRIGGER trg_singleton_account_reconciliation
        AFTER INSERT OR DELETE ON transactions
        FOR EACH ROW
        EXECUTE FUNCTION fn_reconcile_account_balance();
    END IF;
END $$;

COMMIT;
