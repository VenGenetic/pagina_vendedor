-- ==========================================
-- MANUAL TIER 2 RESET EXECUTION
-- Run this in Supabase SQL Editor
-- ==========================================

DO $$
DECLARE
    -- [CONFIGURATION] Set your desired Start Balances here:
    v_bal_pichincha   NUMERIC := 425.18; 
    v_bal_guayaquil   NUMERIC := 421.45;
    v_bal_efectivo    NUMERIC := 57.64;
    v_bal_caja_grande NUMERIC := 0.00;

    -- Internal variables
    v_user_id UUID;
    v_formatted_date TEXT;
BEGIN
    -- 1. Get Admin User ID (Defaults to current auth user, fallback to hardcoded admin)
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        -- Fallback: Select the user 'maxprinton' explicitly if running outside auth context
        SELECT id INTO v_user_id FROM public.users WHERE email = 'maxprinton@gmail.com';
    END IF;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Could not identify an Admin user to execute the reset.';
    END IF;

    -- 2. Format Date
    v_formatted_date := TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS');

    -- 3. Log Plan
    RAISE NOTICE '------------------------------------------------';
    RAISE NOTICE 'PLANNING TIER 2 RESET';
    RAISE NOTICE 'User: %', v_user_id;
    RAISE NOTICE 'B. Pichincha: %', v_bal_pichincha;
    RAISE NOTICE 'B. Guayaquil: %', v_bal_guayaquil;
    RAISE NOTICE 'B. Efectivo:  %', v_bal_efectivo;
    RAISE NOTICE 'Caja Grande:  %', v_bal_caja_grande;
    RAISE NOTICE '------------------------------------------------';

    -- 4. Execute Function
    -- Check if function exists first to avoid crashes if migration wasn't applied
    PERFORM reset_tier_2_inventory(
        v_user_id,
        v_formatted_date,
        v_bal_pichincha,
        v_bal_guayaquil,
        v_bal_efectivo,
        v_bal_caja_grande
    );

    RAISE NOTICE '✅ TIER 2 RESET EXECUTED SUCCESSFULLY.';
    RAISE NOTICE 'Check system_events_log for audit trail.';

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ ERROR executing Tier 2 Reset: %', SQLERRM;
END;
$$;
