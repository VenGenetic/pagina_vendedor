-- MASTER FIX: Signed Ledger Migration, Trigger Fix, and Verification
-- Description:
-- 1. Migrates data to Signed Ledger.
-- 2. Updates Triggers to be Type-Agnostic.
-- 3. Verifies the Reversal Logic.

BEGIN;

-- A. Disable Constraints temporarily
ALTER TABLE transactions DISABLE TRIGGER enforce_zero_sum;

-- B. Migrate Positive Expenses/Transfers to Negative (Signed Ledger)
--    We flip the ENTIRE group to maintain Zero-Sum property.
UPDATE transactions
SET amount = -1 * amount
WHERE group_id IN (
    SELECT DISTINCT group_id 
    FROM transactions 
    WHERE amount > 0 
      AND (type IN ('EXPENSE', 'TRANSFER'))
);

-- C. Update Auto-Balance Trigger (To Generate Signed Values)
CREATE OR REPLACE FUNCTION auto_balance_transaction_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_contra_account_id UUID;
    v_new_group_id UUID;
BEGIN
    IF NEW.group_id IS NULL OR NEW.type = 'TRANSFER' THEN
        IF NEW.group_id IS NULL THEN
             v_new_group_id := uuid_generate_v4();
             NEW.group_id := v_new_group_id;
        ELSE
             v_new_group_id := NEW.group_id;
        END IF;

        IF (NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE') AND NEW.description NOT LIKE '%(Auto-Balance)%' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'DÉBITOS';
            INSERT INTO transactions (type, amount, description, account_id, payment_method, reference_number, notes, created_at, created_by, group_id, is_manual_adjustment) 
            VALUES (NEW.type, -1 * NEW.amount, NEW.description || ' (Auto-Balance)', v_contra_account_id, NEW.payment_method, NEW.reference_number, 'System Auto-Balance Trigger', NOW(), NEW.created_by, v_new_group_id, true);
            
        ELSIF NEW.type = 'INCOME' AND NEW.description NOT LIKE '%(Auto-Balance)%' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'CRÉDITOS';
            INSERT INTO transactions (type, amount, description, account_id, payment_method, reference_number, notes, created_at, created_by, group_id, is_manual_adjustment) 
            VALUES (NEW.type, -1 * NEW.amount, NEW.description || ' (Auto-Balance)', v_contra_account_id, NEW.payment_method, NEW.reference_number, 'System Auto-Balance Trigger', NOW(), NEW.created_by, v_new_group_id, true);
            
        ELSIF NEW.type = 'TRANSFER' AND NEW.description NOT LIKE '%(Entrada)%' AND NEW.account_in_id IS NOT NULL THEN
            INSERT INTO transactions (type, amount, description, account_id, payment_method, reference_number, notes, created_at, created_by, group_id, is_manual_adjustment) 
            VALUES ('TRANSFER', -1 * NEW.amount, NEW.description || ' (Entrada)', NEW.account_in_id, NEW.payment_method, NEW.reference_number, 'Transfer Auto-Split', NOW(), NEW.created_by, v_new_group_id, true);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- D. Update Account Balance Trigger (ALWAYS ADD / Type-Agnostic)
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
      UPDATE accounts SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
      RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
      UPDATE accounts SET balance = balance - OLD.amount, updated_at = NOW() WHERE id = OLD.account_id;
      RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
      UPDATE accounts SET balance = balance - OLD.amount + NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
      RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Ensure Trigger is Bound
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

-- E. Re-Enable Constraints
ALTER TABLE transactions ENABLE TRIGGER enforce_zero_sum;

-- F. Verification Logic
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
    RAISE NOTICE '--- STARTING VERIFICATION ---';

    -- Setup Accounts
    INSERT INTO accounts (name, type, balance, currency, is_active) VALUES ('Fix Asset', 'CASH', 0.00, 'USD', true) RETURNING id INTO v_asset_acc_id;
    INSERT INTO accounts (name, type, balance, currency, is_active, is_nominal) VALUES ('Fix Revenue', 'CASH', 0.00, 'USD', true, true) RETURNING id INTO v_rev_acc_id;
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;

    -- Create Sale: +500 Asset, -500 Revenue
    INSERT INTO transactions (type, amount, description, account_id, payment_method, group_id, created_at, created_by) 
    VALUES ('INCOME', 500.00, 'Sale Asset', v_asset_acc_id, 'CASH', v_group_id, NOW(), v_user_id) RETURNING id INTO v_tx_id;
    
    INSERT INTO transactions (type, amount, description, account_id, payment_method, group_id, created_at, created_by) 
    VALUES ('INCOME', -500.00, 'Sale Revenue', v_rev_acc_id, 'CASH', v_group_id, NOW(), v_user_id);

    -- Check Balance (Expected 500)
    SELECT balance INTO v_balance FROM accounts WHERE id = v_asset_acc_id;
    IF v_balance != 500.00 THEN RAISE EXCEPTION 'Setup Failed: Balance %', v_balance; END IF;

    -- Execute Reversal
    SELECT rpc_reverse_transaction(v_tx_id, v_user_id, 'Fix Validation') INTO v_rpc_result;
    
    -- Check Final Balance (Expected 0)
    SELECT balance INTO v_balance FROM accounts WHERE id = v_asset_acc_id;
    RAISE NOTICE 'Final Validation Balance: %', v_balance;

    IF v_balance = 0.00 THEN
        RAISE NOTICE 'SUCCESS: Balance is 0.00. System is Healthy.';
    ELSE
        RAISE EXCEPTION 'FAILURE: Balance is % after reversal.', v_balance;
    END IF;

    -- Cleanup (Updated to delete ALL transactions for these accounts)
    DELETE FROM transactions WHERE account_id IN (v_asset_acc_id, v_rev_acc_id);
    DELETE FROM accounts WHERE id IN (v_asset_acc_id, v_rev_acc_id);

END $$;

COMMIT;
