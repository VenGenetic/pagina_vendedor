-- Fix Transfer Trigger
-- This ensures the trigger fires and updates account balances correctly

-- 1. Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_update_account_balance ON public.transactions;

-- 2. Recreate the trigger function with better error handling
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INCOME: Add to account_id
  IF NEW.type = 'INCOME' THEN
    IF NEW.account_id IS NOT NULL THEN
      UPDATE accounts 
      SET balance = balance + NEW.amount,
          updated_at = NOW()
      WHERE id = NEW.account_id;
    END IF;
  
  -- Handle EXPENSE: Subtract from account_id
  ELSIF NEW.type = 'EXPENSE' THEN
    IF NEW.account_id IS NOT NULL THEN
      UPDATE accounts 
      SET balance = balance - NEW.amount,
          updated_at = NOW()
      WHERE id = NEW.account_id;
    END IF;
    
  -- Handle TRANSFER: Subtract from source, add to destination
  ELSIF NEW.type = 'TRANSFER' THEN
    -- Validation: Ensure both accounts are provided
    IF NEW.account_out_id IS NULL OR NEW.account_in_id IS NULL THEN
      RAISE EXCEPTION 'Transfers require both account_in_id and account_out_id';
    END IF;
  
    -- Deduct from Source (account_out_id)
    UPDATE accounts 
    SET balance = balance - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_out_id;
    
    -- Add to Destination (account_in_id)
    UPDATE accounts 
    SET balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_in_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Recreate the trigger (AFTER INSERT to ensure the row exists first)
CREATE TRIGGER trg_update_account_balance
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION update_account_balance();

-- 4. Optional: Verify the trigger exists
-- Run this query to check:
-- SELECT * FROM information_schema.triggers WHERE trigger_name = 'trg_update_account_balance';
