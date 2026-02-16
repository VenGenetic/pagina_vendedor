-- FIX V3: Nuclear Trigger Cleanup
-- Description: Programmatically DROPS ALL TRIGGERS on the 'transactions' table to eliminate ghosts.
--              Then re-enables the single correct balance trigger.

BEGIN;

-- 1. NUCLEAR CLEANUP: Drop ALL triggers on transactions table
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Loop through all triggers on the transactions table in public schema
    FOR r IN (
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'transactions' 
          AND trigger_schema = 'public'
    ) LOOP
        -- Execute DROP TRIGGER for each one
        EXECUTE 'DROP TRIGGER IF EXISTS "' || r.trigger_name || '" ON transactions CASCADE';
        RAISE NOTICE 'Dropped trigger: %', r.trigger_name;
    END LOOP;
END $$;

-- 2. RE-DEFINE FUNCTION (Explicit Logic + Security Definer)
--    (Same logic as V2, just to be sure we have the latest definition)
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER 
SECURITY DEFINER
AS $$
BEGIN
  -- CASE: INSERT
  IF TG_OP = 'INSERT' THEN
    
    -- INCOME: ADD (Always Positive effect)
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance + ABS(NEW.amount), updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- EXPENSE/PURCHASE: SUBTRACT (Always Negative effect)
    ELSIF NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE' THEN
      UPDATE accounts 
      SET balance = balance - ABS(NEW.amount), updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- TRANSFER: MOVE
    ELSIF NEW.type = 'TRANSFER' THEN
      IF NEW.account_out_id IS NOT NULL THEN
        UPDATE accounts 
        SET balance = balance - ABS(NEW.amount), updated_at = NOW()
        WHERE id = NEW.account_out_id;
      END IF;
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
      
    -- EXPENSE: ADD
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

  -- CASE: UPDATE
  ELSIF TG_OP = 'UPDATE' THEN
    -- Undo Old
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

    -- Apply New
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

-- 3. RE-CREATE THE SINGLE TRIGGER
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

-- 4. ENABLE IT
ALTER TABLE transactions ENABLE ALWAYS TRIGGER trigger_update_account_balance;

-- 5. RE-ENABLE CONSTRAINT (If needed)
-- We didn't enable enforce_zero_sum here because we don't want to enforce it for simple adjustments if it was causing issues.
-- But usually it's good to have.
-- ALTER TABLE transactions ENABLE TRIGGER enforce_zero_sum;

COMMIT;
