-- Migration: Setup Inventory Adjustment Account (With Constraint Fix)
-- Purpose: Ensure a default account exists for inventory adjustments and the type is allowed
-- Date: 2026-02-16

BEGIN;

-- 1. Ensure 'ASSET' is allowed in accounts.type
-- Drop existing constraint to make sure we replace it with the updated one
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;

-- Create constraint allowing ASSET, INCOME, EXPENSE etc
ALTER TABLE accounts ADD CONSTRAINT accounts_type_check 
    CHECK (type IN ('CASH', 'BANK', 'DIGITAL_WALLET', 'ASSET', 'INCOME', 'EXPENSE'));

-- 2. Ensure 'Inventory Adjustment' account exists
INSERT INTO accounts (name, type, balance, currency, is_active, is_nominal)
SELECT 'Ajustes de Inventario', 'ASSET', 0.00, 'USD', true, true
WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE name = 'Ajustes de Inventario' OR name = 'Inventory Adjustment'
);

-- 3. Create index on name for faster lookup if not exists
CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name);

COMMIT;
