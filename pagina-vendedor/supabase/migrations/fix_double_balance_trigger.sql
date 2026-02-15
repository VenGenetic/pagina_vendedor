-- FIX: Double Account Balance Update
-- Description: Drops duplicate triggers that were causing account balances to update twice.
--              Ensures only ONE trigger (trigger_update_account_balance) is active.

BEGIN;

-- 1. DROP ALL POTENTIAL DUPLICATE TRIGGERS
--    (These might have been left over from previous migrations)
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS update_account_balance_trigger ON transactions;
DROP TRIGGER IF EXISTS on_transaction_created ON transactions;
DROP TRIGGER IF EXISTS balance_update_trigger ON transactions;

-- 2. RE-DEFINE THE BALANCE UPDATE FUNCTION (Type-Agnostic / Signed Ledger)
--    Matches the logic from 'fix_and_verify_all.sql'
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- CASE: INSERT -> ADD (Because logic is signed: Income positive, Expense negative, Transfer Source negative, Dest positive)
  IF TG_OP = 'INSERT' THEN
      UPDATE accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
      RETURN NEW;

  -- CASE: DELETE -> SUBTRACT (Undo Add)
  ELSIF TG_OP = 'DELETE' THEN
      UPDATE accounts 
      SET balance = balance - OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_id;
      RETURN OLD;

  -- CASE: UPDATE -> DELTA
  ELSIF TG_OP = 'UPDATE' THEN
      UPDATE accounts 
      SET balance = balance - OLD.amount + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
      RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. RE-CREATE THE SINGLE CORRECT TRIGGER
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

COMMIT;
