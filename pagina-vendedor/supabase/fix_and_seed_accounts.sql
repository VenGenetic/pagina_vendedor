-- Script para asegurar que las cuentas exactas existan
-- 1. Actualizar nombres si existen variaciones comunes (Renombrar a lo que pide el usuario)
UPDATE accounts 
SET name = 'Banco Pichincha Katiuska' 
WHERE name ILIKE '%Pichincha%' 
AND name != 'Banco Pichincha Katiuska';

UPDATE accounts 
SET name = 'Banco Guayaquil Katiuska' 
WHERE name ILIKE '%Guayaquil%' 
AND name != 'Banco Guayaquil Katiuska';

UPDATE accounts 
SET name = 'Efectivo' 
WHERE name ILIKE '%Efectivo%' 
AND name != 'Efectivo';

-- 2. Insertar si NO existen después de la actualización
INSERT INTO accounts (name, type, balance, currency, is_active)
SELECT 'Banco Pichincha Katiuska', 'BANK', 0.00, 'USD', true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'Banco Pichincha Katiuska');

INSERT INTO accounts (name, type, balance, currency, is_active)
SELECT 'Banco Guayaquil Katiuska', 'BANK', 0.00, 'USD', true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'Banco Guayaquil Katiuska');

INSERT INTO accounts (name, type, balance, currency, is_active)
SELECT 'Efectivo', 'CASH', 0.00, 'USD', true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'Efectivo');
