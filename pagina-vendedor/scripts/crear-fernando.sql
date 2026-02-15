-- 🔐 CREAR ADMINISTRADOR: Fernando
-- 📧 Email: fernando18avila.es@gmail.com
-- 🔑 Contraseña: Avila123fernando

-- EJECUTA ESTO EN SUPABASE SQL EDITOR:
-- https://vfemkaighftkqyoaxxpa.supabase.co/project/vfemkaighftkqyoaxxpa/sql

-- Paso 1: Crear usuario en Authentication
-- Ve a: Authentication > Users > "Add user"
-- - Email: fernando18avila.es@gmail.com
-- - Password: Avila123fernando
-- - Auto Confirm User: YES (para evitar verificación de email)

-- Paso 2: Después de crear el usuario, ejecuta este SQL:
INSERT INTO admins (auth_id, email, full_name, is_active)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'fernando18avila.es@gmail.com'),
  'fernando18avila.es@gmail.com',
  'Fernando',
  true
);

-- ✅ Verificar que se creó correctamente:
SELECT * FROM admins WHERE email = 'fernando18avila.es@gmail.com';
