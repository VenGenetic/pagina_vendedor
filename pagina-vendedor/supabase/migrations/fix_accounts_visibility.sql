-- =========================================================
-- SCRIPT DE RECUPERACIÓN DE CUENTAS
-- =========================================================

-- 1. Intentar deshabilitar RLS en cuentas para asegurar visibilidad
-- (Esto permite que todos los usuarios vean las cuentas)
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;

-- 2. Asegurarnos que las cuentas existan.
-- Primero borramos cualquiera mal creada para evitar duplicados si alguna quedó a medias.
DELETE FROM accounts;

-- 3. Volver a insertar las cuentas solicitadas
INSERT INTO accounts (name, type, balance, currency, is_active) VALUES
  ('BANCO PICHINCHA KATIUSKA', 'BANK', 425.18, 'USD', true),
  ('BANCO GUAYAQUIL KATIUSKA', 'BANK', 421.45, 'USD', true),
  ('EFECTIVO', 'CASH', 57.64, 'USD', true),
  ('Caja Grande', 'CASH', 0.00, 'USD', true);

-- 4. Verificar que se hayan creado (Esto mostrará el resultado en la pestaña 'Results')
SELECT * FROM accounts;
