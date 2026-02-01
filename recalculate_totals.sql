-- Script: Recalculate Totals (Historical Fix)
-- Description: Resets balances and stocks, then recalculates them from the full history of ledger entries.
-- Run this AFTER applying the new triggers to ensure future integrity.

BEGIN;

DO $$
DECLARE
BEGIN
  RAISE NOTICE 'Starting Historical Recalculation...';

  --------------------------------------------------------------------------------
  -- 1. RECALCULATE ACCOUNT BALANCES
  --------------------------------------------------------------------------------
  -- Strategy: Use a CTE to sum all movements per account.

  WITH account_totals AS (
    SELECT account_id, SUM(amount_signed) as net_change
    FROM (
        -- INCOME (+)
        SELECT account_id, amount as amount_signed 
        FROM transactions WHERE type = 'INCOME'
        
        UNION ALL
        
        -- EXPENSE (-)
        SELECT account_id, -amount as amount_signed 
        FROM transactions WHERE type = 'EXPENSE'
        
        UNION ALL
        
        -- TRANSFER OUT (-) (Source)
        SELECT account_out_id as account_id, -amount as amount_signed
        FROM transactions WHERE type = 'TRANSFER' AND account_out_id IS NOT NULL

        UNION ALL

        -- TRANSFER IN (+) (Destination)
        SELECT account_in_id as account_id, amount as amount_signed
        FROM transactions WHERE type = 'TRANSFER' AND account_in_id IS NOT NULL
    ) as combined_tx
    GROUP BY account_id
  )
  UPDATE accounts
  SET 
    -- Reset to Net Change (Assuming 0 initial balance if not tracked separately)
    balance = COALESCE((SELECT net_change FROM account_totals WHERE account_totals.account_id = accounts.id), 0),
    updated_at = NOW();

  RAISE NOTICE 'Account Balances Recalculated.';

  --------------------------------------------------------------------------------
  -- 2. RECALCULATE PRODUCT STOCKS
  --------------------------------------------------------------------------------

  WITH stock_totals AS (
    SELECT product_id, SUM(quantity_change) as net_stock
    FROM inventory_movements
    GROUP BY product_id
  )
  UPDATE products
  SET 
    current_stock = COALESCE((SELECT net_stock FROM stock_totals WHERE stock_totals.product_id = products.id), 0),
    updated_at = NOW();

  RAISE NOTICE 'Product Stocks Recalculated.';
  RAISE NOTICE 'Historical Fix Complete.';
END $$;

COMMIT;
