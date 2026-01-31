-- Add snapshot columns to sales table
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS customer_document VARCHAR(50),
ADD COLUMN IF NOT EXISTS customer_city VARCHAR(100),
ADD COLUMN IF NOT EXISTS customer_address TEXT;

-- Update the RPC function to insert these values
CREATE OR REPLACE FUNCTION process_sale_transaction(
  p_sale_number TEXT,
  p_customer_id_number TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT,
  p_customer_city TEXT,
  p_customer_address TEXT,
  p_subtotal DECIMAL,
  p_tax DECIMAL,
  p_discount DECIMAL,
  p_total DECIMAL,
  p_shipping_cost DECIMAL,
  p_account_id UUID,
  p_payment_method TEXT,
  p_items JSONB,
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
  v_customer_id UUID;
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
  v_payment_method_enum := p_payment_method;

  -- Validate Stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    SELECT current_stock, name INTO v_current_stock, v_product_name
    FROM products
    WHERE id = v_product_id
    FOR UPDATE;

    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto: %. Stock actual: %, Solicitado: %', v_product_name, v_current_stock, v_quantity;
    END IF;
  END LOOP;

  -- Customer Upsert Logic
  IF p_customer_id_number IS NOT NULL AND p_customer_id_number != '' THEN
    SELECT id INTO v_customer_id FROM customers WHERE identity_document = p_customer_id_number;

    IF v_customer_id IS NOT NULL THEN
      UPDATE customers SET
        name = COALESCE(NULLIF(p_customer_name, ''), name),
        phone = COALESCE(NULLIF(p_customer_phone, ''), phone),
        city = COALESCE(NULLIF(p_customer_city, ''), city),
        address = COALESCE(NULLIF(p_customer_address, ''), address),
        email = COALESCE(NULLIF(p_customer_email, ''), email),
        updated_at = NOW()
      WHERE id = v_customer_id;
    ELSE
      INSERT INTO customers (
        identity_document, name, phone, email, city, address, created_at, updated_at
      ) VALUES (
        p_customer_id_number, 
        COALESCE(p_customer_name, 'Cliente Sin Nombre'), 
        p_customer_phone, 
        p_customer_email, 
        p_customer_city, 
        p_customer_address,
        NOW(), NOW()
      ) RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  -- Create Sale Record with SNAPSHOTS
  INSERT INTO sales (
    sale_number, customer_id, 
    customer_name, customer_phone, customer_email,
    customer_document, customer_city, customer_address, -- New Columns
    subtotal, tax, discount, total, 
    account_id, payment_status, notes, created_at
  ) VALUES (
    p_sale_number, v_customer_id, 
    p_customer_name, p_customer_phone, p_customer_email,
    p_customer_id_number, p_customer_city, p_customer_address, -- Values
    p_subtotal, p_tax, p_discount, p_total,
    p_account_id, 'PAID', p_notes, NOW()
  ) RETURNING id INTO v_sale_id;

  -- Process Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::DECIMAL;
    v_item_discount := COALESCE((v_item->>'discount')::DECIMAL, 0);
    v_cost_unit := COALESCE((v_item->>'cost_unit')::DECIMAL, 0);
    
    v_item_subtotal := (v_quantity * v_price) - v_item_discount;
    v_item_cost_total := v_quantity * v_cost_unit;

    INSERT INTO inventory_movements (
      product_id, type, quantity_change, unit_price, total_value,
      reason, notes, created_at, created_by
    ) VALUES (
      v_product_id, 'OUT', -v_quantity, v_price, v_item_subtotal,
      'SALE', 'Venta ' || p_sale_number, NOW(), p_user_id
    ) RETURNING id INTO v_movement_id;

    INSERT INTO sale_items (
      sale_id, product_id, quantity, unit_price, discount,
      subtotal, inventory_movement_id
    ) VALUES (
      v_sale_id, v_product_id, v_quantity, v_price, v_item_discount,
      v_item_subtotal, v_movement_id
    );
  END LOOP;

  -- Create Income Transaction
  INSERT INTO transactions (
    type, amount, description, account_id, payment_method, reference_number, notes, created_at, created_by
  ) VALUES (
    'INCOME', p_total, 'Venta ' || p_sale_number || COALESCE(' - ' || p_customer_name, ''),
    p_account_id, v_payment_method_enum, p_sale_number, p_notes, NOW(), p_user_id
  ) RETURNING id INTO v_transaction_id;

  -- Create Shipping Expense
  IF p_shipping_cost > 0 AND p_shipping_account_id IS NOT NULL THEN
    INSERT INTO transactions (
      type, amount, description, account_id, payment_method, reference_number, notes, created_at, created_by
    ) VALUES (
      'EXPENSE', p_shipping_cost, 'Envío venta ' || p_sale_number,
      p_shipping_account_id, v_payment_method_enum, p_sale_number, p_notes, NOW(), p_user_id
    ) RETURNING id INTO v_shipping_tx_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'transaction_id', v_transaction_id,
    'customer_id', v_customer_id
  );
END;
$$;
