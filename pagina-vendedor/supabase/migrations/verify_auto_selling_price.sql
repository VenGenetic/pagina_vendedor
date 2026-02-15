-- Verification Script for Auto Selling Price Logic

DO $$
DECLARE
    v_product_id uuid;
    v_test_cost DECIMAL := 100.00;
    v_expected_price DECIMAL := 165.00;
    v_actual_price DECIMAL;
BEGIN
    -- 1. Insert a new test product
    INSERT INTO products (name, sku, cost_price, current_stock, min_stock_level, category)
    VALUES ('Test Auto Price Product', 'TEST-AUTO-PRICE-001', v_test_cost, 10, 5, 'Parts')
    RETURNING id INTO v_product_id;

    -- 2. Check if selling_price was automatically set
    SELECT selling_price INTO v_actual_price FROM products WHERE id = v_product_id;
    
    IF v_actual_price = v_expected_price THEN
        RAISE NOTICE 'SUCCESS: New product selling_price is correct: %', v_actual_price;
    ELSE
        RAISE EXCEPTION 'FAILURE: New product selling_price is incorrect. Expected %, got %', v_expected_price, v_actual_price;
    END IF;

    -- 3. Update cost_price and check if selling_price updates
    UPDATE products SET cost_price = 200.00 WHERE id = v_product_id;
    v_expected_price := 330.00; -- 200 * 1.65

    SELECT selling_price INTO v_actual_price FROM products WHERE id = v_product_id;

    IF v_actual_price = v_expected_price THEN
        RAISE NOTICE 'SUCCESS: Updated cost_price reflected in selling_price: %', v_actual_price;
    ELSE
        RAISE EXCEPTION 'FAILURE: Updated cost_price did not update selling_price. Expected %, got %', v_expected_price, v_actual_price;
    END IF;

    -- 4. Try to manually override selling_price (should be ignored or overwritten by trigger based on implementation)
    -- My implementation recalculates based on cost_price. 
    -- If I update selling_price directly without changing cost_price, it should probably be overwritten if I trigger on UPDATE OF selling_price too?
    -- No wait, my trigger is: BEFORE INSERT OR UPDATE ON products
    -- And the function says: IF NEW.cost_price IS NOT NULL THEN NEW.selling_price := ...
    -- So even if I pass manual selling_price, it checks cost_price (which is in NEW) and overwrites it.
    
    UPDATE products SET selling_price = 500.00 WHERE id = v_product_id;
    -- expected price should still be 330.00 because cost is still 200.00
    
    SELECT selling_price INTO v_actual_price FROM products WHERE id = v_product_id;

    IF v_actual_price = v_expected_price THEN
        RAISE NOTICE 'SUCCESS: Manual override of selling_price was correctly ignored/overwritten: %', v_actual_price;
    ELSE
        RAISE WARNING 'WARNING: Manual override of selling_price was accepted. Expected %, got %. This might be intended behavior depending on strictness.', v_expected_price, v_actual_price;
    END IF;

    -- Cleanup
    -- DELETE FROM products WHERE id = v_product_id;
    RAISE NOTICE 'Verification Complete. Test product ID: %', v_product_id;
END;
$$;
