
-- Verification Script for Stock Reservation Logic
-- Run this in Supabase SQL Editor

BEGIN;

-- 1. Create a Test Product
DO $$
DECLARE
    v_product_id UUID;
    v_reservation_id UUID;
    v_stock_before INT;
    v_reserved_before INT;
    v_stock_after INT;
    v_reserved_after INT;
BEGIN
    RAISE NOTICE '--- STARTING RESERVATION TEST ---';

    INSERT INTO products (sku, name, cost_price, selling_price, current_stock, reserved_stock)
    VALUES ('TEST-SQL-RES', 'Test SQL Reservation', 10, 20, 10, 0)
    RETURNING id INTO v_product_id;

    RAISE NOTICE 'Created Product: %', v_product_id;

    -- 2. Reserve Stock (5 units)
    -- reserve_stock returns JSONB: {"success": true, "reservation_id": "UUID"}
    SELECT (reserve_stock(v_product_id, 5, 'test-session')->>'reservation_id')::UUID INTO v_reservation_id;

    RAISE NOTICE 'Reserved 5 units. Reservation ID: %', v_reservation_id;

    -- 3. Verify Intermediate State
    SELECT current_stock, reserved_stock INTO v_stock_before, v_reserved_before
    FROM products WHERE id = v_product_id;

    IF v_reserved_before = 5 THEN
        RAISE NOTICE '✅ PASS: Reserved stock is 5';
    ELSE
        RAISE EXCEPTION '❌ FAIL: Reserved stock should be 5, got %', v_reserved_before;
    END IF;

    -- 4. Simulate Sale & Commit Reservation
    -- In the real app, process_sale_with_reservation does both:
    -- A) Inserts Inventory Movement (Reduces Stock)
    -- B) Commits Reservation (Reduces Reserved Stock)
    
    -- A) Simulate Stock Reduction (Sale)
    UPDATE products SET current_stock = current_stock - 5 WHERE id = v_product_id;
    
    -- B) Commit Reservation
    PERFORM commit_reservation(v_reservation_id);
    RAISE NOTICE 'Committed reservation.';

    -- 5. Verify Final State
    SELECT current_stock, reserved_stock INTO v_stock_after, v_reserved_after
    FROM products WHERE id = v_product_id;

    IF v_stock_after = 5 AND v_reserved_after = 0 THEN
        RAISE NOTICE '✅ PASS: Final stock is 5, Reserved is 0';
    ELSE
        RAISE EXCEPTION '❌ FAIL: Expected Stock 5/Reserved 0. Got Stock %/Reserved %', v_stock_after, v_reserved_after;
    END IF;

    -- Cleanup (Rollback to keep DB clean, or Commit if you want to keep trace)
    -- We raise exception to rollback everything automatically for a clean test
    RAISE NOTICE '🎉 ALL TESTS PASSED SUCCESSFULLY';
    -- RAISE EXCEPTION 'Test Complete - Rolling back changes'; 
END $$;

ROLLBACK; -- Always rollback the test changes
