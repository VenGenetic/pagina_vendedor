-- ==========================================
-- SCRIPT DE REINICIO Y CONFIGURACIÓN INICIAL
-- ==========================================

-- 1. Limpiar todas las tablas transaccionales (Elimina datos de prueba)
-- Usamos TRUNCATE con CASCADE para limpiar todo referencias
TRUNCATE TABLE sale_items, sales, inventory_movements, transactions RESTART IDENTITY CASCADE;

-- 2. Reiniciar el stock de todos los productos a 0
-- (Para comenzar el inventario real desde cero o cargar compras iniciales)
UPDATE products SET current_stock = 0;

-- 3. Reiniciar y Configurar Cuentas Bancarias/Caja
-- Borramos las cuentas existentes para asegurar que solo queden las oficiales
DELETE FROM accounts;

-- Insertamos las cuentas con los saldos iniciales solicitados
INSERT INTO accounts (name, type, balance, currency, is_active) VALUES
  ('BANCO PICHINCHA KATIUSKA', 'BANK', 425.18, 'USD', true),
  ('BANCO GUAYAQUIL KATIUSKA', 'BANK', 421.45, 'USD', true),
  ('EFECTIVO', 'CASH', 57.64, 'USD', true),
  ('Caja Grande', 'CASH', 0.00, 'USD', true);

-- Nota: Si necesitas la 'Caja Grande' u otras, agrégalas aquí o desde la app después.
