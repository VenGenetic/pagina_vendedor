-- ==========================================
-- SCRIPT DE ACTUALIZACIÓN DE ROLES (ADMIN)
-- Ejecutar en Supabase SQL Editor
-- ==========================================

DO $$
BEGIN
    -- 1. Promover a 'maxprinton' (f7f339fe-8a8d-49be-b171-8be35dc44d29)
    UPDATE public.users 
    SET role = 'admin' 
    WHERE id = 'f7f339fe-8a8d-49be-b171-8be35dc44d29';

    RAISE NOTICE '✅ Usuario maxprinton promovido a ADMIN.';
END $$;
