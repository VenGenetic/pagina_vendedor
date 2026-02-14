-- Migration: Fix Balance Signs (Deterministic Logic)
-- Date: 2026-02-15
-- Description: Enforces deterministic account balance updates based on transaction TYPE, ignoring input sign.
--              INCOME -> Adds to Balance
--              EXPENSE -> Subtracts from Balance
--              TRANSFER -> Moves from Source to Dest

BEGIN;

-- 1. DROP EXISTING TRIGGERS TO AVOID CONFLICTS
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS update_account_balance_trigger ON transactions;
DROP TRIGGER IF EXISTS on_transaction_created ON transactions;

-- 2. REDEFINE BALANCE UPDATE FUNCTION
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- CASE: INSERT (New Transaction)
  IF TG_OP = 'INSERT' THEN
    
    -- INCOME: ALWAYS ADD (Asset increases)
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance + ABS(NEW.amount), updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- EXPENSE/PURCHASE: ALWAYS SUBTRACT (Asset decreases)
    ELSIF NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE' THEN
      UPDATE accounts 
      SET balance = balance - ABS(NEW.amount), updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- TRANSFER: ALWAYS SUBTRACT FROM SOURCE, ADD TO DESTINATION
    ELSIF NEW.type = 'TRANSFER' THEN
      -- Debit Source (Out)
      UPDATE accounts 
      SET balance = balance - ABS(NEW.amount), updated_at = NOW()
      WHERE id = NEW.account_out_id;
      -- Credit Destination (In)
      UPDATE accounts 
      SET balance = balance + ABS(NEW.amount), updated_at = NOW()
      WHERE id = NEW.account_in_id;
    END IF;

    RETURN NEW;

  -- CASE: DELETE (Undo Transaction)
  ELSIF TG_OP = 'DELETE' THEN
    
    -- INCOME: SUBTRACT (Undo Add)
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance - ABS(OLD.amount), updated_at = NOW()
      WHERE id = OLD.account_id;
      
    -- EXPENSE: ADD (Undo Subtract)
    ELSIF OLD.type = 'EXPENSE' OR OLD.type = 'PURCHASE' THEN
      UPDATE accounts 
      SET balance = balance + ABS(OLD.amount), updated_at = NOW()
      WHERE id = OLD.account_id;
      
    -- TRANSFER: ADD TO SOURCE, SUBTRACT FROM DESTINATION (Undo Move)
    ELSIF OLD.type = 'TRANSFER' THEN
      -- Refund Source
      UPDATE accounts 
      SET balance = balance + ABS(OLD.amount), updated_at = NOW()
      WHERE id = OLD.account_out_id;
      -- Debit Destination
      UPDATE accounts 
      SET balance = balance - ABS(OLD.amount), updated_at = NOW()
      WHERE id = OLD.account_in_id;
    END IF;

    RETURN OLD;

  -- CASE: UPDATE (Delta Logic)
  ELSIF TG_OP = 'UPDATE' THEN
    
    -- 1. REVERT OLD (Based on OLD type)
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance - ABS(OLD.amount) WHERE id = OLD.account_id;
    ELSIF OLD.type = 'EXPENSE' OR OLD.type = 'PURCHASE' THEN
      UPDATE accounts SET balance = balance + ABS(OLD.amount) WHERE id = OLD.account_id;
    ELSIF OLD.type = 'TRANSFER' THEN
      UPDATE accounts SET balance = balance + ABS(OLD.amount) WHERE id = OLD.account_out_id;
      UPDATE accounts SET balance = balance - ABS(OLD.amount) WHERE id = OLD.account_in_id;
    END IF;

    -- 2. APPLY NEW (Based on NEW type)
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance + ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE' THEN
      UPDATE accounts SET balance = balance - ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'TRANSFER' THEN
      UPDATE accounts SET balance = balance - ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_out_id;
      UPDATE accounts SET balance = balance + ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_in_id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. RE-CREATE TRIGGER
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

COMMIT;
