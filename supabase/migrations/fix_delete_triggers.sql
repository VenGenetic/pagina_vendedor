-- Fix update_product_stock to handle DELETE (Restores stock when movement is deleted)
CREATE OR REPLACE FUNCTION update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE products 
    SET current_stock = current_stock + NEW.quantity_change,
        updated_at = NOW()
    WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Reverse the change: 
    -- If it was OUT (-1), we subtract -1 which adds 1.
    -- If it was IN (+1), we subtract +1 which removes 1.
    UPDATE products 
    SET current_stock = current_stock - OLD.quantity_change,
        updated_at = NOW()
    WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Update trigger to include DELETE events
DROP TRIGGER IF EXISTS trigger_update_product_stock ON inventory_movements;
CREATE TRIGGER trigger_update_product_stock
  AFTER INSERT OR DELETE ON inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION update_product_stock();

-- Fix update_account_balance to handle DELETE (Restores balance when transaction is deleted)
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance + NEW.amount,
          updated_at = NOW()
      WHERE id = NEW.account_id;
    ELSIF NEW.type = 'EXPENSE' THEN
      UPDATE accounts 
      SET balance = balance - NEW.amount,
          updated_at = NOW()
      WHERE id = NEW.account_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Reverse the effect
    IF OLD.type = 'INCOME' THEN
      -- Income added money, so deleting it removes money
      UPDATE accounts 
      SET balance = balance - OLD.amount,
          updated_at = NOW()
      WHERE id = OLD.account_id;
    ELSIF OLD.type = 'EXPENSE' THEN
      -- Expense removed money, so deleting it adds money back
      UPDATE accounts 
      SET balance = balance + OLD.amount,
          updated_at = NOW()
      WHERE id = OLD.account_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Update trigger to include DELETE events
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();
