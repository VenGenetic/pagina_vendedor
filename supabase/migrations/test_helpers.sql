-- Helper RPCs for Stress Test (SAFE TO DELETE LATER)
-- Usage: Used by scripts/stress-test-integrity.ts

-- Drop first because we are changing parameter names
DROP FUNCTION IF EXISTS test_setup_product(text, text, integer);

CREATE OR REPLACE FUNCTION test_setup_product(
  p_sku TEXT,
  p_name TEXT,
  p_initial_stock INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Bypass RLS
AS $$
DECLARE
  v_product_id UUID;
  v_account_id UUID;
BEGIN
  -- 1. Ensure a Bank Account exists for testing
  SELECT id INTO v_account_id FROM accounts LIMIT 1;
  IF v_account_id IS NULL THEN
     INSERT INTO accounts (name, type, balance, currency, is_active)
     VALUES ('TEST BANK', 'BANK', 1000, 'USD', true)
     RETURNING id INTO v_account_id;
  END IF;

  -- 2. Create/Reset Product
  DELETE FROM products WHERE sku = p_sku;
  
  INSERT INTO products (
    sku, name, description, 
    cost_price, selling_price, 
    current_stock, min_stock_level, category
  ) VALUES (
    p_sku, p_name, 'Stress Test Item',
    50, 100,
    p_initial_stock, 0, 'TEST'
  ) RETURNING id INTO v_product_id;

  -- 3. Create Initial Movement (if stock > 0)
  IF p_initial_stock > 0 THEN
      INSERT INTO inventory_movements (
        product_id, type, quantity_change, unit_price, total_value,
        reason, notes, created_at
      ) VALUES (
        v_product_id, 'IN', p_initial_stock, 50, (50 * p_initial_stock),
        'INITIAL', 'Test Setup Initial Stock', NOW()
      );
  END IF;

  RETURN jsonb_build_object(
    'product_id', v_product_id,
    'account_id', v_account_id
  );
END;
$$;

DROP FUNCTION IF EXISTS test_cleanup_product(text);
CREATE OR REPLACE FUNCTION test_cleanup_product(
  p_product_sku TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  SELECT id INTO v_product_id FROM products WHERE sku = p_product_sku;
  
  IF v_product_id IS NOT NULL THEN
    DELETE FROM inventory_movements WHERE product_id = v_product_id;
    DELETE FROM products WHERE id = v_product_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION test_cleanup_sales(
  p_sale_prefix TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sale_ids UUID[];
BEGIN
  SELECT array_agg(id) INTO v_sale_ids 
  FROM sales 
  WHERE sale_number LIKE p_sale_prefix || '%';

  IF v_sale_ids IS NOT NULL THEN
    DELETE FROM sale_items WHERE sale_id = ANY(v_sale_ids);
    DELETE FROM transactions WHERE reference_number LIKE p_sale_prefix || '%';
    DELETE FROM sales WHERE id = ANY(v_sale_ids);
  END IF;
END;
$$;
