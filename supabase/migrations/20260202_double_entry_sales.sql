-- Migration: Double Entry Sales
-- Date: 2026-02-02
-- Description: Adds double-entry support for sales (Debit Asset / Credit Revenue)

-- 1. Schema Changes
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS group_id UUID;

ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS is_nominal BOOLEAN DEFAULT false;

-- 2. Seed Revenue Account
-- Check if it exists first to avoid duplicates (though name is not unique constraint by default, good to check)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE name = 'Ingresos por Ventas') THEN
        INSERT INTO accounts (name, type, balance, is_nominal, currency, is_active)
        VALUES ('Ingresos por Ventas', 'CASH', 0.00, true, 'USD', true);
    END IF;
END $$;

-- 3. Backfill Legacy Data
UPDATE transactions 
SET group_id = uuid_generate_v4() 
WHERE group_id IS NULL;

-- 4. Update RPC process_sale_transaction
CREATE OR REPLACE FUNCTION process_sale_transaction(
  p_sale_number TEXT,
  p_customer_id_number TEXT, -- Cédula/RUC
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
  
  -- New variables for Double Entry
  v_group_id UUID;
  v_revenue_account_id UUID;
BEGIN
  -- 1. Map payment method to enum if needed (or ensure frontend sends correct values)
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

  -- 3. Customer Logic (Upsert)
  IF p_customer_id_number IS NOT NULL AND p_customer_id_number != '' THEN
    -- Check if customer exists
    SELECT id INTO v_customer_id FROM customers WHERE identity_document = p_customer_id_number;

    IF v_customer_id IS NOT NULL THEN
      -- Update existing customer with new info if provided (and not empty)
      UPDATE customers SET
        name = COALESCE(NULLIF(p_customer_name, ''), name),
        phone = COALESCE(NULLIF(p_customer_phone, ''), phone),
        city = COALESCE(NULLIF(p_customer_city, ''), city),
        address = COALESCE(NULLIF(p_customer_address, ''), address),
        email = COALESCE(NULLIF(p_customer_email, ''), email),
        updated_at = NOW()
      WHERE id = v_customer_id;
    ELSE
      -- Create new customer
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

  -- 4. Create Sale Record
  INSERT INTO sales (
    sale_number, 
    customer_id, -- Link to Customers Table
    customer_name, -- Historical Snapshot
    customer_phone, 
    customer_email,
    subtotal, tax, discount, total, 
    account_id, payment_status, notes, 
    created_at
  ) VALUES (
    p_sale_number, 
    v_customer_id,
    p_customer_name, 
    p_customer_phone, 
    p_customer_email,
    p_subtotal, p_tax, p_discount, p_total,
    p_account_id, 'PAID', p_notes,
    NOW()
  ) RETURNING id INTO v_sale_id;

  -- 5. Process Items (Create Sale Items & Inventory Movements)
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
  END LOOP;

  -- 6. Create Income Transactions (DOUBLE ENTRY)
  
  -- Generate Group ID for this set of transactions
  v_group_id := uuid_generate_v4();
  
  -- Get Revenue Account ID
  SELECT id INTO v_revenue_account_id FROM accounts WHERE name = 'Ingresos por Ventas' LIMIT 1;
  IF v_revenue_account_id IS NULL THEN
    RAISE EXCEPTION 'Internal Error: Revenue Account "Ingresos por Ventas" not found. Please run seed script.';
  END IF;

  -- Entry 1: Asset / Debit (Increases Money in Bank/Cash)
  INSERT INTO transactions (
    type, amount, description, 
    account_id, payment_method, reference_number,
    notes, created_at, created_by, group_id
  ) VALUES (
    'INCOME', p_total, 'Venta ' || p_sale_number || COALESCE(' - ' || p_customer_name, ''),
    p_account_id, v_payment_method_enum, p_sale_number,
    p_notes, NOW(), p_user_id, v_group_id
  ) RETURNING id INTO v_transaction_id;

  -- Entry 2: Revenue / Credit (Records Income Source)
  -- Uses negative amount to represent Credit in this sign-based ledger.
  INSERT INTO transactions (
    type, amount, description, 
    account_id, payment_method, reference_number,
    notes, created_at, created_by, group_id
  ) VALUES (
    'INCOME', -p_total, 'Ingreso por Venta ' || p_sale_number,
    v_revenue_account_id, v_payment_method_enum, p_sale_number,
    p_notes, NOW(), p_user_id, v_group_id
  );

  -- 6b. Link Transaction to Sale (Task 1.1)
  UPDATE public.sales SET transaction_id = v_transaction_id WHERE id = v_sale_id;

  -- 7. Create Shipping Expense (Optional)
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
    -- Note: Shipping expense is left as single entry for now as per instructions (Part 1: Sales).
  END IF;

  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'transaction_id', v_transaction_id,
    'customer_id', v_customer_id,
    'group_id', v_group_id
  );

EXCEPTION WHEN OTHERS THEN
  -- All changes are rolled back automatically by Postgres on exception
  RAISE;
END;
$$;
