-- Script: Clean Triggers
-- Description: Drops potential duplicate triggers that might be causing double counting.

BEGIN;

-- Drop verifyable list of known triggers to ensure we only have the "Integrity" ones left.
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS update_account_balance_trigger ON transactions; -- Potential old name
DROP TRIGGER IF EXISTS on_transaction_created ON transactions; -- Potential old name

-- Re-apply ONLY the new trigger (optional, or just rely on the previous migration if it was correct, but let's be safe and recreate it cleanly)

-- Ensure the function is the correct one
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- CASE: INSERT (New Transaction)
  IF TG_OP = 'INSERT' THEN
    
    -- INCOME: Add to Account
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- EXPENSE: Subtract from Account
    ELSIF NEW.type = 'EXPENSE' THEN
      UPDATE accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- TRANSFER: Subtract from Source, Add to Destination
    ELSIF NEW.type = 'TRANSFER' THEN
      -- Debit Source
      UPDATE accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_out_id;
      -- Credit Destination
      UPDATE accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_in_id;
    END IF;

    RETURN NEW;

  -- CASE: DELETE (Undo Transaction)
  ELSIF TG_OP = 'DELETE' THEN
    
    -- INCOME: Subtract from Account (Undo Add)
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance - OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_id;
      
    -- EXPENSE: Add to Account (Undo Subtract)
    ELSIF OLD.type = 'EXPENSE' THEN
      UPDATE accounts 
      SET balance = balance + OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_id;
      
    -- TRANSFER: Add to Source, Subtract from Destination (Undo Transfer)
    ELSIF OLD.type = 'TRANSFER' THEN
      -- Refund Source
      UPDATE accounts 
      SET balance = balance + OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_out_id;
      -- Debit Destination
      UPDATE accounts 
      SET balance = balance - OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_in_id;
    END IF;

    RETURN OLD;

  -- CASE: UPDATE (Delta Logic)
  ELSIF TG_OP = 'UPDATE' THEN
    
    -- 1. First, UNDO the OLD values
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
    ELSIF OLD.type = 'EXPENSE' THEN
      UPDATE accounts SET balance = balance + OLD.amount WHERE id = OLD.account_id;
    ELSIF OLD.type = 'TRANSFER' THEN
      UPDATE accounts SET balance = balance + OLD.amount WHERE id = OLD.account_out_id;
      UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_in_id;
    END IF;

    -- 2. Then, APPLY the NEW values
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'EXPENSE' THEN
      UPDATE accounts SET balance = balance - NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'TRANSFER' THEN
      UPDATE accounts SET balance = balance - NEW.amount, updated_at = NOW() WHERE id = NEW.account_out_id;
      UPDATE accounts SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = NEW.account_in_id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create the single correct trigger
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

COMMIT;
