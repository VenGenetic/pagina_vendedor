-- FIX V2: Explicit Type Logic + Security Definer
-- Description: Updates the balance trigger to use Explicit Logic (Income=Add, Expense=Subtract)
--              instead of relying on signed values.
--              Sets SECURITY DEFINER to bypass RLS issues.

BEGIN;

-- 1. DROP EXISTING TRIGGER
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;

-- 2. RE-DEFINE FUNCTION WITH EXPLICIT LOGIC + SECURITY DEFINER
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER 
SECURITY DEFINER -- Runs with privileges of the function creator (postgres/admin)
AS $$
BEGIN
  -- CASE: INSERT
  IF TG_OP = 'INSERT' THEN
    
    -- INCOME: ADD
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance + ABS(NEW.amount), updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- EXPENSE/PURCHASE: SUBTRACT
    ELSIF NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE' THEN
      UPDATE accounts 
      SET balance = balance - ABS(NEW.amount), updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- TRANSFER: MOVE
    ELSIF NEW.type = 'TRANSFER' THEN
      -- Subtract from Source
      IF NEW.account_out_id IS NOT NULL THEN
        UPDATE accounts 
        SET balance = balance - ABS(NEW.amount), updated_at = NOW()
        WHERE id = NEW.account_out_id;
      END IF;
      -- Add to Dest
      IF NEW.account_in_id IS NOT NULL THEN
        UPDATE accounts 
        SET balance = balance + ABS(NEW.amount), updated_at = NOW()
        WHERE id = NEW.account_in_id;
      END IF;
    END IF;

    RETURN NEW;

  -- CASE: DELETE (Undo)
  ELSIF TG_OP = 'DELETE' THEN
    
    -- INCOME: SUBTRACT
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance - ABS(OLD.amount), updated_at = NOW()
      WHERE id = OLD.account_id;
      
    -- EXPENSE/PURCHASE: ADD
    ELSIF OLD.type = 'EXPENSE' OR OLD.type = 'PURCHASE' THEN
      UPDATE accounts 
      SET balance = balance + ABS(OLD.amount), updated_at = NOW()
      WHERE id = OLD.account_id;
      
    -- TRANSFER: REVERSE MOVE
    ELSIF OLD.type = 'TRANSFER' THEN
      IF OLD.account_out_id IS NOT NULL THEN
        UPDATE accounts 
        SET balance = balance + ABS(OLD.amount), updated_at = NOW()
        WHERE id = OLD.account_out_id;
      END IF;
      IF OLD.account_in_id IS NOT NULL THEN
        UPDATE accounts 
        SET balance = balance - ABS(OLD.amount), updated_at = NOW()
        WHERE id = OLD.account_in_id;
      END IF;
    END IF;

    RETURN OLD;

  -- CASE: UPDATE (Delta)
  ELSIF TG_OP = 'UPDATE' THEN
    -- 1. Undo Old
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance - ABS(OLD.amount) WHERE id = OLD.account_id;
    ELSIF OLD.type = 'EXPENSE' OR OLD.type = 'PURCHASE' THEN
      UPDATE accounts SET balance = balance + ABS(OLD.amount) WHERE id = OLD.account_id;
    ELSIF OLD.type = 'TRANSFER' THEN
      IF OLD.account_out_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + ABS(OLD.amount) WHERE id = OLD.account_out_id;
      END IF;
      IF OLD.account_in_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance - ABS(OLD.amount) WHERE id = OLD.account_in_id;
      END IF;
    END IF;

    -- 2. Apply New
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance + ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE' THEN
      UPDATE accounts SET balance = balance - ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'TRANSFER' THEN
      IF NEW.account_out_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance - ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_out_id;
      END IF;
      IF NEW.account_in_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_in_id;
      END IF;
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

-- 4. EXPLICITLY ENABLE TRIGGER
ALTER TABLE transactions ENABLE ALWAYS TRIGGER trigger_update_account_balance;

COMMIT;
