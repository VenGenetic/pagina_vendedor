-- RPC: Process Generic Double-Entry Transaction
-- Description: Creates a pair of transactions (Asset <-> Nominal) atomically.

CREATE OR REPLACE FUNCTION process_generic_transaction(
  p_type TEXT, -- 'INCOME' or 'EXPENSE'
  p_amount DECIMAL,
  p_description TEXT,
  p_account_id UUID, -- The Asset Account (Cash/Bank)
  p_payment_method TEXT,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_group_id UUID;
  v_transaction_id UUID;
  v_contra_account_id UUID;
  v_contra_name TEXT;
  v_contra_amount DECIMAL;
BEGIN
  -- 1. Setup
  v_group_id := uuid_generate_v4();
  
  -- 2. Determine Counterpart Logic
  IF p_type = 'EXPENSE' OR p_type = 'PURCHASE' THEN
    v_contra_name := 'DÉBITOS';
    v_contra_amount := -p_amount; -- If Expense is +100 (deducted from asset), Contra is -100 (added to Nominal Expense)
  ELSIF p_type = 'INCOME' THEN
    v_contra_name := 'CRÉDITOS';
    v_contra_amount := -p_amount; -- If Income is +100 (added to asset), Contra is -100 (added to Nominal Revenue??)
    -- Wait. Revenue accounts usually hold Credit balances (Negative in signed system, or Positive in some logic).
    -- In this system:
    -- INCOME trigger: balance += amount.
    -- We want CRÉDITOS balance to INCREASE (as Revenue).
    -- If we send -100. Trigger: balance += (-100). Balance decreases.
    -- So 'CRÉDITOS' account should probably be type 'LIABILITY' or 'INCOME'?
    -- Let's check 'accounts.type'.
    -- If type is 'INCOME', trigger adds amount.
    -- If we want Revenue to build up, we usually want it Positive or Negative?
    -- Standard accounting: Revenue is Credit (Negative).
    -- This system seems "Cash Basis" / "Intuitive": Income increases balance.
    -- So if CRÉDITOS is type 'INCOME', and we insert -100, its balance becomes -100.
    -- That represents $100 of Revenue in a signed system.
    -- This seems correct for "Sum = 0".
  ELSE
    RAISE EXCEPTION 'Unsupported transaction type for generic processor: %', p_type;
  END IF;

  -- 3. Get Counterpart Account ID
  SELECT id INTO v_contra_account_id FROM accounts WHERE name = v_contra_name LIMIT 1;
  IF v_contra_account_id IS NULL THEN
    RAISE EXCEPTION 'System Error: Master Account % not found.', v_contra_name;
  END IF;

  -- 4. Insert Primary Transaction (The User's view)
  INSERT INTO transactions (
    type, amount, description, 
    account_id, payment_method, reference_number,
    notes, created_at, created_by, group_id
  ) VALUES (
    p_type, p_amount, p_description,
    p_account_id, p_payment_method, p_reference_number,
    p_notes, NOW(), p_user_id, v_group_id
  ) RETURNING id INTO v_transaction_id;

  -- 5. Insert Mirror Transaction (The System's balance)
  INSERT INTO transactions (
    type, amount, description, 
    account_id, payment_method, reference_number,
    notes, created_at, created_by, group_id, is_manual_adjustment
  ) VALUES (
    p_type, v_contra_amount, p_description || ' (Contrapartida)',
    v_contra_account_id, p_payment_method, p_reference_number,
    'Auto-Generated Double Entry', NOW(), p_user_id, v_group_id, true
  );

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'group_id', v_group_id
  );
END;
$$;
