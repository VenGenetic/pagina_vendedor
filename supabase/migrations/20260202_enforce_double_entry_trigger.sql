-- Migration: Enforce Strict Double Entry via Trigger (Fixed)
-- Description: Makes it "mathematically impossible" to have unbalanced transactions by auto-balancing orphans.

-- 1. FIX CONSTRAINTS & MASTER ACCOUNTS (Idempotent)
DO $$
DECLARE
    v_debitos_id UUID;
    v_creditos_id UUID;
BEGIN
    -- Fix Account Type Constraint
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_type_check') THEN
        ALTER TABLE accounts DROP CONSTRAINT accounts_type_check;
        ALTER TABLE accounts ADD CONSTRAINT accounts_type_check 
        CHECK (type IN ('CASH', 'BANK', 'DIGITAL_WALLET', 'EXPENSE', 'INCOME', 'LIABILITY', 'EQUITY'));
    END IF;

    -- Create DÉBITOS (Nominal Expense/Asset Offset)
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'DÉBITOS') THEN
        INSERT INTO accounts (name, type, balance, is_nominal, currency, is_active)
        VALUES ('DÉBITOS', 'EXPENSE', 0.00, true, 'USD', true);
    END IF;

    -- Create CRÉDITOS (Nominal Revenue/Liability)
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'CRÉDITOS') THEN
        INSERT INTO accounts (name, type, balance, is_nominal, currency, is_active)
        VALUES ('CRÉDITOS', 'INCOME', 0.00, true, 'USD', true);
    END IF;
END $$;

-- 2. TRIGGER FUNCTION: Auto-Balance Ledger
-- Clean up previous attempts to avoid confusion
DROP TRIGGER IF EXISTS trg_auto_balance ON transactions;
DROP FUNCTION IF EXISTS auto_balance_transaction_trigger;
DROP FUNCTION IF EXISTS create_counterpart_transaction;
DROP FUNCTION IF EXISTS ensure_group_id;
DROP FUNCTION IF EXISTS auto_balance_transaction;

CREATE OR REPLACE FUNCTION auto_balance_transaction_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_contra_account_id UUID;
    v_new_group_id UUID;
BEGIN
    -- Only act if group_id is MISSING (Implies legacy/direct insert)
    IF NEW.group_id IS NULL THEN
        -- Generate ID for this pair
        v_new_group_id := uuid_generate_v4();
        NEW.group_id := v_new_group_id; -- Set for the original row

        -- Identify Counterpart
        IF NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'DÉBITOS';
        ELSIF NEW.type = 'INCOME' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'CRÉDITOS';
        ELSE
            -- Transfers or unknown types: Do not auto-balance blindly. 
            RETURN NEW; 
        END IF;

        -- Check if Master Account was found
        IF v_contra_account_id IS NULL THEN
            -- Should not happen if Step 1 ran, but safety first.
            RETURN NEW;
        END IF;

        -- Insert Counterpart
        -- NOTE: This insert will FIRE THE TRIGGER AGAIN.
        -- But we provide group_id (v_new_group_id), so the recursive call will 
        -- see "IF NEW.group_id IS NULL" -> False -> Return NEW.
        
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method, 
            reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
        ) VALUES (
            NEW.type,
            -NEW.amount, -- Invert amount
            NEW.description || ' (Auto-Balance)',
            v_contra_account_id,
            NEW.payment_method,
            NEW.reference_number,
            'System Auto-Balance Trigger',
            NOW(),
            NEW.created_by,
            v_new_group_id, -- Link to original
            true
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Trigger
CREATE TRIGGER trg_auto_balance
BEFORE INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION auto_balance_transaction_trigger();


-- 3. RETROACTIVE FIX (Run one more time to catch anything)
DO $$
DECLARE
    r RECORD;
    v_fix_group_id UUID;
    v_fix_contra_id UUID;
BEGIN
    FOR r IN SELECT * FROM transactions WHERE group_id IS NULL AND type IN ('EXPENSE', 'INCOME', 'PURCHASE')
    LOOP
        v_fix_group_id := uuid_generate_v4();
        
        IF r.type IN ('EXPENSE', 'PURCHASE') THEN
            SELECT id INTO v_fix_contra_id FROM accounts WHERE name = 'DÉBITOS';
        ELSIF r.type = 'INCOME' THEN
             SELECT id INTO v_fix_contra_id FROM accounts WHERE name = 'CRÉDITOS';
        END IF;

        IF v_fix_contra_id IS NOT NULL THEN
            -- Link Original
            UPDATE transactions SET group_id = v_fix_group_id WHERE id = r.id;
            
            -- Insert Counterpart
            INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, notes, created_at, created_by, group_id, is_manual_adjustment
            ) VALUES (
                r.type,
                -r.amount,
                r.description || ' (Retro-Fix)',
                v_fix_contra_id,
                r.payment_method,
                r.reference_number,
                'Retroactive Fix',
                r.created_at,
                r.created_by,
                v_fix_group_id,
                true
            );
        END IF;
    END LOOP;
END $$;
