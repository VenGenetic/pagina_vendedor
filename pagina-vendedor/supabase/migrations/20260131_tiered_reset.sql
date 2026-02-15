-- ==========================================
-- TIERED SYSTEM RESET & AUDIT LOGGING
-- ==========================================

-- 1. Create System Events Log (Persistent Audit)
CREATE TABLE IF NOT EXISTS system_events_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL, -- e.g., 'SYSTEM_RESET_TIER_1'
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- Store extra details if needed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID -- Link to auth.users if available
);

-- Index for searching logs
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events_log(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_date ON system_events_log(created_at DESC);

-- ==========================================
-- TIER 1: TRANSACTION RESET (Preserves Stock)
-- ==========================================
CREATE OR REPLACE FUNCTION reset_tier_1_transactions(p_user_id UUID, p_formatted_date TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Run as superuser to bypass RLS/constraints if needed
AS $$
DECLARE
    v_account RECORD;
BEGIN
    -- 1. Log the attempt
    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_1', 'Iniciando limpieza de transacciones (Stock preservado) - ' || p_formatted_date, p_user_id);

    -- 2. Disable Triggers to prevent side-effects (e.g., auto-stock updates or balance propogation)
    ALTER TABLE transactions DISABLE TRIGGER ALL;
    ALTER TABLE inventory_movements DISABLE TRIGGER ALL;
    ALTER TABLE accounts DISABLE TRIGGER ALL;

    -- 3. Clear Transactional Tables
    -- Note: We DELETE instead of TRUNCATE to be selective if needed, but here we want all transactions gone.
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM transactions; -- Wipes Income, Expenses, Transfers, Commission Payouts

    -- 4. Re-classify Inventory Movements (Crucial Step)
    -- Detach from transactions and convert to Adjustments so they don't break reports
    -- Set total_value to 0 to wipe John's debt/commission history
    UPDATE inventory_movements 
    SET 
        transaction_id = NULL,
        reason = 'COUNT_ADJUSTMENT', -- "Ajuste de Conteo"
        type = 'ADJUSTMENT',
        total_value = 0,
        notes = COALESCE(notes, '') || ' [Reset T1: Preservado]'
    WHERE transaction_id IS NOT NULL OR type IN ('IN', 'OUT'); 
    -- We update ALL because we are effectively resetting the "history" but keeping the "count"

    -- 5. Reset Account Balances
    UPDATE accounts SET balance = 0.00;

    -- 6. Insert Opening Balance Transactions (0.00)
    FOR v_account IN SELECT id FROM accounts WHERE is_active = true LOOP
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method, notes, created_at, created_by
        ) VALUES (
            'INCOME', 
            0.00, 
            'SYSTEM_RESET_OPENING_BALANCE', 
            v_account.id, 
            'OTHER', 
            'Reinicio Tier 1: Balance Inicial', 
            NOW(), 
            p_user_id
        );
    END LOOP;

    -- 7. Re-enable Triggers
    ALTER TABLE transactions ENABLE TRIGGER ALL;
    ALTER TABLE inventory_movements ENABLE TRIGGER ALL;
    ALTER TABLE accounts ENABLE TRIGGER ALL;

    -- 8. Final Log
    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_1_COMPLETE', 'Finalizada limpieza de transacciones', p_user_id);

    RETURN jsonb_build_object('success', true, 'message', 'Transacciones eliminadas. Inventario preservado.');

EXCEPTION WHEN OTHERS THEN
    -- Re-enable triggers in case of error to avoid leaving DB in bad state
    ALTER TABLE transactions ENABLE TRIGGER ALL;
    ALTER TABLE inventory_movements ENABLE TRIGGER ALL;
    ALTER TABLE accounts ENABLE TRIGGER ALL;
    RAISE;
END;
$$;

-- ==========================================
-- TIER 2: INVENTORY RESET (Wipes Stock)
-- ==========================================
CREATE OR REPLACE FUNCTION reset_tier_2_inventory(p_user_id UUID, p_formatted_date TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_account RECORD;
BEGIN
    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_2', 'Iniciando reinicio de inventario (Stock a 0) - ' || p_formatted_date, p_user_id);

    -- Disable Triggers
    ALTER TABLE transactions DISABLE TRIGGER ALL;
    ALTER TABLE inventory_movements DISABLE TRIGGER ALL;
    ALTER TABLE products DISABLE TRIGGER ALL;
    ALTER TABLE accounts DISABLE TRIGGER ALL;

    -- WIPE EVERYTHING except definitions
    DELETE FROM inventory_movements;
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM transactions;

    -- Reset Stock to 0
    UPDATE products SET current_stock = 0;
    
    -- Reset Balances
    UPDATE accounts SET balance = 0.00;

    -- Insert Opening Balances
    FOR v_account IN SELECT id FROM accounts WHERE is_active = true LOOP
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method, notes, created_at, created_by
        ) VALUES (
            'INCOME', 0.00, 'SYSTEM_RESET_OPENING_BALANCE', v_account.id, 'OTHER', 'Reinicio Tier 2: Balance Inicial', NOW(), p_user_id
        );
    END LOOP;

    -- Re-enable Triggers
    ALTER TABLE transactions ENABLE TRIGGER ALL;
    ALTER TABLE inventory_movements ENABLE TRIGGER ALL;
    ALTER TABLE products ENABLE TRIGGER ALL;
    ALTER TABLE accounts ENABLE TRIGGER ALL;

    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_2_COMPLETE', 'Finalizado reinicio de inventario', p_user_id);

    RETURN jsonb_build_object('success', true, 'message', 'Inventario y transacciones eliminados.');

EXCEPTION WHEN OTHERS THEN
    ALTER TABLE transactions ENABLE TRIGGER ALL;
    ALTER TABLE inventory_movements ENABLE TRIGGER ALL;
    ALTER TABLE products ENABLE TRIGGER ALL;
    ALTER TABLE accounts ENABLE TRIGGER ALL;
    RAISE;
END;
$$;

-- ==========================================
-- TIER 3: FACTORY RESET (Hard Reset)
-- ==========================================
CREATE OR REPLACE FUNCTION reset_tier_3_hard(p_user_id UUID, p_formatted_date TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_3', 'FACTORY RESET INITIATED - ' || p_formatted_date, p_user_id);

    -- TRUNCATE CASCADE (Fastest, cleanest wipe)
    TRUNCATE TABLE sale_items, sales, inventory_movements, transactions RESTART IDENTITY CASCADE;

    -- Reset Accounts (Hard Delete and Reseed)
    DELETE FROM accounts;
    
    INSERT INTO accounts (name, type, balance, currency, is_active) VALUES
      ('BANCO PICHINCHA KATIUSKA', 'BANK', 0.00, 'USD', true),
      ('BANCO GUAYAQUIL KATIUSKA', 'BANK', 0.00, 'USD', true),
      ('EFECTIVO', 'CASH', 0.00, 'USD', true),
      ('Caja Grande', 'CASH', 0.00, 'USD', true);

    -- Reset Products Stock
    UPDATE products SET current_stock = 0;

    -- Note: We do NOT truncate system_events_log so we have a record of this event
    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_3_COMPLETE', 'Factory Reset Complete. System looks like new.', p_user_id);

    RETURN jsonb_build_object('success', true, 'message', 'Sistema reiniciado a estado de fábrica.');
END;
$$;
