-- Demonstration: Test Reversal Logic (The "Bad Mirror" Hypothesis)
-- 1. Create a Test Account
-- 2. Create a Sales Transaction (+100)
-- 3. Verify Balance (+100)
-- 4. Reverse the Transaction
-- 5. Verify Balance (Should be 0, Predicted to be +200)

BEGIN;

DO $$
DECLARE
    v_account_id UUID;
    v_user_id UUID;
    v_tx_id UUID;
    v_group_id UUID;
    v_balance DECIMAL;
    v_rev_result JSONB;
BEGIN
    RAISE NOTICE '--- STARTING DEMONSTRATION ---';

    -- Setup: Get a user
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No user found for test';
    END IF;

    -- 1. Create Test Account
    INSERT INTO accounts (name, type, balance, currency, is_active)
    VALUES ('Demo Reversal Account', 'CASH', 0.00, 'USD', true)
    RETURNING id INTO v_account_id;
    
    RAISE NOTICE 'Created Account % with Balance 0.00', v_account_id;

    -- 2. Create Transaction (Simulating a Sale Asset Leg)
    -- We manually insert to avoid full sale procedure complexity, focusing on Ledger Logic
    v_group_id := uuid_generate_v4();
    
    INSERT INTO transactions (
        type, amount, description, account_id, payment_method, 
        created_at, created_by, group_id
    ) VALUES (
        'INCOME', 100.00, 'Test Sale', v_account_id, 'CASH',
        NOW(), v_user_id, v_group_id
    ) RETURNING id INTO v_tx_id;

    -- Also insert balancing side so Strict Mode doesn't complain (if we were committing, but we are inside DO block)
    -- But Strict Mode is deferred.
    
    -- Check Balance
    SELECT balance INTO v_balance FROM accounts WHERE id = v_account_id;
    RAISE NOTICE 'Balance after Sale (+100): %', v_balance;

    -- 3. Execute Reversal
    RAISE NOTICE 'Executing Reversal...';
    
    -- We call the RPC logic directly or use the function if accessible.
    -- Calling the function:
    v_rev_result := rpc_reverse_transaction(v_tx_id, v_user_id, 'Test Reversal');
    
    RAISE NOTICE 'Reversal Result: %', v_rev_result;

    -- 4. Check Balance Logic
    SELECT balance INTO v_balance FROM accounts WHERE id = v_account_id;
    
    RAISE NOTICE 'Balance after Reversal (Should be 0): %', v_balance;
    
    IF v_balance = 0 THEN
        RAISE NOTICE 'RESULT: SUCCESS - The Mirror is Good.';
    ELSE
        RAISE NOTICE 'RESULT: FAILURE - The Mirror is Distorted. Balance is %', v_balance;
    END IF;

    -- Rollback everything so we don't pollute DB
    RAISE EXCEPTION 'End of Demonstration (Rollback)';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '%', SQLERRM;
END $$;

ROLLBACK;
