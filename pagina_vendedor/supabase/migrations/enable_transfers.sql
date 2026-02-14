-- Migration: Enable Transfers between accounts
-- Description: Adds columns, updates constraints, modifies trigger, and adds a helper function.

-- 1. Add columns for Transfer support (if they don't exist yet)
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS account_in_id UUID REFERENCES public.accounts(id),
ADD COLUMN IF NOT EXISTS account_out_id UUID REFERENCES public.accounts(id);

-- 2. Update the Type Check Constraint to include 'TRANSFER'
-- First, try to drop the existing constraint. 
-- Note: The name might vary, but 'transactions_type_check' is the default standard naming.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

-- Re-add the constraint with TRANSFER
ALTER TABLE public.transactions 
ADD CONSTRAINT transactions_type_check 
CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER'));

-- 3. Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_transactions_account_in ON public.transactions(account_in_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_out ON public.transactions(account_out_id);

-- 4. Update the Trigger Function to handle TRANSFERS
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'INCOME' THEN
    UPDATE accounts 
    SET balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_id;
  
  ELSIF NEW.type = 'EXPENSE' THEN
    UPDATE accounts 
    SET balance = balance - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_id;
    
  ELSIF NEW.type = 'TRANSFER' THEN
    -- Validation: Ensure both accounts are provided
    IF NEW.account_in_id IS NULL OR NEW.account_out_id IS NULL THEN
      RAISE EXCEPTION 'Transfers require both account_in_id and account_out_id';
    END IF;
  
    -- Deduct from Source (account_out_id)
    UPDATE accounts 
    SET balance = balance - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_out_id;
    
    -- Add to Destination (account_in_id)
    UPDATE accounts 
    SET balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_in_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create a Helper RPC Function for easy frontend calls
-- This function performs the transfer safely in one call
CREATE OR REPLACE FUNCTION transfer_funds(
  p_source_account_id UUID,
  p_destination_account_id UUID,
  p_amount DECIMAL,
  p_description TEXT,
  p_user_id UUID DEFAULT NULL -- Optional, for audit
)
RETURNS JSON AS $$
DECLARE
  v_source_balance DECIMAL;
  v_transaction_id UUID;
BEGIN
  -- Check for negative verification
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Check source balance
  SELECT balance INTO v_source_balance FROM accounts WHERE id = p_source_account_id;
  IF v_source_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient funds in source account';
  END IF;

  -- Insert the Transfer Transaction
  -- We set account_id = source_account_id for basic compatibility
  INSERT INTO transactions (
    type,
    amount,
    description,
    account_id,        -- Primary link (usually source)
    account_out_id,    -- Detailed source
    account_in_id,     -- Detailed destination
    created_by,        -- From auth (if column exists from previous fixes)
    transaction_date
  ) VALUES (
    'TRANSFER',
    p_amount,
    p_description,
    p_source_account_id,
    p_source_account_id,
    p_destination_account_id,
    p_user_id,
    NOW()
  ) RETURNING id INTO v_transaction_id;

  RETURN json_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'message', 'Transfer completed successfully'
  );
END;
$$ LANGUAGE plpgsql;
