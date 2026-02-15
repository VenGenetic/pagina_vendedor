-- Validation Script: Verify Reversal Logic Fix
-- Steps:
-- 1. Create Test Account (Asset) & Revenue Account
-- 2. Insert Double Entry Sale ($500)
-- 3. Verify Balance is +500
-- 4. Reverse Transaction using RPC
-- 5. Verify Balance is EXACTLY 0.00

BEGIN;

DO $$
DECLARE
    v_asset_acc_id UUID;
    v_rev_acc_id UUID;
    v_user_id UUID;
    v_user_name TEXT := 'Test User';
    v_group_id UUID := uuid_generate_v4();
    v_tx_id UUID;
    v_balance DECIMAL;
BEGIN
    RAISE NOTICE '--- STARTING VALIDATION ---';

    -- 1. Setup Accounts
    INSERT INTO accounts (name, type, balance, currency, is_active)
    VALUES ('Valid Asset', 'CASH', 0.00, 'USD', true)
    RETURNING id INTO v_asset_acc_id;

    INSERT INTO accounts (name, type, balance, currency, is_active, is_nominal)
    VALUES ('Valid Revenue', 'CASH', 0.00, 'USD', true, true)
    RETURNING id INTO v_rev_acc_id;

    SELECT id INTO v_user_id FROM auth.users LIMIT 1;

    -- 2. Create Sale (Using Signed Ledger Logic)
    -- Asset Leg: +500
    INSERT INTO transactions (
        type, amount, description, account_id, payment_method, group_id, created_at, created_by
    ) VALUES (
        'INCOME', 500.00, 'Sale Asset Leg', v_asset_acc_id, 'CASH', v_group_id, NOW(), v_user_id
    ) RETURNING id INTO v_tx_id;

    -- Revenue Leg: -500 (Credit)
    INSERT INTO transactions (
        type, amount, description, account_id, payment_method, group_id, created_at, created_by
    ) VALUES (
        'INCOME', -500.00, 'Sale Revenue Leg', v_rev_acc_id, 'CASH', v_group_id, NOW(), v_user_id
    );

    -- 3. Check Balance (Should be 500)
    SELECT balance INTO v_balance FROM accounts WHERE id = v_asset_acc_id;
    RAISE NOTICE 'Balance after Sale: %', v_balance;
    
    IF v_balance != 500.00 THEN
        RAISE EXCEPTION 'Setup Failed: Balance should be 500.00, got %', v_balance;
    END IF;

    -- 4. Execute Reversal
    PERFORM rpc_reverse_transaction(v_tx_id, v_user_id, 'Validation Reversal');

    -- 5. Verify Final Balance
    SELECT balance INTO v_balance FROM accounts WHERE id = v_asset_acc_id;
    RAISE NOTICE 'Final Balance: %', v_balance;

    IF v_balance = 0.00 THEN
        RAISE NOTICE 'SUCCESS: Balance is 0.00. The Mirror is Good.';
    ELSE
        RAISE EXCEPTION 'FAILURE: Balance is % (Expected 0.00)', v_balance;
    END IF;

    -- Rollback to cleanup
    RAISE NOTICE 'Test Complete (Rollback)';
    RAISE EXCEPTION 'Rollback Test Data'; 
    
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Rollback Test Data' THEN
        -- Expected exit
        NULL;
    ELSE
        RAISE; -- Unexpected error
    END IF;
END $$;

ROLLBACK;
