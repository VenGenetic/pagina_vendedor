-- Migration: Fix Integrity Triggers (Delta Logic)
-- Description: Updates triggers to handle INSERT, UPDATE (Delta), and DELETE atomically.
-- Ensures mathematical synchronization between ledgers and balances.

BEGIN;

--------------------------------------------------------------------------------
-- 1. ACCOUNT BALANCE TRIGGER
--------------------------------------------------------------------------------

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

-- Recreate Trigger for Accounts
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();


--------------------------------------------------------------------------------
-- 2. PRODUCT STOCK TRIGGER
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- CASE: INSERT (New Movement)
  IF TG_OP = 'INSERT' THEN
    -- Apply change directly (Positive for IN, Negative for OUT usually handled by input, but let's trust quantity_change signedness)
    -- Convention: quantity_change is signed (+ for IN, - for OUT)
    UPDATE products 
    SET current_stock = current_stock + NEW.quantity_change, updated_at = NOW()
    WHERE id = NEW.product_id;
    
    RETURN NEW;

  -- CASE: DELETE (Undo Movement)
  ELSIF TG_OP = 'DELETE' THEN
    -- Reverse the change (Subtract the signed value)
    -- If it was -5 (OUT), subtracting -5 adds 5. Correct.
    UPDATE products 
    SET current_stock = current_stock - OLD.quantity_change, updated_at = NOW()
    WHERE id = OLD.product_id;
    
    RETURN OLD;

  -- CASE: UPDATE (Delta Logic)
  ELSIF TG_OP = 'UPDATE' THEN
    -- 1. Revert OLD
    UPDATE products 
    SET current_stock = current_stock - OLD.quantity_change 
    WHERE id = OLD.product_id;

    -- 2. Apply NEW
    -- Note: Handle product_id change change effectively (move stock from old product to new product if id changed, unlikely but safe)
    IF OLD.product_id != NEW.product_id THEN
       -- Logic above handled OLD product. Now handle NEW product.
       UPDATE products 
       SET current_stock = current_stock + NEW.quantity_change, updated_at = NOW()
       WHERE id = NEW.product_id;
    ELSE
       -- Same product, just apply new
       UPDATE products 
       SET current_stock = current_stock + NEW.quantity_change, updated_at = NOW()
       WHERE id = OLD.product_id;
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recreate Trigger for Inventory
DROP TRIGGER IF EXISTS trigger_update_product_stock ON inventory_movements;
CREATE TRIGGER trigger_update_product_stock
  AFTER INSERT OR UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION update_product_stock();

COMMIT;
