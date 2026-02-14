-- Script: Verify Integrity (Automated Test)
-- Description: Creates temporary test data to verify trigger logic for Inserts, Updates, and Deletes.
-- Run this in Supabase SQL Editor.

BEGIN;

-- 1. SETUP: Create Test Data
DO $$
DECLARE
  v_account_a UUID;
  v_account_b UUID;
  v_product UUID;
  v_sale_tx UUID;
  v_transfer_tx UUID;
  v_balance_a DECIMAL;
  v_balance_b DECIMAL;
  v_stock INTEGER;
BEGIN
  RAISE NOTICE '---------------------------------------------------';
  RAISE NOTICE 'STARTING INTEGRITY VERIFICATION TESTS';
  RAISE NOTICE '---------------------------------------------------';

  -- Create Account A ($1000)
  INSERT INTO accounts (name, type, balance, currency, is_active)
  VALUES ('TEST_ACC_A', 'CASH', 1000, 'USD', true)
  RETURNING id INTO v_account_a;

  -- Create Account B ($0)
  INSERT INTO accounts (name, type, balance, currency, is_active)
  VALUES ('TEST_ACC_B', 'BANK', 0, 'USD', true)
  RETURNING id INTO v_account_b;

  -- Create Product (Stock 10)
  -- Note: using 'sku' instead of 'code' based on schema definition
  INSERT INTO products (name, sku, selling_price, current_stock, min_stock_level)
  VALUES ('TEST_PRODUCT', 'TEST001', 100, 10, 5)
  RETURNING id INTO v_product;

  RAISE NOTICE '[SETUP] Created Accounts and Product.';

  ------------------------------------------------------------------------------
  -- TEST 1: SALE (INSERT)
  -- Logic: Sell 2 items @ $100. Stock should be 8. Balance A should be 1200.
  ------------------------------------------------------------------------------
  
  -- Create Movement (OUT 2)
  INSERT INTO inventory_movements (product_id, type, quantity_change, reason)
  VALUES (v_product, 'OUT', -2, 'SALE');

  -- Create Transaction (INCOME $200)
  INSERT INTO transactions (type, amount, account_id, description, payment_method)
  VALUES ('INCOME', 200, v_account_a, 'TEST SALE', 'CASH')
  RETURNING id INTO v_sale_tx;

  -- VALIDATE
  SELECT current_stock INTO v_stock FROM products WHERE id = v_product;
  SELECT balance INTO v_balance_a FROM accounts WHERE id = v_account_a;

  IF v_stock = 8 AND v_balance_a = 1200 THEN
    RAISE NOTICE '[PASS] Test 1: Sale Insert (Stock -2, Balance +200)';
  ELSE
    RAISE EXCEPTION '[FAIL] Test 1: Sale Insert. Expected Stock 8, got %. Expected Balance 1200, got %', v_stock, v_balance_a;
  END IF;

  ------------------------------------------------------------------------------
  -- TEST 2: EDIT SALE (UPDATE - DELTA)
  -- Logic: Change Sale amount to $300. Balance A should be 1300 (Delta +100).
  ------------------------------------------------------------------------------
  
  UPDATE transactions 
  SET amount = 300 
  WHERE id = v_sale_tx;

  -- VALIDATE
  SELECT balance INTO v_balance_a FROM accounts WHERE id = v_account_a;
  
  IF v_balance_a = 1300 THEN
    RAISE NOTICE '[PASS] Test 2: Edit Sale (Delta +100)';
  ELSE
    RAISE EXCEPTION '[FAIL] Test 2: Edit Sale. Expected Balance 1300, got %', v_balance_a;
  END IF;

  ------------------------------------------------------------------------------
  -- TEST 3: DELETE SALE (UNDO)
  -- Logic: Delete Tx. Balance A should return to 1000.
  ------------------------------------------------------------------------------
  
  DELETE FROM transactions WHERE id = v_sale_tx;
  DELETE FROM inventory_movements WHERE product_id = v_product AND type = 'OUT'; -- Assuming only one logic

  -- VALIDATE
  SELECT current_stock INTO v_stock FROM products WHERE id = v_product;
  SELECT balance INTO v_balance_a FROM accounts WHERE id = v_account_a;

  IF v_stock = 10 AND v_balance_a = 1000 THEN
    RAISE NOTICE '[PASS] Test 3: Delete Sale (Undo). Stock returned to 10, Balance to 1000.';
  ELSE
    RAISE EXCEPTION '[FAIL] Test 3: Delete Sale. Expected Stock 10, got %. Expected Balance 1000, got %', v_stock, v_balance_a;
  END IF;

  ------------------------------------------------------------------------------
  -- TEST 4: TRANSFER (INSERT)
  -- Logic: Transfer $500 from A to B. A should be 500, B should be 500.
  ------------------------------------------------------------------------------
  
  INSERT INTO transactions (type, amount, description, account_id, account_out_id, account_in_id)
  VALUES ('TRANSFER', 500, 'TEST TRANSFER', v_account_a, v_account_a, v_account_b)
  RETURNING id INTO v_transfer_tx;

  -- VALIDATE
  SELECT balance INTO v_balance_a FROM accounts WHERE id = v_account_a;
  SELECT balance INTO v_balance_b FROM accounts WHERE id = v_account_b;

  IF v_balance_a = 500 AND v_balance_b = 500 THEN
    RAISE NOTICE '[PASS] Test 4: Transfer Insert. A: 500, B: 500.';
  ELSE
    RAISE EXCEPTION '[FAIL] Test 4: Transfer. Expected A: 500, got %. Expected B: 500, got %', v_balance_a, v_balance_b;
  END IF;

  ------------------------------------------------------------------------------
  -- TEST 5: EDIT TRANSFER (UPDATE - DELTA)
  -- Logic: Change Transfer to $600. A should be 400 (-100), B should be 600 (+100).
  ------------------------------------------------------------------------------
  
  UPDATE transactions
  SET amount = 600
  WHERE id = v_transfer_tx;

  -- VALIDATE
  SELECT balance INTO v_balance_a FROM accounts WHERE id = v_account_a;
  SELECT balance INTO v_balance_b FROM accounts WHERE id = v_account_b;

  IF v_balance_a = 400 AND v_balance_b = 600 THEN
    RAISE NOTICE '[PASS] Test 5: Edit Transfer. A: 400, B: 600.';
  ELSE
    RAISE EXCEPTION '[FAIL] Test 5: Edit Transfer. Expected A: 400, got %. Expected B: 600, got %', v_balance_a, v_balance_b;
  END IF;

   ------------------------------------------------------------------------------
  -- TEST 6: DELETE TRANSFER (UNDO)
  -- Logic: Delete Transfer. A should be 1000, B should be 0.
  ------------------------------------------------------------------------------
  
  DELETE FROM transactions WHERE id = v_transfer_tx;

  -- VALIDATE
  SELECT balance INTO v_balance_a FROM accounts WHERE id = v_account_a;
  SELECT balance INTO v_balance_b FROM accounts WHERE id = v_account_b;

  IF v_balance_a = 1000 AND v_balance_b = 0 THEN
    RAISE NOTICE '[PASS] Test 6: Delete Transfer. A: 1000, B: 0.';
  ELSE
    RAISE EXCEPTION '[FAIL] Test 6: Delete Transfer. Expected A: 1000, got %. Expected B: 0, got %', v_balance_a, v_balance_b;
  END IF;


  RAISE NOTICE '---------------------------------------------------';
  RAISE NOTICE 'ALL TESTS PASSED SUCCESSFULLY';
  RAISE NOTICE '---------------------------------------------------';

END $$;

ROLLBACK; -- Always rollback the test transaction to keep DB clean
