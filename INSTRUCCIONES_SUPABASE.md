# Cómo Ejecutar la Migración de Supabase

El error `inventory_movements_reason_check` ocurre porque la BD de Supabase no tiene configurado correctamente el campo `reason`.

## Pasos para Arreglarlo:

1. **Ve a Supabase Dashboard:**
   - Entra a https://supabase.com
   - Selecciona tu proyecto

2. **Abre SQL Editor:**
   - Click en "SQL Editor" en el menú izquierdo
   - Click en "New Query"

3. **Copia y pega este SQL:**
   ```sql
   UPDATE public.inventory_movements 
   SET reason = 'OTHER' 
   WHERE reason IS NULL OR reason = '';

   ALTER TABLE public.inventory_movements 
   DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;

   ALTER TABLE public.inventory_movements
   ALTER COLUMN reason SET DEFAULT 'OTHER',
   ALTER COLUMN reason SET NOT NULL;

   ALTER TABLE public.inventory_movements 
   ADD CONSTRAINT inventory_movements_reason_check 
   CHECK (reason IN ('SALE', 'PURCHASE', 'RETURN', 'DAMAGE', 'THEFT', 'COUNT_ADJUSTMENT', 'OTHER'));
   ```

4. **Ejecuta el query:**
   - Click en "Run" o presiona Ctrl+Enter

5. **Listo!** Ahora intenta registrar la compra nuevamente.

## ¿Por qué ocurre esto?

Vercel NO ejecuta las migraciones de Supabase automáticamente. Las migraciones en `supabase/migrations/` solo se ejecutan localmente o si las aplicas manualmente.

El archivo `EXECUTE_IN_SUPABASE.sql` contiene el SQL exacto que necesitas ejecutar en el SQL Editor de Supabase.
