
-- Verification Script: Transfer Sign & Reversal Logic
-- Description: 
-- 1. Tests 'transfer_funds' RPC to ensure Source is Negative and Dest is Positive.
-- 2. Tests 'rpc_reverse_transaction' to ensure it reverses both legs independently.

BEGIN;

DO $$
DECLARE
    v_acc_source UUID;
    v_acc_dest UUID;
    v_user_id UUID;
    v_transfer_result JSON;
    v_tx_id UUID;
    v_group_id UUID;
    v_source_tx RECORD;
    v_dest_tx RECORD;
    v_rev_result JSONB;
    v_count INT;
    v_balance_source DECIMAL;
    v_balance_dest DECIMAL;
BEGIN
    RAISE NOTICE '--- STARTING VERIFICATION ---';

    -- 1. Setup Accounts
    INSERT INTO accounts (name, type, balance, currency, is_active) VALUES ('Test Source', 'CASH', 1000.00, 'USD', true) RETURNING id INTO v_acc_source;
    INSERT INTO accounts (name, type, balance, currency, is_active) VALUES ('Test Dest', 'CASH', 0.00, 'USD', true) RETURNING id INTO v_acc_dest;
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;
    
    -- 2. Execute Transfer (100.00)
    -- We expect: Source balance 900, Dest balance 100.
    v_transfer_result := transfer_funds(v_acc_source, v_acc_dest, 100.00, 'Test Transfer', v_user_id);
    v_tx_id := (v_transfer_result->>'transaction_id')::UUID;
    v_group_id := (v_transfer_result->>'group_id')::UUID;
    
    RAISE NOTICE 'Transfer Executed. ID: %, Group: %', v_tx_id, v_group_id;

    -- 3. Validate Transaction Signs
    -- Find Source Leg
    SELECT * INTO v_source_tx FROM transactions WHERE group_id = v_group_id AND account_id = v_acc_source;
    -- Find Dest Leg
    SELECT * INTO v_dest_tx FROM transactions WHERE group_id = v_group_id AND account_id = v_acc_dest;

    RAISE NOTICE 'Source Amount: % (Expected -100)', v_source_tx.amount;
    RAISE NOTICE 'Dest Amount: % (Expected +100)', v_dest_tx.amount;

    IF v_source_tx.amount != -100.00 THEN RAISE EXCEPTION 'FAIL: Source Amount is not -100.00'; END IF;
    IF v_dest_tx.amount != 100.00 THEN RAISE EXCEPTION 'FAIL: Dest Amount is not 100.00'; END IF;

    -- 4. Validate Account Balances (After Transfer)
    SELECT balance INTO v_balance_source FROM accounts WHERE id = v_acc_source;
    SELECT balance INTO v_balance_dest FROM accounts WHERE id = v_acc_dest;
    
    IF v_balance_source != 900.00 THEN RAISE EXCEPTION 'FAIL: Source Balance is % (Exp 900)', v_balance_source; END IF;
    IF v_balance_dest != 100.00 THEN RAISE EXCEPTION 'FAIL: Dest Balance is % (Exp 100)', v_balance_source; END IF;

    RAISE NOTICE 'Transfer Logic Correct. Now testing Reversal...';

    -- 5. Execute Reversal
    -- We can reverse using the ID of the Source Leg (v_tx_id)
    SELECT rpc_reverse_transaction(v_tx_id, v_user_id, 'Verify Reversal') INTO v_rev_result;
    
    RAISE NOTICE 'Reversal Result: %', v_rev_result;

    -- 6. Validate Reversal Count (Should be 2 new transactions in a NEW group)
    -- The reversal group ID is in v_rev_result->>'reversal_group_id'
    
    SELECT COUNT(*) INTO v_count FROM transactions 
    WHERE group_id = (v_rev_result->>'reversal_group_id')::UUID;

    RAISE NOTICE 'Reversal Transaction Count: % (Expected 2)', v_count;
    
    IF v_count != 2 THEN RAISE EXCEPTION 'FAIL: Reversal created % transactions, expected 2', v_count; END IF;

    -- 7. Validate Final Balances (Should be back to Start: 1000 and 0)
    SELECT balance INTO v_balance_source FROM accounts WHERE id = v_acc_source;
    SELECT balance INTO v_balance_dest FROM accounts WHERE id = v_acc_dest;
    
    RAISE NOTICE 'Final Source Balance: % (Exp 1000)', v_balance_source;
    RAISE NOTICE 'Final Dest Balance: % (Exp 0)', v_balance_dest;

    IF v_balance_source != 1000.00 THEN RAISE EXCEPTION 'FAIL: Final Source Balance Incorrect'; END IF;
    IF v_balance_dest != 0.00 THEN RAISE EXCEPTION 'FAIL: Final Dest Balance Incorrect'; END IF;

    RAISE NOTICE 'SUCCESS: ALL CHECKS PASSED.';

    -- ROLLBACK via EXCEPTION (Valid in DO block)
    RAISE EXCEPTION 'ROLLBACK: Verification Successful (All checks passed)'; 
END $$;
