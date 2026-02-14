-- Migration: Fix Double Entry & Unify Transfers (Refactored)
-- Date: 2026-02-15
-- Description: Consolidates balance triggers, removes conflicting Zero-Sum constraints, and implements Single-Record Transfer.

BEGIN;

-- =================================================================
-- 1. DROP CONFLICTING TRIGGERS & FUNCTIONS (CRITICAL FIX)
-- =================================================================
-- Remove the Zero-Sum constraint that requires multiple rows per group.
-- This is incompatible with the new Single-Row Transfer logic.
DROP TRIGGER IF EXISTS enforce_zero_sum_final ON public.transactions;
DROP TRIGGER IF EXISTS enforce_zero_sum ON public.transactions; -- Found via dependency error
DROP FUNCTION IF EXISTS public.check_transaction_group_balance() CASCADE;

-- Drop duplicate/legacy balance triggers
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS trg_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS update_account_balance_trigger ON transactions;
DROP TRIGGER IF EXISTS trg_auto_balance ON transactions; 
DROP TRIGGER IF EXISTS on_transaction_created ON transactions;

-- Drop deprecated functions
DROP FUNCTION IF EXISTS update_account_balance() CASCADE; 
DROP FUNCTION IF EXISTS auto_balance_transaction_trigger() CASCADE;

-- =================================================================
-- 2. SCHEMA UPDATE: SINGLE-ROW TRANSFER CONSTRAINTS
-- =================================================================
-- Ensure TRANSFER transactions have both legs defined and different
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS check_transfer_partners;

ALTER TABLE transactions 
ADD CONSTRAINT check_transfer_partners 
CHECK (
  type != 'TRANSFER' OR 
  (account_in_id IS NOT NULL AND account_out_id IS NOT NULL AND account_in_id != account_out_id)
);

-- =================================================================
-- 3. UNIFIED RECONCILIATION FUNCTION (Single Trigger Source of Truth)
-- =================================================================
-- =================================================================
-- 3. UNIFIED RECONCILIATION FUNCTION (Single Trigger Source of Truth)
-- =================================================================
CREATE OR REPLACE FUNCTION fn_reconcile_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Validations for TRANSFER (Double Check in Trigger)
    IF NEW.type = 'TRANSFER' THEN
        IF NEW.account_out_id IS NULL OR NEW.account_in_id IS NULL THEN
             RAISE EXCEPTION 'Transfer Transaction requires both account_out_id and account_in_id.';
        END IF;
    END IF;

    -- CASE: INSERT (New Transaction)
    IF TG_OP = 'INSERT' THEN
        -- INCOME: Increase Balance (Asset), Decrease Nominal (Revenue - Credit)
        IF NEW.type = 'INCOME' THEN
            -- Real Account (Debit/Asset Increase)
            UPDATE accounts 
            SET balance = balance + ABS(NEW.amount), updated_at = NOW()
            WHERE id = NEW.account_id;
            
            -- Nominal Account (Credit/Revenue Increase mirrored as negative)
            -- If account_out_id is provided (Standard for double entry)
            IF NEW.account_out_id IS NOT NULL THEN
                UPDATE accounts
                SET balance = balance - ABS(NEW.amount), updated_at = NOW()
                WHERE id = NEW.account_out_id;
            END IF;
        
        -- EXPENSE / PURCHASE: Decrease Balance (Asset), Increase Nominal (Expense - Debit)
        ELSIF NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE' THEN
             -- Real Account (Credit/Asset Decrease)
             UPDATE accounts 
             SET balance = balance - ABS(NEW.amount), updated_at = NOW()
             WHERE id = NEW.account_id;

             -- Nominal Account (Debit/Expense Increase)
             -- If account_in_id is provided (Standard for double entry)
             IF NEW.account_in_id IS NOT NULL THEN
                UPDATE accounts
                SET balance = balance + ABS(NEW.amount), updated_at = NOW()
                WHERE id = NEW.account_in_id;
             END IF;

        -- TRANSFER: Move Funds (Single Record Effect)
        ELSIF NEW.type = 'TRANSFER' THEN
             -- Debit Source (Decrease)
             UPDATE accounts 
             SET balance = balance - ABS(NEW.amount), updated_at = NOW()
             WHERE id = NEW.account_out_id;
             
             -- Credit Dest (Increase)
             UPDATE accounts 
             SET balance = balance + ABS(NEW.amount), updated_at = NOW()
             WHERE id = NEW.account_in_id;
        END IF;

    -- CASE: DELETE (Undo/Rollback)
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.type = 'INCOME' THEN
            -- Reverse Real
            UPDATE accounts SET balance = balance - ABS(OLD.amount), updated_at = NOW() WHERE id = OLD.account_id;
            -- Reverse Nominal
            IF OLD.account_out_id IS NOT NULL THEN
                UPDATE accounts SET balance = balance + ABS(OLD.amount), updated_at = NOW() WHERE id = OLD.account_out_id;
            END IF;

        ELSIF OLD.type = 'EXPENSE' OR OLD.type = 'PURCHASE' THEN
            -- Reverse Real
            UPDATE accounts SET balance = balance + ABS(OLD.amount), updated_at = NOW() WHERE id = OLD.account_id;
            -- Reverse Nominal
            IF OLD.account_in_id IS NOT NULL THEN
                UPDATE accounts SET balance = balance - ABS(OLD.amount), updated_at = NOW() WHERE id = OLD.account_in_id;
            END IF;

        ELSIF OLD.type = 'TRANSFER' THEN
            -- Reverse Transfer
            UPDATE accounts SET balance = balance + ABS(OLD.amount), updated_at = NOW() WHERE id = OLD.account_out_id;
            UPDATE accounts SET balance = balance - ABS(OLD.amount), updated_at = NOW() WHERE id = OLD.account_in_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Singleton Trigger
