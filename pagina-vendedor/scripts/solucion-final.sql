-- 🚨 SOLUCIÓN DEFINITIVA DE PERMISOS
-- Ejecuta esto para borrar TODAS las políticas antiguas y crear unas nuevas que funcionen 100%

-- 1. Asegurar que RLS está activo
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- 2. Borrar CUALQUIER política previa (para evitar conflictos)
DROP POLICY IF EXISTS "Admins can insert their own profile" ON admins;
DROP POLICY IF EXISTS "Admins can read their own profile" ON admins;
DROP POLICY IF EXISTS "Admins can update their own profile" ON admins;
DROP POLICY IF EXISTS "Enable read access for all users" ON admins;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON admins;
DROP POLICY IF EXISTS "Admins can view their own profile" ON admins;

-- 3. Crear políticas NUEVAS y PERMISIVAS para los usuarios autenticados

-- PERMITIR LEER (SELECT): Si estás autenticado y el auth_id coincide
CREATE POLICY "Admins can read their own profile" 
ON admins FOR SELECT 
TO authenticated 
USING (auth_id = auth.uid());

-- PERMITIR CREAR (INSERT): Si estás autenticado y el auth_id coincide
CREATE POLICY "Admins can insert their own profile" 
ON admins FOR INSERT 
TO authenticated 
WITH CHECK (auth_id = auth.uid());

-- PERMITIR ACTUALIZAR (UPDATE): Si estás autenticado y el auth_id coincide
CREATE POLICY "Admins can update their own profile" 
ON admins FOR UPDATE 
TO authenticated 
USING (auth_id = auth.uid());

-- 4. Asegurar que tu usuario existe en la tabla (Corrección Final)
DELETE FROM admins WHERE email = 'fernando18avila.es@gmail.com';

INSERT INTO admins (auth_id, email, full_name, is_active)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'fernando18avila.es@gmail.com'),
  'fernando18avila.es@gmail.com',
  'Fernando',
  true
);
