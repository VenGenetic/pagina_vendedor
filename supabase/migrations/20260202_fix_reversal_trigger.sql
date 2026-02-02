-- Migration: fix_reversal_trigger
-- Purpose: Update trigger to handle REFUND transactions for correct account balance adjustment
-- Date: 2026-02-02

BEGIN;

-- 1. Drop existing trigger to ensure cleaner update
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS update_account_balance_trigger ON transactions;

-- 2. Update the Balance Update Function
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_orig_type VARCHAR;
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

    -- REFUND: Reverse the effect of the original transaction
    ELSIF NEW.type = 'REFUND' THEN
      IF NEW.related_transaction_id IS NOT NULL THEN
        SELECT type INTO v_orig_type FROM transactions WHERE id = NEW.related_transaction_id;
        
        -- Reverse INCOME -> Subtract
        IF v_orig_type = 'INCOME' THEN
          UPDATE accounts 
          SET balance = balance - NEW.amount, updated_at = NOW() 
          WHERE id = NEW.account_id;
          
        -- Reverse EXPENSE -> Add
        ELSIF v_orig_type = 'EXPENSE' THEN
          UPDATE accounts 
          SET balance = balance + NEW.amount, updated_at = NOW() 
          WHERE id = NEW.account_id;
        END IF;
      END IF;
    END IF;

    RETURN NEW;

  -- CASE: DELETE (Undo Transaction)
  ELSIF TG_OP = 'DELETE' THEN
    
    -- INCOME: Subtract from Account
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance - OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_id;
      
    -- EXPENSE: Add to Account
    ELSIF OLD.type = 'EXPENSE' THEN
      UPDATE accounts 
      SET balance = balance + OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_id;
      
    -- TRANSFER: Add to Source, Subtract from Destination
    ELSIF OLD.type = 'TRANSFER' THEN
      -- Refund Source
      UPDATE accounts 
      SET balance = balance + OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_out_id;
      -- Debit Destination
      UPDATE accounts 
      SET balance = balance - OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_in_id;

    -- REFUND: Undo the Refund (Re-apply original)
    ELSIF OLD.type = 'REFUND' THEN
      IF OLD.related_transaction_id IS NOT NULL THEN
        SELECT type INTO v_orig_type FROM transactions WHERE id = OLD.related_transaction_id;
        
        -- Undo Refund of INCOME -> Add back
        IF v_orig_type = 'INCOME' THEN
          UPDATE accounts 
          SET balance = balance + OLD.amount, updated_at = NOW() 
          WHERE id = OLD.account_id;
          
        -- Undo Refund of EXPENSE -> Subtract again
        ELSIF v_orig_type = 'EXPENSE' THEN
          UPDATE accounts 
          SET balance = balance - OLD.amount, updated_at = NOW() 
          WHERE id = OLD.account_id;
        END IF;
      END IF;
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
    ELSIF OLD.type = 'REFUND' THEN
       -- Undo Refund logic
       SELECT type INTO v_orig_type FROM transactions WHERE id = OLD.related_transaction_id;
       IF v_orig_type = 'INCOME' THEN
          UPDATE accounts SET balance = balance + OLD.amount WHERE id = OLD.account_id;
       ELSIF v_orig_type = 'EXPENSE' THEN
          UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
       END IF;
    END IF;

    -- 2. Then, APPLY the NEW values
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'EXPENSE' THEN
      UPDATE accounts SET balance = balance - NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'TRANSFER' THEN
      UPDATE accounts SET balance = balance - NEW.amount, updated_at = NOW() WHERE id = NEW.account_out_id;
      UPDATE accounts SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = NEW.account_in_id;
    ELSIF NEW.type = 'REFUND' THEN
       -- Apply Refund logic
       SELECT type INTO v_orig_type FROM transactions WHERE id = NEW.related_transaction_id;
       IF v_orig_type = 'INCOME' THEN
          UPDATE accounts SET balance = balance - NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
       ELSIF v_orig_type = 'EXPENSE' THEN
          UPDATE accounts SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
       END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Re-create the Trigger
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

COMMIT;
