-- ==========================================
-- SCRIPT DE VERIFICACIÓN (TIER 2 RESET)
-- Ejecutar en Supabase SQL Editor
-- ==========================================

DO $$
DECLARE
    v_admin_id UUID;
    v_sales_count INT;
    v_balance_pichincha NUMERIC;
    v_balance_guayaquil NUMERIC;
    v_balance_efectivo NUMERIC;
    v_balance_caja NUMERIC;
BEGIN
    -- 1. OBTENER ID DE UN ADMIN (Si existe)
    SELECT id INTO v_admin_id FROM users WHERE role = 'admin' LIMIT 1;
    
    IF v_admin_id IS NULL THEN
        RAISE NOTICE 'No se encontró un usuario ADMIN para la prueba. Usando auth.uid() actual si es admin...';
        v_admin_id := auth.uid(); 
    END IF;

    -- Si aún es null, no podemos probar la seguridad
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'No se puede ejecutar la prueba sin un usuario Admin válido.';
    END IF;

    RAISE NOTICE 'Iniciando prueba con Admin ID: %', v_admin_id;

    -- 2. CREAR DATA SUCIA (Simulación de Venta)
    INSERT INTO sales (total_amount, payment_method, payment_status, created_by)
    VALUES (999.99, 'CASH', 'COMPLETED', v_admin_id);
    
    RAISE NOTICE 'Datos de prueba insertados.';

    -- 3. EJECUTAR RESET TIER 2 (Saldos a 100.00)
    PERFORM reset_tier_2_inventory(
        v_admin_id,
        '2026-01-31 Test',
        100.00, -- Pichincha
        100.00, -- Guayaquil
        100.00, -- Efectivo
        100.00  -- Caja Grande
    );

    RAISE NOTICE 'Reset Tier 2 ejecutado.';

    -- 4. VERIFICAR RESULTADOS
    SELECT COUNT(*) INTO v_sales_count FROM sales;
    
    SELECT balance INTO v_balance_pichincha FROM accounts WHERE name ILIKE '%Pichincha%';
    SELECT balance INTO v_balance_guayaquil FROM accounts WHERE name ILIKE '%Guayaquil%';
    SELECT balance INTO v_balance_efectivo FROM accounts WHERE name ILIKE '%Efectivo%';
    SELECT balance INTO v_balance_caja FROM accounts WHERE name ILIKE '%Caja Grande%';

    -- 5. ASSERTIONS
    IF v_sales_count = 0 THEN
        RAISE NOTICE '✅ ÉXITO: Tabla de ventas vacía.';
    ELSE
        RAISE EXCEPTION '❌ ERROR: Aún existen ventas.';
    END IF;

    IF v_balance_pichincha = 100.00 AND v_balance_guayaquil = 100.00 AND v_balance_efectivo = 100.00 AND v_balance_caja = 100.00 THEN
         RAISE NOTICE '✅ ÉXITO: Todas las cuentas tienen saldo $100.00.';
    ELSE
         RAISE EXCEPTION '❌ ERROR: Los saldos no coinciden. P: %, G: %', v_balance_pichincha, v_balance_guayaquil;
    END IF;

    RAISE NOTICE '🎉 PRUEBA COMPLETADA EXITOSAMENTE';
END;
$$;
