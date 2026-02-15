-- FIX: Asegurar que las columnas de auditoría existan
-- Ejecuta esto en Supabase -> SQL Editor para corregir el error "Could not find created_by column"

-- 1. Agregar columnas a transactions
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_by_name TEXT,
-- New accounting flow columns
ADD COLUMN IF NOT EXISTS account_in_id UUID REFERENCES public.accounts(id),
ADD COLUMN IF NOT EXISTS account_out_id UUID REFERENCES public.accounts(id);

-- 2. Agregar columnas a sales
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_by_name TEXT,
ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(12,2) DEFAULT 0;

-- 2.1 Agregar columnas a sale_items
ALTER TABLE public.sale_items
ADD COLUMN IF NOT EXISTS cost_unit DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_total DECIMAL(12,2) DEFAULT 0;

-- 3. Agregar columnas a inventory_movements (por si acaso)
ALTER TABLE public.inventory_movements
ADD COLUMN IF NOT EXISTS created_by_name TEXT;
-- created_by ya existía en el esquema original, pero aseguramos
-- ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS created_by UUID;

-- 4. Actualizar el caché de esquema
NOTIFY pgrst, 'reload schema'; 
-- pero forzamos un cambio inocuo si es necesario, o recarga manualmente en Settings -> API)
NOTIFY pgrst, 'reload schema';
