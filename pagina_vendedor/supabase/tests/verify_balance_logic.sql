-- Verification Script: Fix Balance Signs
-- Date: 2026-02-15
-- Description: Verifies that the new Logic (Deterministic by Type) works correctly.

BEGIN;

DO $$
DECLARE
    v_account_id UUID;
    v_balance DECIMAL;
BEGIN
    -- 1. Create a Test Account
    INSERT INTO accounts (name, type, balance, is_nominal)
    VALUES ('Tes_Balance_Logic', 'ASSET', 0, false)
    RETURNING id INTO v_account_id;
    
    RAISE NOTICE 'Test Account Created: %', v_account_id;

    -- 2. Test INCOME (Positive Input) -> Should ADD
    INSERT INTO transactions (type, amount, description, account_id, payment_method)
    VALUES ('INCOME', 100, 'Test Income +100', v_account_id, 'CASH');
    
    SELECT balance INTO v_balance FROM accounts WHERE id = v_account_id;
    IF v_balance != 100 THEN
        RAISE EXCEPTION 'Test Failed: INCOME (+100) resulted in Balance % (Expected 100)', v_balance;
    ELSE
        RAISE NOTICE 'Pass: INCOME (+100) -> Balance 100';
    END IF;

    -- 3. Test EXPENSE (Positive Input) -> Should SUBTRACT
    INSERT INTO transactions (type, amount, description, account_id, payment_method)
    VALUES ('EXPENSE', 50, 'Test Expense +50', v_account_id, 'CASH');
    
    SELECT balance INTO v_balance FROM accounts WHERE id = v_account_id;
    IF v_balance != 50 THEN
        RAISE EXCEPTION 'Test Failed: EXPENSE (+50) resulted in Balance % (Expected 50)', v_balance;
    ELSE
        RAISE NOTICE 'Pass: EXPENSE (+50) -> Balance 50';
    END IF;

    -- 4. Test EXPENSE (Negative Input - Simulating "Wrong" Sign) -> Should SUBTRACT (ABS)
    INSERT INTO transactions (type, amount, description, account_id, payment_method)
    VALUES ('EXPENSE', -20, 'Test Expense -20', v_account_id, 'CASH');
    
    SELECT balance INTO v_balance FROM accounts WHERE id = v_account_id;
    IF v_balance != 30 THEN
        RAISE EXCEPTION 'Test Failed: EXPENSE (-20) resulted in Balance % (Expected 30)', v_balance;
    ELSE
         RAISE NOTICE 'Pass: EXPENSE (-20) -> Balance 30 (ABS logic worked)';
    END IF;

    -- 5. Test INCOME (Negative Input) -> Should ADD (ABS)
    INSERT INTO transactions (type, amount, description, account_id, payment_method)
    VALUES ('INCOME', -200, 'Test Income -200', v_account_id, 'CASH');
    
    SELECT balance INTO v_balance FROM accounts WHERE id = v_account_id;
    IF v_balance != 230 THEN
        RAISE EXCEPTION 'Test Failed: INCOME (-200) resulted in Balance % (Expected 230)', v_balance;
    ELSE
         RAISE NOTICE 'Pass: INCOME (-200) -> Balance 230 (ABS logic worked)';
    END IF;

    -- 6. Cleanup (Rollback happens automatically if we raise exception, but good to be clean)
    -- We will rollback this whole block actually to not leave generic mess.
    RAISE NOTICE 'All Tests Passed Successfully!';
    
    -- Force Rollback to clean up test data
    RAISE EXCEPTION 'Rollback Test Data';
    
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Rollback Test Data' THEN
        RAISE NOTICE 'Test Verification Completed (Cleaned up).';
    ELSE
        RAISE;
    END IF;
END;
$$;

COMMIT;
