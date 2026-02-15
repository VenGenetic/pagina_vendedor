-- Add Delete/Revert Transaction Function
-- This function reverts a transaction's effects on account balances and then deletes it

CREATE OR REPLACE FUNCTION delete_transaction(
  p_transaction_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_transaction RECORD;
  v_result JSON;
BEGIN
  -- Get the transaction to delete
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id;

  -- Check if transaction exists
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Transacción no encontrada'
    );
  END IF;

  -- Revert the transaction effects based on type
  CASE v_transaction.type
    -- For INCOME: Subtract the amount from the account (reverse the addition)
    WHEN 'INCOME' THEN
      IF v_transaction.account_id IS NOT NULL THEN
        UPDATE accounts
        SET balance = balance - v_transaction.amount,
            updated_at = NOW()
        WHERE id = v_transaction.account_id;
      END IF;

    -- For EXPENSE: Add the amount back to the account (reverse the subtraction)
    WHEN 'EXPENSE' THEN
      IF v_transaction.account_id IS NOT NULL THEN
        UPDATE accounts
        SET balance = balance + v_transaction.amount,
            updated_at = NOW()
        WHERE id = v_transaction.account_id;
      END IF;

    -- For TRANSFER: Reverse both movements
    WHEN 'TRANSFER' THEN
      -- Add back to source account (reverse the deduction)
      IF v_transaction.account_out_id IS NOT NULL THEN
        UPDATE accounts
        SET balance = balance + v_transaction.amount,
            updated_at = NOW()
        WHERE id = v_transaction.account_out_id;
      END IF;
      
      -- Subtract from destination account (reverse the addition)
      IF v_transaction.account_in_id IS NOT NULL THEN
        UPDATE accounts
        SET balance = balance - v_transaction.amount,
            updated_at = NOW()
        WHERE id = v_transaction.account_in_id;
      END IF;
  END CASE;

  -- Delete the transaction
  DELETE FROM transactions WHERE id = p_transaction_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Transacción revertida y eliminada exitosamente'
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
GRANT EXECUTE ON FUNCTION delete_transaction TO authenticated;
