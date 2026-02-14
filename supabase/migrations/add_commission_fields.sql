-- Add cost tracking to sale items
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS cost_unit DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_total DECIMAL(12,2) DEFAULT 0;

-- Add shipping cost to sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(12,2) DEFAULT 0;

-- Track money flow accounts
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_in_id UUID REFERENCES accounts(id),
  ADD COLUMN IF NOT EXISTS account_out_id UUID REFERENCES accounts(id);

-- Optional: backfill legacy rows
UPDATE transactions
SET account_in_id = CASE WHEN type = 'INCOME' THEN account_id ELSE account_in_id END,
    account_out_id = CASE WHEN type = 'EXPENSE' THEN account_id ELSE account_out_id END
WHERE account_in_id IS NULL AND account_out_id IS NULL;

-- Indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_transactions_account_in ON transactions(account_in_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_out ON transactions(account_out_id);
