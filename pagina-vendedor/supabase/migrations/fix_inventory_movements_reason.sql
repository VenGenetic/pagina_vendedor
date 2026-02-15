-- Fix inventory_movements reason constraint - Ensure reason is NOT NULL with DEFAULT

-- Step 1: Update existing NULL values to 'OTHER'
UPDATE public.inventory_movements 
SET reason = 'OTHER' 
WHERE reason IS NULL;

-- Step 2: Drop the old constraint if it exists
DO $$ 
BEGIN
  ALTER TABLE public.inventory_movements 
  DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Step 3: Add NOT NULL constraint if not already present
DO $$
BEGIN
  ALTER TABLE public.inventory_movements 
  ALTER COLUMN reason SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Step 4: Add DEFAULT if not already present
DO $$
BEGIN
  ALTER TABLE public.inventory_movements 
  ALTER COLUMN reason SET DEFAULT 'OTHER';
EXCEPTION WHEN others THEN NULL;
END $$;

-- Step 5: Recreate the constraint
ALTER TABLE public.inventory_movements 
ADD CONSTRAINT inventory_movements_reason_check 
  CHECK (reason IN ('SALE', 'PURCHASE', 'RETURN', 'DAMAGE', 'THEFT', 'COUNT_ADJUSTMENT', 'OTHER'));

