-- Test script for Product Cost History Logic
-- Run this in the Supabase logic to verify the triggers.

BEGIN;

-- 1. Ensure Tax Rate is set (Mocking if needed, but normally handled by system_settings)
-- We check if it exists, if not we insert a dummy one for the transaction
INSERT INTO system_settings (key, value)
VALUES ('financial_config', '{"tax_rate": 0.15}')
ON CONFLICT (key) DO UPDATE 
SET value = '{"tax_rate": 0.15}';

-- 2. Create a test product
INSERT INTO products (
    sku, name, cost_price, selling_price, current_stock, min_stock_level, max_stock_level, is_active
) VALUES (
    'TEST-COST-001', 'Test Product Cost', 100.00, 200.00, 10, 5, 20, true
);

-- Verify initial history record (created by trigger on INSERT)
DO $$
DECLARE
    v_count INTEGER;
    v_cost_after_tax NUMERIC;
BEGIN
    SELECT count(*), cost_after_tax INTO v_count, v_cost_after_tax
    FROM product_cost_history 
    WHERE product_id = (SELECT id FROM products WHERE sku = 'TEST-COST-001');

    IF v_count = 1 AND v_cost_after_tax = 115.00 THEN
        RAISE NOTICE '✅ Test 1 Passed: Initial insert created history with correct tax calculation (100 * 1.15 = 115)';
    ELSE
        RAISE EXCEPTION '❌ Test 1 Failed: Expected 1 history record with cost 115, found % records with cost %', v_count, v_cost_after_tax;
    END IF;
END $$;

-- 3. Update the product cost
UPDATE products 
SET cost_price = 200.00 
WHERE sku = 'TEST-COST-001';

-- Verify update history record
DO $$
DECLARE
    v_count INTEGER;
    v_latest_cost NUMERIC;
    v_old_active_until TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Check total records
    SELECT count(*) INTO v_count
    FROM product_cost_history 
    WHERE product_id = (SELECT id FROM products WHERE sku = 'TEST-COST-001');

    -- Check latest record
    SELECT cost_after_tax INTO v_latest_cost
    FROM product_cost_history 
    WHERE product_id = (SELECT id FROM products WHERE sku = 'TEST-COST-001')
    ORDER BY active_from DESC LIMIT 1;

    -- Check if previous record was closed
    SELECT active_until INTO v_old_active_until
    FROM product_cost_history 
    WHERE product_id = (SELECT id FROM products WHERE sku = 'TEST-COST-001')
    ORDER BY active_from ASC LIMIT 1;

    IF v_count = 2 AND v_latest_cost = 230.00 AND v_old_active_until IS NOT NULL THEN
        RAISE NOTICE '✅ Test 2 Passed: Update created new history (200 * 1.15 = 230) and closed previous record.';
    ELSE
        RAISE EXCEPTION '❌ Test 2 Failed: Logic error in update trigger. Count: %, Latest: % (Expected 230)', v_count, v_latest_cost;
    END IF;
END $$;

ROLLBACK; -- Always rollback test data
RAISE NOTICE 'Test Complete - Changes Rolled Back';
