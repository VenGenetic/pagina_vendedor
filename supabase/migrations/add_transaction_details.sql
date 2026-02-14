-- Add Details Column to Transactions
-- This allows storing detailed information about each transaction
-- (e.g., list of products, quantities, payment method details, etc.)

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS details JSONB DEFAULT NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_details ON transactions USING GIN(details);

-- Add comment for clarity
COMMENT ON COLUMN transactions.details IS 'JSON object containing detailed information about the transaction (products, quantities, metadata, etc.)';
