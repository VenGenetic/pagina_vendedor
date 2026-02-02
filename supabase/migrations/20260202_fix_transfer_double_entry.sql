-- Migration: Correct Double Entry for Transfers
-- Description: Splits Transfers into two rows (Source/Dest) to ensure Sum(Amount) = 0.

-- 0. SCHEMA FIX: Add is_manual_adjustment column AND Drop Positive Check
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'is_manual_adjustment') THEN 
        ALTER TABLE transactions ADD COLUMN is_manual_adjustment BOOLEAN DEFAULT FALSE;
    END IF;

    -- Drop constraint that prevents negative values (Required for Double Entry)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positive_amount') THEN
        ALTER TABLE transactions DROP CONSTRAINT positive_amount;
    END IF;
END $$;

-- 1. UPDATE BALANCE TRIGGER LOGIC
-- We change 'TRANSFER' logic to be single-sided (Expense-like).
-- This implies that a Transfer is now TWO rows in the transactions table.

CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- CASE: INSERT (New Transaction)
  IF TG_OP = 'INSERT' THEN
    
    -- INCOME: Add to Account
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- EXPENSE: Subtract from Account
    ELSIF NEW.type = 'EXPENSE' THEN
      UPDATE accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- TRANSFER: NOW TREATED AS SINGLE-SIDED SUBTRACTION (Like Expense)
    -- Logic: Positive amount means money leaving the account_id.
    -- Logic: Negative amount means money entering the account_id (Refund/Contra).
    ELSIF NEW.type = 'TRANSFER' THEN
      UPDATE accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
      
    END IF;

    RETURN NEW;

  -- CASE: DELETE (Undo Transaction)
  ELSIF TG_OP = 'DELETE' THEN
    
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance - OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_id;
      
    ELSIF OLD.type = 'EXPENSE' THEN
      UPDATE accounts 
      SET balance = balance + OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_id;
      
    ELSIF OLD.type = 'TRANSFER' THEN
      -- Undo Subtraction -> Add
      UPDATE accounts 
      SET balance = balance + OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_id;
    END IF;

    RETURN OLD;

  -- CASE: UPDATE (Delta Logic)
  ELSIF TG_OP = 'UPDATE' THEN
    -- Simplified Delta Approach
    -- 1. Undo Old
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
    ELSIF OLD.type IN ('EXPENSE', 'TRANSFER') THEN
      UPDATE accounts SET balance = balance + OLD.amount WHERE id = OLD.account_id;
    END IF;

    -- 2. Apply New
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance + NEW.amount WHERE id = NEW.account_id;
    ELSIF NEW.type IN ('EXPENSE', 'TRANSFER') THEN
      UPDATE accounts SET balance = balance - NEW.amount WHERE id = NEW.account_id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- 2. UPDATE AUTO-BALANCE TRIGGER
-- Add logic to split TRANSFER into two rows.

CREATE OR REPLACE FUNCTION auto_balance_transaction_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_contra_account_id UUID;
    v_new_group_id UUID;
    v_dest_account_id UUID;
BEGIN
    -- Only act if group_id is MISSING (Implies legacy/direct insert) OR if it is a TRANSFER (Always split)
    -- NOTE: Even if RPC provided group_id for a Transfer, we likely still have a SINGLE ROW (from old RPC logic).
    -- So for Transfers, we ALWAYS intervene to ensure the second row exists?
    -- No, if RPC creates 2 rows, we shouldn't create a 3rd.
    -- But our current RPC `transfer_funds` creates 1 row.
    -- So we MUST intervene for Transfers.
    
    IF NEW.group_id IS NULL OR NEW.type = 'TRANSFER' THEN
    
        -- Generate ID if needed
        IF NEW.group_id IS NULL THEN
             v_new_group_id := uuid_generate_v4();
             NEW.group_id := v_new_group_id;
        ELSE
             v_new_group_id := NEW.group_id; -- Use existing
        END IF;

        -- CASE 1: EXPENSE / PURCHASE (Existing Logic)
        IF (NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE') AND NEW.description NOT LIKE '%(Auto-Balance)%' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'DÉBITOS';
            
            INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
            ) VALUES (
                NEW.type,
                -NEW.amount,
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
            
        -- CASE 2: INCOME (Existing Logic)
        ELSIF NEW.type = 'INCOME' AND NEW.description NOT LIKE '%(Auto-Balance)%' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'CRÉDITOS';
            
            INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
            ) VALUES (
                NEW.type,
                -NEW.amount,
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
            
        -- CASE 3: TRANSFER (NEW LOGIC)
        -- We see specific description flag to detect if we already created the sibling?
        -- Or just check if we are the "Source" leg.
        -- We assume the Inserted Row is the Source Leg (account_id = source).
        -- We need to create the Destination Leg.
        ELSIF NEW.type = 'TRANSFER' AND NEW.description NOT LIKE '%(Entrada)%' AND NEW.account_in_id IS NOT NULL THEN
            
            -- Prevent recursion: If account_id == account_in_id, it might be the sibling we just created?
            -- No, sibling should use account_id = Dest.
            
            -- Check if sibling already exists? 
            -- (Optimization: Just insert. If loop, we need a stop condition).
            -- We add '(Entrada)' to description of sibling.
            
            INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
            ) VALUES (
                'TRANSFER',
                -NEW.amount, -- Negative Amount (Counterpart)
                NEW.description || ' (Entrada)',
                NEW.account_in_id, -- Destination Account
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


-- 3. RETROACTIVE FIX for TRANSFERS
DO $$
DECLARE
    r RECORD;
    v_fix_group_id UUID;
BEGIN
    -- Find Transfers that are "Single Row" (Positive Amount)
    -- We assume they are single row if we don't see a sibling with same group_id.
    -- Or simpler: If they have account_in_id set, we ensure the sibling exists.
    
    FOR r IN SELECT * FROM transactions WHERE type = 'TRANSFER' AND amount > 0 AND account_in_id IS NOT NULL
    LOOP
        -- Check if sibling exists
        -- (Look for negative amount with same group_id? Or just by heuristic)
        -- If group_id is null, we definitely need to fix.
        
        IF r.group_id IS NULL THEN
            v_fix_group_id := uuid_generate_v4();
            UPDATE transactions SET group_id = v_fix_group_id WHERE id = r.id;
        ELSE
            v_fix_group_id := r.group_id;
        END IF;

        -- Attempt to insert sibling if not exists
        IF NOT EXISTS (SELECT 1 FROM transactions WHERE group_id = v_fix_group_id AND amount < 0) THEN
             INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
            ) VALUES (
                'TRANSFER',
                -r.amount,
                r.description || ' (Entrada)',
                r.account_in_id,
                r.payment_method,
                r.reference_number,
                'Retroactive Transfer Split',
                r.created_at,
                r.created_by,
                v_fix_group_id,
                true
            );
        END IF;
        
    END LOOP;
END $$;
