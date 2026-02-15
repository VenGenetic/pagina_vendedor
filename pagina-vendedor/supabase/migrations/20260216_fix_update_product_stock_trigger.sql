-- Migration: Fix update_product_stock Trigger Logic
-- Purpose: Ensure the trigger function correctly handles UPDATE operations on inventory_movements
--          to prevent stock drift when editing movements.
-- Date: 2026-02-16

BEGIN;

-- 1. Redefine the function to handle INSERT, DELETE, and UPDATE
CREATE OR REPLACE FUNCTION public.update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT: Add the new quantity change to stock
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products 
    SET current_stock = current_stock + NEW.quantity_change,
        updated_at = NOW()
    WHERE id = NEW.product_id;
    RETURN NEW;

  -- Handle DELETE: Reverse the old quantity change
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.products 
    SET current_stock = current_stock - OLD.quantity_change,
        updated_at = NOW()
    WHERE id = OLD.product_id;
    RETURN OLD;

  -- Handle UPDATE: Reverse old change, apply new change
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only update if the quantity actually changed to avoid unnecessary locking
    IF OLD.quantity_change IS DISTINCT FROM NEW.quantity_change THEN
        UPDATE public.products 
        SET current_stock = current_stock - OLD.quantity_change + NEW.quantity_change,
            updated_at = NOW()
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Ensure the trigger covers all operations
DROP TRIGGER IF EXISTS trigger_update_product_stock ON public.inventory_movements;

CREATE TRIGGER trigger_update_product_stock
  AFTER INSERT OR DELETE OR UPDATE ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_stock();

COMMIT;
