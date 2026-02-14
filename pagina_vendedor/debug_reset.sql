-- Función para verificar si todo está bien
DROP FUNCTION IF EXISTS reset_tier_1_transactions;
DROP FUNCTION IF EXISTS reset_tier_2_inventory;
DROP FUNCTION IF EXISTS reset_tier_3_hard;

-- Re-crear funciones con permisos de Superusuario (SECURITY DEFINER)

-- TIER 1
CREATE OR REPLACE FUNCTION reset_tier_1_transactions(p_user_id UUID, p_formatted_date TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_account RECORD;
BEGIN
    -- Disable Triggers (Force cleanup)
    SET session_replication_role = 'replica'; 
    -- 'replica' disables all non-system triggers (including FKs and custom triggers) safely for the session
    
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM transactions;
    
    -- Fix Inventory Movements
    UPDATE inventory_movements 
    SET transaction_id = NULL, type = 'ADJUSTMENT', reason = 'COUNT_ADJUSTMENT', total_value = 0
    WHERE transaction_id IS NOT NULL OR type IN ('IN', 'OUT');

    -- Reset Accounts
    UPDATE accounts SET balance = 0.00;
             
    -- Insert Opening Balances
    FOR v_account IN SELECT id FROM accounts WHERE is_active = true LOOP
        INSERT INTO transactions (type, amount, description, account_id, payment_method, notes, created_at, created_by)
        VALUES ('INCOME', 0.00, 'SYSTEM_RESET_OPENING_BALANCE', v_account.id, 'OTHER', 'Reinicio Tier 1', NOW(), p_user_id);
    END LOOP;

    -- Re-enable Triggers
    SET session_replication_role = 'origin';

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    SET session_replication_role = 'origin';
    RAISE;
END;
$$;

-- TIER 2
CREATE OR REPLACE FUNCTION reset_tier_2_inventory(p_user_id UUID, p_formatted_date TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_account RECORD;
BEGIN
    SET session_replication_role = 'replica';

    DELETE FROM inventory_movements;
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM transactions;

    UPDATE products SET current_stock = 0;
    UPDATE accounts SET balance = 0.00;

    FOR v_account IN SELECT id FROM accounts WHERE is_active = true LOOP
        INSERT INTO transactions (type, amount, description, account_id, payment_method, notes, created_at, created_by)
        VALUES ('INCOME', 0.00, 'SYSTEM_RESET_OPENING_BALANCE', v_account.id, 'OTHER', 'Reinicio Tier 2', NOW(), p_user_id);
    END LOOP;

    SET session_replication_role = 'origin';
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    SET session_replication_role = 'origin';
    RAISE;
END;
$$;

-- TIER 3
CREATE OR REPLACE FUNCTION reset_tier_3_hard(p_user_id UUID, p_formatted_date TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    TRUNCATE TABLE sale_items, sales, inventory_movements, transactions RESTART IDENTITY CASCADE;
    DELETE FROM accounts;
    INSERT INTO accounts (name, type, balance, currency, is_active) VALUES
      ('BANCO PICHINCHA', 'BANK', 0.00, 'USD', true),
      ('BANCO GUAYAQUIL', 'BANK', 0.00, 'USD', true),
      ('EFECTIVO', 'CASH', 0.00, 'USD', true),
      ('Caja Grande', 'CASH', 0.00, 'USD', true);
    UPDATE products SET current_stock = 0;
    RETURN jsonb_build_object('success', true);
END;
$$;
