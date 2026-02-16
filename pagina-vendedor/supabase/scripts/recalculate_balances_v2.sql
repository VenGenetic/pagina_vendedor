-- Script: Recalculate Balances V2 (Fix for Double Counting)
-- Description: deeply recalculates balances for ALL accounts (Real and Nominal).
--              It handles INCOME, EXPENSE, PURCHASE, and TRANSFER transactions.
--              It correctly attributes positive/negative signs based on the account type and transaction role.

BEGIN;

DO $$
DECLARE
    v_count_real INT := 0;
    v_count_nominal INT := 0;
BEGIN
    RAISE NOTICE 'Starting Recalculation V2...';

    --------------------------------------------------------------------------------
    -- 1. RESET ALL BALANCES TO 0
    --------------------------------------------------------------------------------
    UPDATE accounts SET balance = 0, updated_at = NOW();

    --------------------------------------------------------------------------------
    -- 2. CALCULATE NET CHANGES PER ACCOUNT
    --------------------------------------------------------------------------------
    -- We simply sum up all effects from the transactions table.
    -- Logic must match 'fn_reconcile_account_balance' exactly.
    
    WITH account_movements AS (
        -- A. INCOME
        -- 1. Real Account (account_id) -> INCREASES (+)
        SELECT account_id, ABS(amount) as change
        FROM transactions WHERE type = 'INCOME' AND account_id IS NOT NULL
        
        UNION ALL
        
        -- 2. Nominal Account (account_out_id) -> DECREASES (-) (Revenue is Credit, but balance is signed?)
        -- WAIT! The new logic in 20260215_fix_double_entry_and_unify_transfers.sql for INCOME says:
        -- "Nominal Account (Credit/Revenue Increase mirrored as negative)"
        -- SET balance = balance - ABS(NEW.amount)
        SELECT account_out_id as account_id, -ABS(amount) as change
        FROM transactions WHERE type = 'INCOME' AND account_out_id IS NOT NULL

        UNION ALL

        -- B. EXPENSE / PURCHASE
        -- 1. Real Account (account_id) -> DECREASES (-)
        SELECT account_id, -ABS(amount) as change
        FROM transactions WHERE (type = 'EXPENSE' OR type = 'PURCHASE') AND account_id IS NOT NULL

        UNION ALL

        -- 2. Nominal Account (account_in_id) -> INCREASES (+) (Expense is Debit)
        -- SET balance = balance + ABS(NEW.amount)
        SELECT account_in_id as account_id, ABS(amount) as change
        FROM transactions WHERE (type = 'EXPENSE' OR type = 'PURCHASE') AND account_in_id IS NOT NULL

        UNION ALL

        -- C. TRANSFER
        -- 1. Source (account_out_id) -> DECREASES (-)
        SELECT account_out_id as account_id, -ABS(amount) as change
        FROM transactions WHERE type = 'TRANSFER' AND account_out_id IS NOT NULL

        UNION ALL

        -- 2. Destination (account_in_id) -> INCREASES (+)
        SELECT account_in_id as account_id, ABS(amount) as change
        FROM transactions WHERE type = 'TRANSFER' AND account_in_id IS NOT NULL
    ),
    aggregated_totals AS (
        SELECT account_id, SUM(change) as net_balance
        FROM account_movements
        GROUP BY account_id
    )
    UPDATE accounts
    SET 
        balance = aggregated_totals.net_balance,
        updated_at = NOW()
    FROM aggregated_totals
    WHERE accounts.id = aggregated_totals.account_id;

    --------------------------------------------------------------------------------
    -- 3. LOGGING / VERIFICATION
    --------------------------------------------------------------------------------
    SELECT COUNT(*) INTO v_count_real FROM accounts WHERE is_nominal IS NOT TRUE;
    SELECT COUNT(*) INTO v_count_nominal FROM accounts WHERE is_nominal IS TRUE;

    RAISE NOTICE 'Recalculation Complete.';
    RAISE NOTICE 'Updated % Real Accounts and % Nominal Accounts.', v_count_real, v_count_nominal;

END $$;

COMMIT;
