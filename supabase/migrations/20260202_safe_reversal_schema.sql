-- Migration: safe_reversal_schema
-- Purpose: Add support for tracking reversals with explicit flags and "REFUND" type.
-- Date: 2026-02-02

-- 1. Add is_reversed and related_transaction_id to transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS related_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- 2. Update CHECK constraint to allow 'REFUND'
-- We must drop the old constraint and add a new one.
-- First, find the constraint name. Usually 'transactions_type_check'.
-- We assume standard naming or use anonymous replacement if supported, but best is specific.

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE transactions 
ADD CONSTRAINT transactions_type_check 
CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'REFUND'));

-- 3. Create Index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_related ON transactions(related_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reversed ON transactions(is_reversed);
