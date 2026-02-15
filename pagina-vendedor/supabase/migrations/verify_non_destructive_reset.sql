-- Verification Script
DO $$
DECLARE
    v_product_id UUID;
    v_user_id UUID;
    v_res JSONB;
    v_stock INTEGER;
    v_movement_count INTEGER;
    v_tx_count INTEGER;
    v_merma_balance DECIMAL;
BEGIN
    -- 1. Setup
    SELECT id INTO v_user_id FROM auth.users LIMIT 1;
    
    INSERT INTO public.products (name, sku, current_stock, cost_price, selling_price)
    VALUES ('Test Product Neg', 'TEST-NEG-001', -10, 5.00, 8.25)
    RETURNING id INTO v_product_id;

    RAISE NOTICE 'Created test product with stock -10';

    -- 2. Test reset_negative_stock_v2
    v_res := public.reset_negative_stock_v2(v_user_id);
    RAISE NOTICE 'Result of reset: %', v_res;

    -- 3. Verify Product Stock
    SELECT current_stock INTO v_stock FROM public.products WHERE id = v_product_id;
    IF v_stock != 0 THEN
        RAISE EXCEPTION 'Stock reset failed. Expected 0, got %', v_stock;
    END IF;
    RAISE NOTICE 'Verification: Stock is 0';

    -- 4. Verify Movement
    SELECT COUNT(*) INTO v_movement_count 
    FROM public.inventory_movements 
    WHERE product_id = v_product_id AND reason = 'SHRINKAGE';
    
    IF v_movement_count = 0 THEN
        RAISE EXCEPTION 'Inventory movement record missing';
    END IF;
    RAISE NOTICE 'Verification: Movement record exists';

    -- 5. Verify Transaction
    SELECT COUNT(*) INTO v_tx_count 
    FROM public.transactions 
    WHERE account_id = (SELECT id FROM public.accounts WHERE name = 'Gasto por Merma')
    AND description LIKE '%SHRINKAGE%';
    
    IF v_tx_count = 0 THEN
        RAISE EXCEPTION 'Financial transaction record missing';
    END IF;
    RAISE NOTICE 'Verification: Transaction record exists';

    -- 6. Cleanup
    DELETE FROM public.sale_items WHERE product_id = v_product_id;
    DELETE FROM public.inventory_movements WHERE product_id = v_product_id;
    DELETE FROM public.products WHERE id = v_product_id;
    
    RAISE NOTICE 'Verification successful and cleaned up.';

EXCEPTION WHEN others THEN
    RAISE NOTICE 'Verification failed: %', SQLERRM;
    -- Cleanup on failure too
    DELETE FROM public.inventory_movements WHERE product_id = v_product_id;
    DELETE FROM public.products WHERE id = v_product_id;
    RAISE;
END $$;
