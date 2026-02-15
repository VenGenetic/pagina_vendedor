-- Migration: Strict Double Entry Implementation
-- Description: Adds group_id, creates Master Accounts, and backfills "orphan" transactions to ensure balance.

-- 1. Add group_id to transactions if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'group_id') THEN 
        ALTER TABLE transactions ADD COLUMN group_id UUID;
    END IF;

    -- Update Constraint to allow Nominal Types
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_type_check') THEN
        ALTER TABLE accounts DROP CONSTRAINT accounts_type_check;
        ALTER TABLE accounts ADD CONSTRAINT accounts_type_check 
        CHECK (type IN ('CASH', 'BANK', 'DIGITAL_WALLET', 'EXPENSE', 'INCOME'));
    END IF;
END $$;

-- 2. Create Master Nominal Accounts
-- "DÉBITOS" -> Counterpart for EXPENSES (Asset -> Expense)
-- "CRÉDITOS" -> Counterpart for INCOME (Asset -> Revenue)
DO $$
DECLARE
    v_debitos_id UUID;
    v_creditos_id UUID;
BEGIN
    -- Create DÉBITOS (Nominal Expense Account)
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'DÉBITOS') THEN
        INSERT INTO accounts (name, type, balance, is_nominal, currency, is_active)
        VALUES ('DÉBITOS', 'EXPENSE', 0.00, true, 'USD', true)
        RETURNING id INTO v_debitos_id;
    ELSE
        SELECT id INTO v_debitos_id FROM accounts WHERE name = 'DÉBITOS';
    END IF;

    -- Create CRÉDITOS (Nominal Revenue Account)
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'CRÉDITOS') THEN
        INSERT INTO accounts (name, type, balance, is_nominal, currency, is_active)
        VALUES ('CRÉDITOS', 'INCOME', 0.00, true, 'USD', true)
        RETURNING id INTO v_creditos_id;
    ELSE
         SELECT id INTO v_creditos_id FROM accounts WHERE name = 'CRÉDITOS';
    END IF;
END $$;

-- 3. Retroactive Fix: Balance the Books
-- Iterate over single-entry transactions and create their mirror
DO $$
DECLARE
    r RECORD;
    v_new_group_id UUID;
    v_contra_account_id UUID;
    v_contra_amount DECIMAL;
    v_master_debits UUID;
    v_master_credits UUID;
BEGIN
    -- Get Master IDs
    SELECT id INTO v_master_debits FROM accounts WHERE name = 'DÉBITOS';
    SELECT id INTO v_master_credits FROM accounts WHERE name = 'CRÉDITOS';

    -- Loop through orphans (Limit to EXPENSE and INCOME for now)
    FOR r IN SELECT * FROM transactions WHERE group_id IS NULL AND type IN ('EXPENSE', 'INCOME', 'PURCHASE') 
    LOOP
        v_new_group_id := uuid_generate_v4();
        
        -- Determine Strategy
        IF r.type = 'EXPENSE' OR r.type = 'PURCHASE' OR (r.type = 'INCOME' AND r.amount < 0) THEN 
            -- Money left the Asset Account (Credit Asset). 
            -- Need to DEBIT the Expense Account (Positive Amount).
            -- Counterpart: DÉBITOS
            v_contra_account_id := v_master_debits;
            -- If original was -100 (Expense), we need +100 in DÉBITOS.
            -- If original was +100 (Refund?), logic might differ. Assuming standard Expense is negative in this system? 
            -- WAIT! In this system, 'EXPENSE' amounts are positive in some contexts or negative?
            -- Let's check `processPurchase`: `amount: totalCost` (Positive). 
            -- But usually stored as Negative in DB for sum=balance? 
            -- Let's assume the DB Convention: 
            -- If user sees "Expense $100", DB might store -100 or +100 depending on `type`.
            
            -- CHECKING CURRENT LOGIC:
            -- `createExpense`: `amount: input.monto` (Positive). `type: 'EXPENSE'`.
            -- `trigger_update_account_balance`:
            -- IF type = 'EXPENSE' THEN Update Balance = Balance - NEW.amount.
            -- So 'EXPENSE' rows have POSITIVE amount, but effectively subtract.
            
            -- FOR DOUBLE ENTRY:
            -- Row 1 (Asset): Credit. Amount should be -100? Or just Type=Expense implies subtraction?
            -- Standard Double Entry DB: All amounts signed.
            -- Row 1: Asset, -100.
            -- Row 2: Expense, +100.
            
            -- CURRENT SYSTEM:
            -- Row 1: Type=EXPENSE, Amount=100. (Trigger subtracts 100).
            -- WE NEED:
            -- Row 2: Type=EXPENSE (or Adjustment?), Amount=-100? (To balance?)
            -- NO. Sum of amounts must be 0.
            -- If Row 1 is +100, Row 2 must be -100.
            
            -- So for EXPENSE (Amount > 0):
            -- Counterpart: DÉBITOS. Amount: -r.amount.
            v_contra_amount := -r.amount; 

        ELSIF r.type = 'INCOME' THEN
            -- Money entered Asset Account (Debit Asset).
            -- Need to CREDIT Revenue Account.
            -- Counterpart: CRÉDITOS
            -- Original: +100. Counterpart: -100.
            v_contra_account_id := v_master_credits;
            v_contra_amount := -r.amount;
        END IF;

        -- Create Counterpart
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method, 
            reference_number, notes, created_at, created_by, group_id,
            is_manual_adjustment
        ) VALUES (
            r.type, -- Keep same type for simplicity in filtering, or use 'ADJUSTMENT'?
            -- If we keep 'EXPENSE' but amount is negative, does trigger add it back?
            -- Trigger Logic: IF type='EXPENSE' THEN balance -= amount.
            -- If amount is -100, balance -= (-100) => balance += 100.
            -- That would INCREASE the master account balance.
            -- DÉBITOS account is type 'EXPENSE'.
            -- We want DÉBITOS balance to INCREASE (as it represents total expenses).
            -- So we need `balance -= (-100)` -> `balance += 100`.
            -- Correct.
            
            v_contra_amount, 
            r.description || ' (Contrapartida)', 
            v_contra_account_id, 
            r.payment_method, 
            r.reference_number, 
            'Auto-Generated Double Entry', 
            r.created_at, 
            r.created_by, 
            v_new_group_id,
            true -- Mark as system adjustment
        );

        -- Update Original
        UPDATE transactions SET group_id = v_new_group_id WHERE id = r.id;
        
    END LOOP;
END $$;
