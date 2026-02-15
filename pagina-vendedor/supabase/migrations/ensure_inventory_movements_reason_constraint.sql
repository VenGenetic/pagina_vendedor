-- Ensure inventory_movements.reason is properly configured
-- This handles edge cases where previous migration may not have run

BEGIN;

-- Set all NULLs to 'OTHER' first
UPDATE public.inventory_movements 
SET reason = 'OTHER' 
WHERE reason IS NULL OR reason = '';

-- Recreate the table structure if needed with proper defaults
-- This ensures the constraint is active and working
ALTER TABLE public.inventory_movements
DROP CONSTRAINT IF EXISTS inventory_movements_reason_check CASCADE;

-- Add the proper check constraint
ALTER TABLE public.inventory_movements
ADD CONSTRAINT inventory_movements_reason_check 
  CHECK (reason IS NOT NULL AND reason IN ('SALE', 'PURCHASE', 'RETURN', 'DAMAGE', 'THEFT', 'COUNT_ADJUSTMENT', 'OTHER'));

-- Ensure column has default
ALTER TABLE public.inventory_movements
ALTER COLUMN reason SET DEFAULT 'OTHER' NOT NULL;

COMMIT;
