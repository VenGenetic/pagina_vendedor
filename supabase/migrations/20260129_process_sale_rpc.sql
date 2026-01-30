-- Function: process_sale_transaction
-- Description: Handles the complete sale process atomically.
-- 1. Validates stock for all items
-- 2. Creates sale record
-- 3. Creates sale items and inventory movements
-- 4. Creates income transaction
-- 5. Handles optional shipping expense

CREATE OR REPLACE FUNCTION process_sale_transaction(
  p_sale_number TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT,
  p_subtotal DECIMAL,
  p_tax DECIMAL,
  p_discount DECIMAL,
  p_total DECIMAL,
  p_shipping_cost DECIMAL,
  p_account_id UUID,
  p_payment_method TEXT, -- 'CASH', 'CARD', etc. (Mapped from frontend)
  p_items JSONB, -- Array of objects: { product_id, quantity, price, discount, cost_unit }
  p_user_id UUID,
  p_user_name TEXT,
  p_notes TEXT,
  p_shipping_account_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_id UUID;
  v_transaction_id UUID;
  v_shipping_tx_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_price DECIMAL;
  v_item_discount DECIMAL;
  v_cost_unit DECIMAL;
  v_current_stock INTEGER;
  v_product_name TEXT;
  v_item_subtotal DECIMAL;
  v_item_cost_total DECIMAL;
  v_movement_id UUID;
  v_payment_method_enum VARCHAR;
BEGIN
  -- 1. Map payment method to enum if needed (or ensure frontend sends correct values)
  -- The table check constraint allows: 'CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER'
  -- We assume p_payment_method is already correct or mapped.
  v_payment_method_enum := p_payment_method;

  -- 2. Validate Stock for ALL items first
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    -- Lock the product row for update to prevent race conditions
    SELECT current_stock, name INTO v_current_stock, v_product_name
    FROM products
    WHERE id = v_product_id
    FOR UPDATE;

    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto: %. Stock actual: %, Solicitado: %', v_product_name, v_current_stock, v_quantity;
    END IF;
  END LOOP;

  -- 3. Create Sale Record
  INSERT INTO sales (
    sale_number, customer_name, customer_phone, customer_email,
    subtotal, tax, discount, total, 
    account_id, payment_status, notes, 
    created_at
  ) VALUES (
    p_sale_number, p_customer_name, p_customer_phone, p_customer_email,
    p_subtotal, p_tax, p_discount, p_total,
    p_account_id, 'PAID', p_notes,
    NOW()
  ) RETURNING id INTO v_sale_id;

  -- 4. Process Items (Create Sale Items & Inventory Movements)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::DECIMAL;
    v_item_discount := COALESCE((v_item->>'discount')::DECIMAL, 0);
    v_cost_unit := COALESCE((v_item->>'cost_unit')::DECIMAL, 0);
    
    v_item_subtotal := (v_quantity * v_price) - v_item_discount;
    v_item_cost_total := v_quantity * v_cost_unit;

    -- Create Inventory Movement (OUT)
    INSERT INTO inventory_movements (
      product_id, type, quantity_change, unit_price, total_value,
      reason, notes, created_at, created_by
    ) VALUES (
      v_product_id, 'OUT', -v_quantity, v_price, v_item_subtotal,
      'SALE', 'Venta ' || p_sale_number, NOW(), p_user_id
    ) RETURNING id INTO v_movement_id;

    -- Create Sale Item
    INSERT INTO sale_items (
      sale_id, product_id, quantity, unit_price, discount,
      subtotal, inventory_movement_id
    ) VALUES (
      v_sale_id, v_product_id, v_quantity, v_price, v_item_discount,
      v_item_subtotal, v_movement_id
    );

    -- Trigger 'trigger_update_product_stock' will automatically update products.current_stock
    -- because we inserted into inventory_movements.
  END LOOP;

  -- 5. Create Income Transaction
  INSERT INTO transactions (
    type, amount, description, 
    account_id, payment_method, reference_number,
    notes, created_at, created_by
  ) VALUES (
    'INCOME', p_total, 'Venta ' || p_sale_number || COALESCE(' - ' || p_customer_name, ''),
    p_account_id, v_payment_method_enum, p_sale_number,
    p_notes, NOW(), p_user_id
  ) RETURNING id INTO v_transaction_id;

  -- 6. Create Shipping Expense (Optional)
  IF p_shipping_cost > 0 AND p_shipping_account_id IS NOT NULL THEN
    INSERT INTO transactions (
      type, amount, description,
      account_id, payment_method, reference_number,
      notes, created_at, created_by
    ) VALUES (
      'EXPENSE', p_shipping_cost, 'Envío venta ' || p_sale_number,
      p_shipping_account_id, v_payment_method_enum, p_sale_number,
      p_notes, NOW(), p_user_id
    ) RETURNING id INTO v_shipping_tx_id;
  END IF;

  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'transaction_id', v_transaction_id
  );

EXCEPTION WHEN OTHERS THEN
  -- All changes are rolled back automatically by Postgres on exception
  RAISE;
END;
$$;
