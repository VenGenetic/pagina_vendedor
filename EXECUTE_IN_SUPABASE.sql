-- EJECUTAR ESTO MANUALMENTE EN SUPABASE SQL EDITOR
-- https://supabase.com -> Tu Proyecto -> SQL Editor -> Nuevo Query

-- 1. Primero, actualizar NULLs existentes
UPDATE public.inventory_movements 
SET reason = 'OTHER' 
WHERE reason IS NULL OR reason = '';

-- 2. Eliminar constraint viejo si existe
ALTER TABLE public.inventory_movements 
DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;

-- 3. Cambiar columna a NOT NULL con DEFAULT
ALTER TABLE public.inventory_movements
ALTER COLUMN reason SET DEFAULT 'OTHER',
ALTER COLUMN reason SET NOT NULL;

-- 4. Recrear constraint
ALTER TABLE public.inventory_movements 
ADD CONSTRAINT inventory_movements_reason_check 
  CHECK (reason IN ('SALE', 'PURCHASE', 'RETURN', 'DAMAGE', 'THEFT', 'COUNT_ADJUSTMENT', 'OTHER'));

-- Verificar que funcionó:
-- SELECT column_name, is_nullable, column_default FROM information_schema.columns 
-- WHERE table_name = 'inventory_movements' AND column_name = 'reason';
