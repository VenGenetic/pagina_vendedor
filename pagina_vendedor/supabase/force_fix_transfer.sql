-- FORCE FIX: Transfer Logic
-- Run this script in your Supabase SQL Editor to guarantee the fix is applied.

BEGIN;

-- 1. DROP ALL POTENTIAL CONFLICTING TRIGGERS (Aggressive Cleanup)
DROP TRIGGER IF EXISTS enforce_zero_sum_final ON public.transactions;
DROP TRIGGER IF EXISTS enforce_zero_sum ON public.transactions;
DROP FUNCTION IF EXISTS public.check_transaction_group_balance() CASCADE;

DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS trg_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS update_account_balance_trigger ON transactions;
DROP TRIGGER IF EXISTS trg_auto_balance ON transactions; 
DROP TRIGGER IF EXISTS on_transaction_created ON transactions;

-- 2. ENSURE NEW CONSTRAINT IS PRESENT
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS check_transfer_partners;
ALTER TABLE transactions 
ADD CONSTRAINT check_transfer_partners 
CHECK (
  type != 'TRANSFER' OR 
  (account_in_id IS NOT NULL AND account_out_id IS NOT NULL AND account_in_id != account_out_id)
);

-- 3. RECREATE RECONCILIATION FUNCTION (Single Source of Truth)
CREATE OR REPLACE FUNCTION fn_reconcile_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'TRANSFER' THEN
        IF NEW.account_out_id IS NULL OR NEW.account_in_id IS NULL THEN
             RAISE EXCEPTION 'Transfer Transaction requires both account_out_id and account_in_id.';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.type = 'INCOME' THEN
            UPDATE accounts SET balance = balance + ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_id;
        ELSIF NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE' THEN
             UPDATE accounts SET balance = balance - ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_id;
        ELSIF NEW.type = 'TRANSFER' THEN
             UPDATE accounts SET balance = balance - ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_out_id;
             UPDATE accounts SET balance = balance + ABS(NEW.amount), updated_at = NOW() WHERE id = NEW.account_in_id;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.type = 'INCOME' THEN
            UPDATE accounts SET balance = balance - ABS(OLD.amount), updated_at = NOW() WHERE id = OLD.account_id;
        ELSIF OLD.type = 'EXPENSE' OR OLD.type = 'PURCHASE' THEN
            UPDATE accounts SET balance = balance + ABS(OLD.amount), updated_at = NOW() WHERE id = OLD.account_id;
        ELSIF OLD.type = 'TRANSFER' THEN
            UPDATE accounts SET balance = balance + ABS(OLD.amount), updated_at = NOW() WHERE id = OLD.account_out_id;
            UPDATE accounts SET balance = balance - ABS(OLD.amount), updated_at = NOW() WHERE id = OLD.account_in_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. APPLY TRIGGER
DROP TRIGGER IF EXISTS trg_singleton_account_reconciliation ON transactions;
CREATE TRIGGER trg_singleton_account_reconciliation
AFTER INSERT OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION fn_reconcile_account_balance();

-- 5. UPDATE RPC
CREATE OR REPLACE FUNCTION transfer_funds(
  p_source_account_id UUID,
  p_destination_account_id UUID,
  p_amount DECIMAL,
  p_description TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_transaction_id UUID;
  v_group_id UUID := uuid_generate_v4();
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser positivo'; END IF;
  IF p_source_account_id = p_destination_account_id THEN RAISE EXCEPTION 'Las cuentas de origen y destino deben ser diferentes'; END IF;

  INSERT INTO transactions (
    type, amount, description, account_id, account_out_id, account_in_id, group_id, created_by, transaction_date
  ) VALUES (
    'TRANSFER', p_amount, p_description, p_source_account_id, p_source_account_id, p_destination_account_id, v_group_id, p_user_id, NOW()
  ) RETURNING id INTO v_transaction_id;

  RETURN json_build_object('success', true, 'transaction_id', v_transaction_id, 'message', 'Transferencia exitosa');
END;
$$ LANGUAGE plpgsql;

COMMIT;
