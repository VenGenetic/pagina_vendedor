-- Migration: Add ASSET account type
-- Created: 2026-02-16

BEGIN;

-- First, find the check constraint name if possible or just drop and recreate
-- Since it was likely created without a name, Postgres defaults to 'accounts_type_check'
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;

-- Add the new constraint with 'ASSET' included
ALTER TABLE accounts ADD CONSTRAINT accounts_type_check CHECK (type IN ('CASH', 'BANK', 'DIGITAL_WALLET', 'ASSET', 'INCOME', 'EXPENSE'));

COMMIT;
