-- Verification Script: Test Transaction Delete
-- Run this in SQL Editor to confirm the fix works.

DO $$
DECLARE
  v_acc_a UUID; -- Source
  v_acc_b UUID; -- Destination
  v_start_bal_a DECIMAL;
  v_start_bal_b DECIMAL;
  v_tx_id UUID;
  v_end_bal_a DECIMAL;
  v_end_bal_b DECIMAL;
BEGIN
  -- 1. Get two accounts (Just pick first two)
  SELECT id INTO v_acc_a FROM accounts LIMIT 1;
  SELECT id INTO v_acc_b FROM accounts WHERE id != v_acc_a LIMIT 1;
  
  -- Record Start Balance
  SELECT balance INTO v_start_bal_a FROM accounts WHERE id = v_acc_a;
  SELECT balance INTO v_start_bal_b FROM accounts WHERE id = v_acc_b;
  
  RAISE NOTICE 'Start Balance A: %, B: %', v_start_bal_a, v_start_bal_b;
  
  -- 2. Create Transfer ($26)
  INSERT INTO transactions (type, amount, description, account_id, account_out_id, account_in_id)
  VALUES ('TRANSFER', 26.00, 'Test Transfer', v_acc_a, v_acc_a, v_acc_b)
  RETURNING id INTO v_tx_id;
  
  -- Verify Balances Changed
  PERFORM pg_sleep(0.1); -- Wait for trigger
  
  SELECT balance INTO v_end_bal_a FROM accounts WHERE id = v_acc_a;
  SELECT balance INTO v_end_bal_b FROM accounts WHERE id = v_acc_b;
  
  RAISE NOTICE 'After Transfer ($26) -> A: % (Expected -26), B: % (Expected +26)', v_end_bal_a, v_end_bal_b;
  
  IF v_end_bal_a != (v_start_bal_a - 26) THEN 
     RAISE EXCEPTION 'Transfer Logic Failed on INSERT for A'; 
  END IF;
  
  -- 3. Delete Transfer
  DELETE FROM transactions WHERE id = v_tx_id;
  
  -- Verify Balances Reverted
  PERFORM pg_sleep(0.1); -- Wait for trigger
  
  SELECT balance INTO v_end_bal_a FROM accounts WHERE id = v_acc_a;
  SELECT balance INTO v_end_bal_b FROM accounts WHERE id = v_acc_b;
  
  RAISE NOTICE 'After Delete -> A: %, B: %', v_end_bal_a, v_end_bal_b;
  
  IF v_end_bal_a != v_start_bal_a THEN
     RAISE EXCEPTION 'Delete Logic Failed! Account A balance did not revert. Got %, Expected %', v_end_bal_a, v_start_bal_a;
  ELSE
     RAISE NOTICE 'SUCCESS: Application Logic Verified. Delete reverted balances perfectly.';
  END IF;
  
END;
$$;
