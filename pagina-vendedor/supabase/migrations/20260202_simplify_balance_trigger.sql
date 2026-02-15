-- Migration: Simplify Balance Trigger (Type-Agnostic / Signed Ledger)
-- Date: 2026-02-02
-- Description: 
-- 1. Migrates legacy 'EXPENSE' and 'TRANSFER' (Source) transactions to be NEGATIVE.
-- 2. Updates Auto-Balance Trigger to generate NEGATIVE Source Transfers.
-- 3. Replaces Account Balance Trigger with a simple "Always ADD" logic.

BEGIN;

-- 1. DATA MIGRATION: Convert Unsigned (Positive) Expenses/Transfers to Signed (Negative)
--    We only touch rows that are Positive (>0). 
--    Note: Revenue (INCOME) is already negative in recent double-entry logic, but legacy INCOME is positive (Asset).
--    Asset INCOME should stay positive. 
--    Revenue INCOME should be negative (handled by recent sales update).
--    Ref: EXPENSE should be negative (Money Out).
--    Ref: TRANSFER (Source) should be negative (Money Out).

UPDATE transactions
SET amount = -amount
WHERE amount > 0 
  AND (type = 'EXPENSE' OR type = 'TRANSFER'); 

-- 2. UPDATE AUTO-BALANCE TRIGGER (Handle Transfers with Signs)
CREATE OR REPLACE FUNCTION auto_balance_transaction_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_contra_account_id UUID;
    v_new_group_id UUID;
BEGIN
    if NEW.group_id IS NULL OR NEW.type = 'TRANSFER' THEN
        -- Generate Group ID
        IF NEW.group_id IS NULL THEN
             v_new_group_id := uuid_generate_v4();
             NEW.group_id := v_new_group_id;
        ELSE
             v_new_group_id := NEW.group_id;
        END IF;

        -- CASE 1: EXPENSE / PURCHASE
        -- If we inserted a NEGATIVE amount (Standard), Contra should be POSITIVE.
        -- If we inserted a POSITIVE amount (Legacy/Mistake?), Contra should be NEGATIVE?
        -- We assume NEW input conforms to "Money Out = Negative".
        IF (NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE') AND NEW.description NOT LIKE '%(Auto-Balance)%' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'DÉBITOS';
            
            INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
            ) VALUES (
                NEW.type,
                -1 * NEW.amount, -- Flip Sign (e.g. -50 -> +50 for Debit)
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
        -- Input +100 (Asset). Contra should be -100 (Credit).
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
        -- Input: Source Leg. Should be NEGATIVE (Money Out).
        -- Output: Dest Leg. Should be POSITIVE (Money In).
        ELSIF NEW.type = 'TRANSFER' AND NEW.description NOT LIKE '%(Entrada)%' AND NEW.account_in_id IS NOT NULL THEN
            
            -- Insert the Destination Leg (Counterpart)
            INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
            ) VALUES (
                'TRANSFER',
                -1 * NEW.amount, -- Flip Sign (-100 -> +100)
                NEW.description || ' (Entrada)',
                NEW.account_in_id, -- Destination
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

-- 3. REPLACE BALANCE UPDATE TRIGGER (The Core Fix)
-- "Type-Agnostic" / "Math is math"

DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS update_account_balance_trigger ON transactions;

CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- CASE: INSERT -> ADD
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

COMMIT;
