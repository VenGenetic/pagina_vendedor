-- Fix Transfer Function
-- Recreate the transfer_funds function with correct column names
-- Allows negative balances (no insufficient funds check)

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
BEGIN
  -- Validation
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo';
  END IF;
  
  IF p_source_account_id = p_destination_account_id THEN
    RAISE EXCEPTION 'Las cuentas de origen y destino deben ser diferentes';
  END IF;

  -- Nominal Account Segregation Check
  IF EXISTS (SELECT 1 FROM accounts WHERE id IN (p_source_account_id, p_destination_account_id) AND is_nominal = true) THEN
    RAISE EXCEPTION 'No se permiten transferencias entre cuentas nominales (Ingresos/Gastos)';
  END IF;

  -- Insert the Transfer Transaction
  -- The trigger will automatically update the balances
  INSERT INTO transactions (
    type,
    amount,
    description,
    account_id,
    account_out_id,
    account_in_id
  ) VALUES (
    'TRANSFER',
    p_amount,
    p_description,
    p_source_account_id,  -- Primary account reference
    p_source_account_id,  -- Source (money going out)
    p_destination_account_id  -- Destination (money coming in)
  ) RETURNING id INTO v_transaction_id;

  RETURN json_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
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
