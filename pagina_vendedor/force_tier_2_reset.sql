-- ==========================================
-- FORCE TIER 2 RESET (NUCLEAR OPTION)
-- Run this in Supabase SQL Editor
-- ==========================================

DO $$
DECLARE
    -- [CONFIGURATION] Saldos Iniciales:
    v_bal_pichincha   NUMERIC := 425.18; 
    v_bal_guayaquil   NUMERIC := 421.45;
    v_bal_efectivo    NUMERIC := 57.64;
    v_bal_caja_grande NUMERIC := 0.00;
BEGIN
    RAISE NOTICE '⚠️ INICIANDO FORZADO DE RESET TIER 2...';

    -- 1. BYPASS TRIGGERS (The Ledger Law)
    -- Esto desactiva temporalmente los triggers de integridad referencial
    SET session_replication_role = 'replica';

    -- 2. TRUNCATE CASCADE (Borrado Nuclear)
    -- Borra TODO el contenido de las tablas transaccionales rapidísimo
    TRUNCATE TABLE 
        sale_items, 
        sales, 
        inventory_movements, 
        transactions 
    RESTART IDENTITY CASCADE;

    RAISE NOTICE '✅ Tablas transaccionales vaciadas (TRUNCATE).';

    -- 3. RESET STOCK (Productos a 0)
    UPDATE products SET current_stock = 0;
    RAISE NOTICE '✅ Stock de productos restablecido a 0.';

    -- 4. RESTAURAR SALDOS DE CUENTAS
    -- Usamos ILIKE para asegurar que encuentra las cuentas sin importar mayúsculas
    UPDATE accounts SET balance = v_bal_pichincha WHERE name ILIKE '%Pichincha%';
    UPDATE accounts SET balance = v_bal_guayaquil WHERE name ILIKE '%Guayaquil%';
    UPDATE accounts SET balance = v_bal_efectivo WHERE name ILIKE '%Efectivo%'; -- A veces es 'EFECTIVO'
    UPDATE accounts SET balance = v_bal_caja_grande WHERE name ILIKE '%Caja Grande%';

    RAISE NOTICE '✅ Saldos de cuentas actualizados.';

    -- 5. RESTORE TRIGGERS
    SET session_replication_role = 'origin';

    RAISE NOTICE '🎉 RESET FORZADO COMPLETADO EXITOSAMENTE.';

EXCEPTION WHEN OTHERS THEN
    -- Asegurar que los triggers se reactiven si algo falla
    SET session_replication_role = 'origin';
    RAISE EXCEPTION '❌ ERROR CRÍTICO EN RESET: %', SQLERRM;
END;
$$;