DROP TRIGGER IF EXISTS trg_singleton_account_reconciliation ON transactions;
CREATE TRIGGER trg_singleton_account_reconciliation
AFTER INSERT OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION fn_reconcile_account_balance();

-- =================================================================
-- 3.1 CONSTRAINT UPDATE: Allow Nominal Accounts to have Negative Balances
-- =================================================================
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS positive_balance;
-- Only Real accounts (is_nominal is false or null) must be positive.
-- Nominal accounts (is_nominal is true) can be negative (Revenue).
ALTER TABLE accounts ADD CONSTRAINT positive_real_balance 
CHECK (
    (is_nominal IS TRUE) OR (balance >= 0)
);

-- =================================================================
-- 4. UPDATE RPC: TRANSFER_FUNDS (Single Record)
-- =================================================================
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
  -- Validation
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo';
  END IF;
  
  IF p_source_account_id = p_destination_account_id THEN
    RAISE EXCEPTION 'Las cuentas de origen y destino deben ser diferentes';
  END IF;

  -- Insert SINGLE Transaction Record
  -- This single record represents the entire move.
  INSERT INTO transactions (
    type,
    amount,
    description,
    account_id,       -- Primary reference (Source) needed for FKs usually, or main visibility
    account_out_id,   -- Source (Money Leaves)
    account_in_id,    -- Dest (Money Enters)
    group_id,
    created_by,
    transaction_date
  ) VALUES (
    'TRANSFER',
    p_amount,
    p_description,
    p_source_account_id, 
    p_source_account_id,
    p_destination_account_id,
    v_group_id,
    p_user_id,
    NOW()
  ) RETURNING id INTO v_transaction_id;

  RETURN json_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'group_id', v_group_id,
    'message', 'Transferencia registrada exitosamente'
  );
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 5. UPDATE REVERSAL RPC (Handle Single-Row TRANSFER)
-- =================================================================
CREATE OR REPLACE FUNCTION rpc_reverse_transaction(
  p_transaction_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Reversión solicitada por usuario'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_original_tx RECORD;
  v_group_id UUID;
  v_reversal_group_id UUID;
  v_r RECORD;
  v_user_name TEXT;
  v_new_type TEXT;
  v_new_out UUID;
  v_new_in UUID;
BEGIN
  -- 1. Get User Name
  SELECT COALESCE(full_name, auth.users.email, 'System') INTO v_user_name 
  FROM auth.users LEFT JOIN public.admins ON auth.users.id = admins.auth_id 
  WHERE auth.users.id = p_user_id;

  -- 2. Validate Target Transaction
  SELECT * INTO v_original_tx FROM public.transactions WHERE id = p_transaction_id;
  IF v_original_tx IS NULL THEN
    RAISE EXCEPTION 'Transaction NOT FOUND: %', p_transaction_id;
  END IF;

  v_group_id := v_original_tx.group_id;
  IF v_group_id IS NULL THEN
     v_group_id := uuid_generate_v4(); 
  END IF;
  
  -- 3. Check Already Reversed
  IF v_original_tx.is_reversed THEN
       RETURN jsonb_build_object('success', false, 'message', 'Transaction already reversed.');
  END IF;

  v_reversal_group_id := uuid_generate_v4();

  -- 4. Reversal Loop
  FOR v_r IN SELECT * FROM public.transactions WHERE (group_id = v_original_tx.group_id) OR (id = p_transaction_id) LOOP
      
      -- Logic: Reverse the logic of the original transaction
      IF v_r.type = 'TRANSFER' THEN
          v_new_type := 'TRANSFER';
          v_new_out := v_r.account_in_id; -- Swap
          v_new_in := v_r.account_out_id; -- Swap
      ELSIF v_r.type = 'INCOME' THEN
          v_new_type := 'EXPENSE';
          v_new_out := NULL; v_new_in := NULL;
      ELSE -- EXPENSE / PURCHASE
          v_new_type := 'INCOME';
          v_new_out := NULL; v_new_in := NULL;
      END IF;

      INSERT INTO public.transactions (
          type, 
          amount, 
          description, 
          account_id, 
          account_in_id,
          account_out_id,
          payment_method, 
          reference_number, 
          notes, 
          created_at, 
          created_by, 
          created_by_name,
          group_id, 
          related_transaction_id,
          is_manual_adjustment,
          transaction_date
      ) VALUES (
          v_new_type,
          v_r.amount,
          'Reversión: ' || v_r.description,
          v_r.account_id,
          v_new_in,  
          v_new_out, 
          v_r.payment_method,
          'REV-' || COALESCE(v_r.reference_number, ''),
          p_reason,
          NOW(),
          p_user_id,
          v_user_name,
          v_reversal_group_id,
          v_r.id,
          TRUE,
          NOW()
      );
      
      UPDATE public.transactions SET is_reversed = TRUE WHERE id = v_r.id;

  END LOOP;

  -- 5. Async Inventory Restoration (if linked)
  IF v_original_tx.reference_number IS NOT NULL THEN
      PERFORM public.restore_inventory_for_reversal(v_original_tx.reference_number, p_user_id, v_user_name, v_reversal_group_id);
  END IF;

  RETURN jsonb_build_object(
      'success', true, 
      'reversal_group_id', v_reversal_group_id,
      'message', 'Transaction Reversed Successfully'
  );
END;
$$;


-- =================================================================
-- 6. UPDATE GENERIC TRANSACTION RPC (Support Single-Row Double Entry)
-- =================================================================
CREATE OR REPLACE FUNCTION process_generic_transaction(
  p_type TEXT, -- 'INCOME' or 'EXPENSE'
  p_amount DECIMAL,
  p_description TEXT,
  p_account_id UUID, -- The Asset Account (Real)
  p_payment_method TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL -- New: Nominal Account ID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_group_id UUID;
  v_transaction_id UUID;
BEGIN
  -- 1. Setup
  v_group_id := uuid_generate_v4();

  -- 2. Insert Single Transaction
  -- The trigger 'fn_reconcile_account_balance' will handle the balance updates for BOTH accounts.
  
  IF p_type = 'EXPENSE' THEN
      INSERT INTO transactions (
        type, amount, description, 
        account_id,        -- Real Account (Source)
        account_in_id,     -- Nominal Account (Destination/Category)
        payment_method, reference_number,
        notes, created_at, created_by, group_id
      ) VALUES (
        p_type, p_amount, p_description,
        p_account_id, 
        p_category_id,     -- Set as account_in_id
        p_payment_method, p_reference_number,
        p_notes, NOW(), p_user_id, v_group_id
      ) RETURNING id INTO v_transaction_id;

  ELSIF p_type = 'INCOME' THEN
      INSERT INTO transactions (
        type, amount, description, 
        account_id,        -- Real Account (Destination)
        account_out_id,    -- Nominal Account (Source/Category)
        payment_method, reference_number,
        notes, created_at, created_by, group_id
      ) VALUES (
        p_type, p_amount, p_description,
        p_account_id,
        p_category_id,     -- Set as account_out_id
        p_payment_method, p_reference_number,
        p_notes, NOW(), p_user_id, v_group_id
      ) RETURNING id INTO v_transaction_id;
      
  ELSE
    RAISE EXCEPTION 'Unsupported transaction type: %', p_type;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'group_id', v_group_id
  );
END;
$$;

COMMIT;


-- =================================================================
-- DEBUG: DRY RUN VERIFICATION (Uncomment to Test manually)
-- =================================================================
/*
DO $$
DECLARE
    v_src UUID;
    v_dest UUID;
    v_before_src DECIMAL;
    v_before_dest DECIMAL;
    v_after_src DECIMAL;
    v_after_dest DECIMAL;
    v_res JSON;
BEGIN
    -- Select two random accounts
    SELECT id INTO v_src FROM accounts LIMIT 1;
    SELECT id INTO v_dest FROM accounts WHERE id != v_src LIMIT 1;
    
    SELECT balance INTO v_before_src FROM accounts WHERE id = v_src;
    SELECT balance INTO v_before_dest FROM accounts WHERE id = v_dest;
    
    RAISE NOTICE 'Before: Src=% ($%), Dest=% ($%)', v_src, v_before_src, v_dest, v_before_dest;
    
    -- Execute Transfer
    v_res := transfer_funds(v_src, v_dest, 10.00, 'Test Transfer');
    RAISE NOTICE 'Transfer Result: %', v_res;
    
    SELECT balance INTO v_after_src FROM accounts WHERE id = v_src;
    SELECT balance INTO v_after_dest FROM accounts WHERE id = v_dest;
    
    RAISE NOTICE 'After: Src=$%, Dest=$%', v_after_src, v_after_dest;
    
    IF v_after_src = v_before_src - 10 AND v_after_dest = v_before_dest + 10 THEN
        RAISE NOTICE 'SUCCESS: Balances updated correctly!';
    ELSE
        RAISE EXCEPTION 'FAILURE: Balances did not update correctly';
    END IF;
    
    -- Rollback everything for the test
    RAISE EXCEPTION 'Dry Run Completed Successfully (Rolling back changes impact)';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '%', SQLERRM;
END;
$$;
*/
