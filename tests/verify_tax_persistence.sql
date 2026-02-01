-- Test Script: Verify Variable Tax Rate Persistence
-- Scenario: 
-- 1. Create product with Tax 15%
-- 2. Change Global Tax 16%
-- 3. Update Product Cost
-- 4. Verify History contains BOTH 15% and 16% records (Snapshotting works)

BEGIN;

-- 1. Setup Initial State (Tax = 15%)
INSERT INTO system_settings (key, value)
VALUES ('financial_config', '{"tax_rate": 0.15}')
ON CONFLICT (key) DO UPDATE 
SET value = '{"tax_rate": 0.15}';

-- Create Product (Should log 15% in history)
INSERT INTO products (
    sku, name, cost_price, selling_price, current_stock, min_stock_level, max_stock_level, is_active
) VALUES (
    'TAX-TEST-001', 'Tax Test Product', 100.00, 200.00, 10, 5, 20, true
);

-- 2. Change Global Tax to 16%
UPDATE system_settings 
SET value = '{"tax_rate": 0.16}'
WHERE key = 'financial_config';

-- 3. Update Product Cost (Should log 16% in history)
UPDATE products 
SET cost_price = 200.00 
WHERE sku = 'TAX-TEST-001';

-- 4. Verification Check
DO $$
DECLARE
    v_record_15 RECORD;
    v_record_16 RECORD;
BEGIN
    -- Find the first record (created at insert)
    SELECT * INTO v_record_15
    FROM product_cost_history 
    WHERE product_id = (SELECT id FROM products WHERE sku = 'TAX-TEST-001')
    AND cost_before_tax = 100.00;

    -- Find the second record (created at update)
    SELECT * INTO v_record_16
    FROM product_cost_history 
    WHERE product_id = (SELECT id FROM products WHERE sku = 'TAX-TEST-001')
    AND cost_before_tax = 200.00;

    -- CHECK 1: Did the first record KEEP the 15% tax?
    IF v_record_15.tax_rate = 0.15 AND v_record_15.cost_after_tax = 115.00 THEN
        RAISE NOTICE '✅ Test Part 1 Passed: Old history preserved tax rate of 0.15 despite global change.';
    ELSE
        RAISE EXCEPTION '❌ Test Part 1 Failed: Old record corrupted or incorrect. Tax: %, Cost: %', v_record_15.tax_rate, v_record_15.cost_after_tax;
    END IF;

    -- CHECK 2: Did the new record USE the 16% tax?
    IF v_record_16.tax_rate = 0.16 AND v_record_16.cost_after_tax = 232.00 THEN -- 200 * 1.16 = 232
        RAISE NOTICE '✅ Test Part 2 Passed: New history used new tax rate of 0.16.';
    ELSE
        RAISE EXCEPTION '❌ Test Part 2 Failed: New record failed to use new tax. Tax: %, Cost: %', v_record_16.tax_rate, v_record_16.cost_after_tax;
    END IF;

END $$;

ROLLBACK;
RAISE NOTICE 'Test Complete - Changes Rolled Back';
