-- Migration: Auto-calculate Selling Price Trigger
-- Purpose: Enforce that selling_price is always 65% higher than cost_price.

-- 1. Create the function to calculate price
CREATE OR REPLACE FUNCTION fn_auto_calculate_selling_price()
RETURNS TRIGGER AS $$
BEGIN
    -- Formula: Selling Price = Cost Price + 65% markup
    -- We use 1.65 multiplier.
    -- We can round to 2 decimal places to be safe with currency.
    IF NEW.cost_price IS NOT NULL THEN
        NEW.selling_price := ROUND((NEW.cost_price * 1.65), 2);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger
-- We drop it first to ensure idempotency if we re-run this script
DROP TRIGGER IF EXISTS tr_auto_calculate_selling_price ON products;

CREATE TRIGGER tr_auto_calculate_selling_price
BEFORE INSERT OR UPDATE OF cost_price, selling_price ON products
FOR EACH ROW
EXECUTE FUNCTION fn_auto_calculate_selling_price();

-- 3. Backfill existing data
-- Update all existing products to comply with the new rule
UPDATE products
SET selling_price = ROUND((cost_price * 1.65), 2)
WHERE cost_price IS NOT NULL;
