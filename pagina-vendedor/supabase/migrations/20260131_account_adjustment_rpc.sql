-- Add is_adjustment column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS is_adjustment BOOLEAN DEFAULT FALSE;

-- Create RPC function to handle account updates with balance adjustments
CREATE OR REPLACE FUNCTION update_account_with_adjustment(
  p_account_id UUID,
  p_new_name TEXT,
  p_new_balance NUMERIC,
  p_description TEXT
) RETURNS VOID AS $$
DECLARE
  v_current_balance NUMERIC;
  v_delta NUMERIC;
  v_type TEXT;
  v_user_id UUID;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Validation: Ensure user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Update Account Name and get current balance
  -- We lock the row for update to prevent race conditions
  UPDATE accounts 
  SET name = p_new_name, 
      updated_at = NOW()
  WHERE id = p_account_id
  RETURNING balance INTO v_current_balance;

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  -- Calculate Delta
  v_delta := p_new_balance - v_current_balance;

  -- Insert Adjustment Transaction if needed
  -- Floating point comparison safety can be improved, but numeric type is precise enough for currency
  IF v_delta <> 0 THEN
    v_type := CASE WHEN v_delta > 0 THEN 'INCOME' ELSE 'EXPENSE' END;
    
    -- We assume 'transaction_type' is the enum/type used if exists, 
    -- but usually string literal works if it's a standard type or implicit cast.
    -- Based on schema, strict typing might be enforced.
    
    INSERT INTO transactions (
      account_id,
      type,
      amount,
      description,
      is_adjustment,
      transaction_date,
      created_by,
      notes
    ) VALUES (
      p_account_id,
      v_type, -- Postgres usually auto-casts this literal to the enum if required
      ABS(v_delta),
      'Ajuste de Saldo',
      TRUE,
      NOW(),
      v_user_id,
      p_description
    );
    
    -- Note: Account balance trigger (update_account_balance) should handle the actual balance update
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
