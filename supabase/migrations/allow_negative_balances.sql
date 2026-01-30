-- Allow Negative Balances
-- Removes the insufficient funds check from transfer functions
-- This allows accounts to go into negative balance (overdraft)

-- Update the original transfer_funds function (from enable_transfers.sql)
CREATE OR REPLACE FUNCTION transfer_funds(
  p_source_account_id UUID,
  p_destination_account_id UUID,
  p_amount DECIMAL,
  p_description TEXT DEFAULT 'Transferencia entre cuentas'
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
BEGIN
  -- Check for negative amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Note: Removed balance check - negative balances are now allowed

  -- Insert the Transfer Transaction
  -- We set account_id = source_account_id for basic compatibility
  INSERT INTO transactions (
    type,
    amount,
    description,
    account_id,        -- Primary link (usually source)
    account_out_id,    -- Detailed source
    account_in_id,     -- Detailed destination
    created_at
  ) VALUES (
    'TRANSFER',
    p_amount,
    p_description,
    p_source_account_id,
    p_source_account_id,
    p_destination_account_id,
    NOW()
  ) RETURNING id INTO v_transaction_id;

  -- Deduct from source account (now can go negative)
  UPDATE accounts 
  SET balance = balance - p_amount,
      updated_at = NOW()
  WHERE id = p_source_account_id;

  -- Add to destination account
  UPDATE accounts 
  SET balance = balance + p_amount,
      updated_at = NOW()
  WHERE id = p_destination_account_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Also update the newer version if it exists
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

  -- Note: No balance validation - negative balances are allowed

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
    p_source_account_id,
    p_source_account_id,
    p_destination_account_id
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

-- Grant access
GRANT EXECUTE ON FUNCTION transfer_funds(UUID, UUID, DECIMAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_funds(UUID, UUID, DECIMAL, TEXT, UUID) TO authenticated;
