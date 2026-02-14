-- Migration: Fix Transfer RPC Sign
-- Description: Ensures transfer_funds inserts a NEGATIVE amount for the source account (Outflow).
-- This fixes the issue where transfers were appearing as positive inputs in the source account.
--
-- ============================================
-- BPMN Reference: Financial_Management_Process.bpmn
-- Flow: Transfer Flow (Full Saga Pattern)
-- ============================================
-- Tasks Implemented:
--   Activity_TransferSourceDebit: Debit Source Account (negative amount)
--   Activity_TransferDestCredit: Credit Destination Account (via trigger)
--
-- Compensation: PostgreSQL ACID ensures atomicity - both succeed or both fail.
-- Manual Intervention: N/A (database-level transactional guarantees)
-- ============================================

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
  v_group_id UUID;
BEGIN
  -- Validation
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo';
  END IF;
  
  IF p_source_account_id = p_destination_account_id THEN
    RAISE EXCEPTION 'Las cuentas de origen y destino deben ser diferentes';
  END IF;

  -- Generate Group ID for the Transfer Pair
  v_group_id := uuid_generate_v4();

  -- Note: Double Entry logic is handled by the 'auto_balance_transaction_trigger'
  -- We insert the SOURCE side (Outflow) -> Must be NEGATIVE
  
  INSERT INTO transactions (
    type,
    amount,
    description,
    account_id,
    account_out_id,
    account_in_id,
    group_id,
    created_by,
    is_manual_adjustment
  ) VALUES (
    'TRANSFER',
    -1 * p_amount, -- SIGN FLIP: Outflow is Negative
    p_description,
    p_source_account_id,  -- Linked to Source Account
    p_source_account_id,  -- Meta: Out
    p_destination_account_id,  -- Meta: In
    v_group_id,
    p_user_id,
    false
  ) RETURNING id INTO v_transaction_id;

  -- The Trigger will detect this 'TRANSFER' and create the destination leg 
  -- IF the logic in 'auto_balance_transaction_trigger' is enabled.
  -- Current trigger logic (from fix_and_verify_all.sql):
  -- "ELSIF NEW.type = 'TRANSFER' AND NEW.description NOT LIKE '%(Entrada)%' ..."
  -- It creates the sibling with "-1 * NEW.amount"
  -- If NEW.amount is -100, Sibling amount is +100.
  -- Sibling Account is NEW.account_in_id (Destination).
  -- This is CORRECT.

  RETURN json_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'group_id', v_group_id,
    'message', 'Transferencia completada exitosamente'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;
