-- Migration: Simplify Balance Trigger (Type-Agnostic) - V3 (Safe Group Migration)
-- Description: 
-- 1. Safely migrates legacy Positive groups to Negative (Signed) groups by flipping the ENTIRE group.
--    This preserves the Sum=0 property.
-- 2. Updates Auto-Balance Trigger.
-- 3. Installs the Type-Agnostic "Always Add" Balance Trigger.

BEGIN;

-- 0. TEMPORARY SAFETY: Disable Zero-Sum Check to prevent intermediate state errors
--    (Though our Math logic is sound, Postgres row-by-row updates might trip deferred checks in some complex cases)
ALTER TABLE transactions DISABLE TRIGGER enforce_zero_sum;

-- 1. DATA MIGRATION: 
--    Find groups that contain "Legacy Positive Expenses/Transfers".
--    Flip the sign of ALL rows in those groups to maintain Zero Sum.
--    (e.g. [+100 Expense, -100 Contra] -> [-100 Expense, +100 Contra])

UPDATE transactions
SET amount = -1 * amount
WHERE group_id IN (
    SELECT DISTINCT group_id 
    FROM transactions 
    WHERE amount > 0 
      AND (type IN ('EXPENSE', 'TRANSFER'))
);

-- 2. UPDATE AUTO-BALANCE TRIGGER (Correct Signs for Future)
CREATE OR REPLACE FUNCTION auto_balance_transaction_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_contra_account_id UUID;
    v_new_group_id UUID;
BEGIN
    IF NEW.group_id IS NULL OR NEW.type = 'TRANSFER' THEN
        -- Generate Group ID
        IF NEW.group_id IS NULL THEN
             v_new_group_id := uuid_generate_v4();
             NEW.group_id := v_new_group_id;
        ELSE
             v_new_group_id := NEW.group_id;
        END IF;

        -- CASE 1: EXPENSE / PURCHASE
        IF (NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE') AND NEW.description NOT LIKE '%(Auto-Balance)%' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'DÉBITOS';
            
            INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
            ) VALUES (
                NEW.type,
                -1 * NEW.amount, -- Contra
                NEW.description || ' (Auto-Balance)',
                v_contra_account_id,
                NEW.payment_method,
                NEW.reference_number,
                'System Auto-Balance Trigger',
                NOW(),
                NEW.created_by,
                v_new_group_id,
                true
            );
            
        -- CASE 2: INCOME
        ELSIF NEW.type = 'INCOME' AND NEW.description NOT LIKE '%(Auto-Balance)%' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'CRÉDITOS';
            
            INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
            ) VALUES (
                NEW.type,
                -1 * NEW.amount,
                NEW.description || ' (Auto-Balance)',
                v_contra_account_id,
                NEW.payment_method,
                NEW.reference_number,
                'System Auto-Balance Trigger',
                NOW(),
                NEW.created_by,
                v_new_group_id,
                true
            );
            
        -- CASE 3: TRANSFER
        ELSIF NEW.type = 'TRANSFER' AND NEW.description NOT LIKE '%(Entrada)%' AND NEW.account_in_id IS NOT NULL THEN
            INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
            ) VALUES (
                'TRANSFER',
                -1 * NEW.amount, 
                NEW.description || ' (Entrada)',
                NEW.account_in_id,
                NEW.payment_method,
                NEW.reference_number,
                'Transfer Auto-Split',
                NOW(),
                NEW.created_by,
                v_new_group_id,
                true
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. REPLACE BALANCE UPDATE TRIGGER (Type-Agnostic / Always Add)

DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS update_account_balance_trigger ON transactions;

CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- CASE: INSERT -> ADD (Sign does the work)
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

CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

-- 4. RE-ENABLE SAFETY
ALTER TABLE transactions ENABLE TRIGGER enforce_zero_sum;

COMMIT;
