-- 🛠️ CORRECCIÓN DE LOGIN
-- Este script arregla el problema de "Conflicto de perfil".
-- Ocurre porque existe un registro antiguo en la base de datos que choca con tu nuevo usuario.

-- 1. Eliminar cualquier perfil de admin previo con este correo
DELETE FROM admins WHERE email = 'fernando18avila.es@gmail.com';

-- 2. Insertar el perfil limpio vinculado al usuario actual (el CORRECTO)
INSERT INTO admins (auth_id, email, full_name, is_active)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'fernando18avila.es@gmail.com'),
  'fernando18avila.es@gmail.com',
  'Fernando',
  true
);

-- 3. Verificación (debería mostrar 1 fila)
SELECT * FROM admins WHERE email = 'fernando18avila.es@gmail.com';
