-- ==========================================
-- ADVANCED TIERED SYSTEM RESET (ADMIN ONLY)
-- ==========================================

-- 0. CLEANUP OLD SIGNATURES (Avoid "function name is not unique" errors)
DROP FUNCTION IF EXISTS reset_tier_1_transactions(UUID, TEXT);
DROP FUNCTION IF EXISTS reset_tier_2_inventory(UUID, TEXT);
DROP FUNCTION IF EXISTS reset_tier_3_hard(UUID, TEXT);

-- 1. Ensure System Events Log exists
CREATE TABLE IF NOT EXISTS system_events_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID
);

-- Index for searching logs
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events_log(event_type);

-- ==========================================
-- TIER 1: TRANSACTION WIPE (Stock -> 0)
-- ==========================================
CREATE OR REPLACE FUNCTION reset_tier_1_transactions(p_user_id UUID, p_formatted_date TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role TEXT;
BEGIN
    -- 1. SECURITY CHECK: ADMIN ONLY
    SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
    -- Fallback check using auth.uid() if p_user_id matches
    IF v_user_role IS NULL AND auth.uid() = p_user_id THEN
         SELECT role INTO v_user_role FROM users WHERE id = auth.uid();
    END IF;
    
    IF v_user_role != 'admin' THEN
        RAISE EXCEPTION 'Acceso Prohibido: Se requiere rol de Administrador.';
    END IF;

    -- 2. Log Start
    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_1', 'Iniciando limpieza de transacciones (Stock a 0) - ' || p_formatted_date, p_user_id);

    -- 3. BYPASS TRIGGERS (The Ledger Law)
    SET session_replication_role = 'replica';

    -- 4. WIPE TRANSACTION DATA
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM inventory_movements;
    DELETE FROM transactions;

    -- 5. RESET STOCK TO 0
    UPDATE products SET current_stock = 0;

    -- 6. RESET ACCOUNT BALANCES TO 0 (Preserved Entities)
    UPDATE accounts SET balance = 0.00;

    -- 7. RESTORE TRIGGERS
    SET session_replication_role = 'origin';

    -- 8. Log Completion
    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_1_COMPLETE', 'Transacciones eliminadas. Stock y Balances a 0.', p_user_id);

    RETURN jsonb_build_object('success', true, 'message', 'Tier 1 completado.');

EXCEPTION WHEN OTHERS THEN
    SET session_replication_role = 'origin';
    RAISE;
END;
$$;

-- ==========================================
-- TIER 2: DYNAMIC INVENTORY RESET
-- ==========================================
CREATE OR REPLACE FUNCTION reset_tier_2_inventory(
    p_user_id UUID, 
    p_formatted_date TEXT,
    p_balance_pichincha NUMERIC,
    p_balance_guayaquil NUMERIC,
    p_balance_efectivo NUMERIC,
    p_balance_caja_grande NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role TEXT;
BEGIN
    -- 1. SECURITY CHECK
    SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
    IF v_user_role IS NULL AND auth.uid() = p_user_id THEN
         SELECT role INTO v_user_role FROM users WHERE id = auth.uid();
    END IF;

    IF v_user_role != 'admin' THEN
        RAISE EXCEPTION 'Acceso Prohibido: Se requiere rol de Administrador.';
    END IF;

    -- 2. Log Start
    INSERT INTO system_events_log (event_type, description, metadata, created_by)
    VALUES (
        'RESET_TIER_2', 
        'Reinicio Tier 2 con saldos dinámicos - ' || p_formatted_date,
        jsonb_build_object(
            'pichincha', p_balance_pichincha,
            'guayaquil', p_balance_guayaquil,
            'efectivo', p_balance_efectivo,
            'caja_grande', p_balance_caja_grande
        ),
        p_user_id
    );

    -- 3. BYPASS TRIGGERS
    SET session_replication_role = 'replica';

    -- 4. WIPE DATA (Same as Tier 1)
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM inventory_movements;
    DELETE FROM transactions;

    -- 5. RESET STOCK TO 0
    UPDATE products SET current_stock = 0;

    -- 6. SET OPENING BALANCES (Dynamic)
    -- Using ILIKE to match loosely, but safer to use exact names if known constants.
    -- Assuming standard names based on request.
    
    UPDATE accounts SET balance = p_balance_pichincha 
    WHERE name ILIKE '%Pichincha%';

    UPDATE accounts SET balance = p_balance_guayaquil 
    WHERE name ILIKE '%Guayaquil%';

    UPDATE accounts SET balance = p_balance_efectivo 
    WHERE name ILIKE '%Efectivo%'; -- 'EFECTIVO'

    UPDATE accounts SET balance = p_balance_caja_grande 
    WHERE name ILIKE '%Caja Grande%';

    -- 7. RESTORE TRIGGERS
    SET session_replication_role = 'origin';

    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_2_COMPLETE', 'Reinicio Tier 2 completado con nuevos saldos.', p_user_id);

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    SET session_replication_role = 'origin';
    RAISE;
END;
$$;

-- ==========================================
-- TIER 3: FACTORY RESET (Preserves Accounts)
-- ==========================================
CREATE OR REPLACE FUNCTION reset_tier_3_hard(p_user_id UUID, p_formatted_date TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role TEXT;
BEGIN
    SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
    IF v_user_role IS NULL AND auth.uid() = p_user_id THEN
         SELECT role INTO v_user_role FROM users WHERE id = auth.uid();
    END IF;

    IF v_user_role != 'admin' THEN
        RAISE EXCEPTION 'Acceso Prohibido: Se requiere rol de Administrador.';
    END IF;

    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_3', 'FACTORY RESET INITIATED - ' || p_formatted_date, p_user_id);

    -- BYPASS
    SET session_replication_role = 'replica';

    -- TRUNCATE ALL TRANSACTIONAL DATA
    TRUNCATE TABLE sale_items, sales, inventory_movements, transactions RESTART IDENTITY CASCADE;

    -- WIPE PRODUCTS (Catalog Clean)
    DELETE FROM products;

    -- RESET ACCOUNTS TO 0 (Do NOT Delete)
    UPDATE accounts SET balance = 0.00;

    -- RESTORE
    SET session_replication_role = 'origin';

    INSERT INTO system_events_log (event_type, description, created_by)
    VALUES ('RESET_TIER_3_COMPLETE', 'Factory Reset Complete (Accounts Preserved).', p_user_id);

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    SET session_replication_role = 'origin';
    RAISE;
END;
$$;

-- Grant Permissions
GRANT EXECUTE ON FUNCTION reset_tier_1_transactions TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION reset_tier_2_inventory TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION reset_tier_3_hard TO service_role, authenticated;
