-- Validation Script V2: Debug Reversal Failure
-- Description: Prints RPC result and checks detailed failure conditions.

BEGIN;

DO $$
DECLARE
    v_asset_acc_id UUID;
    v_rev_acc_id UUID;
    v_user_id UUID;
    v_group_id UUID := uuid_generate_v4();
    v_tx_id UUID;
    v_balance DECIMAL;
    v_rpc_result JSONB;
BEGIN
    RAISE NOTICE '--- STARTING VALIDATION V2 ---';

    -- 1. Setup Accounts
    INSERT INTO accounts (name, type, balance, currency, is_active)
    VALUES ('Valid Asset V2', 'CASH', 0.00, 'USD', true)
    RETURNING id INTO v_asset_acc_id;

    INSERT INTO accounts (name, type, balance, currency, is_active, is_nominal)
    VALUES ('Valid Revenue V2', 'CASH', 0.00, 'USD', true, true)
    RETURNING id INTO v_rev_acc_id;

    SELECT id INTO v_user_id FROM auth.users LIMIT 1;

    -- 2. Create Sale (Signed Ledger: +500 Asset, -500 Revenue)
    INSERT INTO transactions (
        type, amount, description, account_id, payment_method, group_id, created_at, created_by
    ) VALUES (
        'INCOME', 500.00, 'Sale Asset Leg', v_asset_acc_id, 'CASH', v_group_id, NOW(), v_user_id
    ) RETURNING id INTO v_tx_id;

    INSERT INTO transactions (
        type, amount, description, account_id, payment_method, group_id, created_at, created_by
    ) VALUES (
        'INCOME', -500.00, 'Sale Revenue Leg', v_rev_acc_id, 'CASH', v_group_id, NOW(), v_user_id
    );

    -- 3. Check Balance Selection
    SELECT balance INTO v_balance FROM accounts WHERE id = v_asset_acc_id;
    RAISE NOTICE 'Step 3: Account Balance after Sale: % (Expected 500.00)', v_balance;

    -- 4. Execute Reversal & CAPTURE RESULT
    SELECT rpc_reverse_transaction(v_tx_id, v_user_id, 'Validation Reversal') INTO v_rpc_result;
    
    RAISE NOTICE 'Step 4: RPC Result: %', v_rpc_result;
    
    IF (v_rpc_result->>'success')::BOOLEAN != TRUE THEN
        RAISE EXCEPTION 'RPC Failed: %', v_rpc_result;
    END IF;

    -- 5. Verify Final Balance
    SELECT balance INTO v_balance FROM accounts WHERE id = v_asset_acc_id;
    RAISE NOTICE 'Step 5: Final Balance: % (Expected 0.00)', v_balance;

    IF v_balance = 0.00 THEN
        RAISE NOTICE 'SUCCESS: Balance is 0.00. Logic is Correct.';
    ELSE
        RAISE EXCEPTION 'FAILURE: Balance is %', v_balance;
    END IF;

    -- Rollback
    RAISE NOTICE 'Test Complete (Rollback)';
    RAISE EXCEPTION 'Rollback Test Data'; 

EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Rollback Test Data' THEN NULL;
    ELSE RAISE; END IF;
END $$;

ROLLBACK;
