-- Migration: Fix Transfer Metadata (Source/Dest IDs)
-- Description: 
-- 1. Updates auto-balance trigger to copy `account_out_id` and `account_in_id` to the generated sibling.
-- 2. Retroactively fixes existing transfers where the sibling has NULL account links.

BEGIN;

-- 1. UPDATE TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION auto_balance_transaction_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_contra_account_id UUID;
    v_new_group_id UUID;
BEGIN
    IF NEW.group_id IS NULL OR NEW.type = 'TRANSFER' THEN
        IF NEW.group_id IS NULL THEN
             v_new_group_id := uuid_generate_v4();
             NEW.group_id := v_new_group_id;
        ELSE
             v_new_group_id := NEW.group_id;
        END IF;

        IF (NEW.type = 'EXPENSE' OR NEW.type = 'PURCHASE') AND NEW.description NOT LIKE '%(Auto-Balance)%' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'DÉBITOS';
            INSERT INTO transactions (type, amount, description, account_id, payment_method, reference_number, notes, created_at, created_by, group_id, is_manual_adjustment) 
            VALUES (NEW.type, -1 * NEW.amount, NEW.description || ' (Auto-Balance)', v_contra_account_id, NEW.payment_method, NEW.reference_number, 'System Auto-Balance Trigger', NOW(), NEW.created_by, v_new_group_id, true);
            
        ELSIF NEW.type = 'INCOME' AND NEW.description NOT LIKE '%(Auto-Balance)%' THEN
            SELECT id INTO v_contra_account_id FROM accounts WHERE name = 'CRÉDITOS';
            INSERT INTO transactions (type, amount, description, account_id, payment_method, reference_number, notes, created_at, created_by, group_id, is_manual_adjustment) 
            VALUES (NEW.type, -1 * NEW.amount, NEW.description || ' (Auto-Balance)', v_contra_account_id, NEW.payment_method, NEW.reference_number, 'System Auto-Balance Trigger', NOW(), NEW.created_by, v_new_group_id, true);
            
        -- TRANSFER Logic Update: Copy account_out_id/account_in_id
        ELSIF NEW.type = 'TRANSFER' AND NEW.description NOT LIKE '%(Entrada)%' AND NEW.account_in_id IS NOT NULL THEN
            INSERT INTO transactions (
                type, 
                amount, 
                description, 
                account_id, 
                account_out_id, -- Copy Source Leg metadata
                account_in_id,  -- Copy Source Leg metadata
                payment_method, 
                reference_number, 
                notes, 
                created_at, 
                created_by, 
                group_id, 
                is_manual_adjustment
            ) 
            VALUES (
                'TRANSFER', 
                -1 * NEW.amount, 
                NEW.description || ' (Entrada)', 
                NEW.account_in_id, 
                NEW.account_out_id, -- COPY
                NEW.account_in_id,  -- COPY
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

-- 2. RETROACTIVE FIX
-- Find 'TRANSFER' siblings (Entrada) that have NULL account_out_id/account_in_id
-- And update them from their group partner (The Source Leg).

DO $$
DECLARE
    r RECORD;
    partner RECORD;
BEGIN
    FOR r IN SELECT * FROM transactions 
             WHERE type = 'TRANSFER' 
             AND description LIKE '%(Entrada)%' 
             AND (account_out_id IS NULL OR account_in_id IS NULL)
    LOOP
        -- Find the Partner in the same group (The Source)
        -- Source does NOT have '(Entrada)' in description
        SELECT * INTO partner 
        FROM transactions 
        WHERE group_id = r.group_id 
        AND description NOT LIKE '%(Entrada)%'
        LIMIT 1;

        IF partner IS NOT NULL THEN
            -- Update the Sibling to match the Partner's metadata
            UPDATE transactions 
            SET account_out_id = partner.account_out_id,
                account_in_id = partner.account_in_id
            WHERE id = r.id;
        END IF;
    END LOOP;
END $$;

COMMIT;
