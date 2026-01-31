-- SCRIPT COMPLETO Y DEFINITIVO - MODULO DE CLIENTES & CONFIGURACION
-- EJECUTAR TODO ESTE ARCHIVO EN SUPABASE SQL EDITOR

-- ==========================================
-- 1. TABLA DE CLIENTES (CUSTOMERS)
-- ==========================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identity_document VARCHAR(50) UNIQUE NOT NULL, -- Cedula / RUC
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(100),
  city VARCHAR(100),
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_customers_identity ON customers(identity_document);

-- ==========================================
-- 2. TABLA DE VENTAS (SALES) - COLUMNAS SNAPSHOT
-- ==========================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);

-- Agregar columnas "Snapshot"
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_document VARCHAR(50);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_city VARCHAR(100);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_address TEXT;

-- ==========================================
-- 3. UTILITY: SETTINGS (MODULO DE CONFIGURACION)
-- ==========================================

-- 3.1 Tabla Key-Value
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1 NOT NULL, -- Optimistic Concurency
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- 3.2 Tabla de Auditoria
CREATE TABLE IF NOT EXISTS settings_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(50) REFERENCES system_settings(key),
    old_value JSONB,
    new_value JSONB,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3.3 Policies (Security)
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Allow read access to authenticated users') THEN
        CREATE POLICY "Allow read access to authenticated users" 
        ON system_settings FOR SELECT 
        TO authenticated 
        USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'Allow update access to authenticated users') THEN
        CREATE POLICY "Allow update access to authenticated users" 
        ON system_settings FOR UPDATE 
        TO authenticated 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;

-- 3.4 RPC: update_system_setting (CORREGIDO)
CREATE OR REPLACE FUNCTION update_system_setting(
    p_key VARCHAR,
    p_new_value JSONB,
    p_expected_version INTEGER,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_version INTEGER;
    v_old_value JSONB;
    v_updated_rows INTEGER;
BEGIN
    -- Check current version and value
    SELECT version, value INTO v_current_version, v_old_value
    FROM system_settings
    WHERE key = p_key;

    IF NOT FOUND THEN
        -- If setting doesn't exist, insert it
        INSERT INTO system_settings (key, value, version, updated_by, updated_at)
        VALUES (p_key, p_new_value, 1, p_user_id, NOW());
        
        -- Audit Log (Creation)
        INSERT INTO settings_audit_logs (setting_key, old_value, new_value, changed_by)
        VALUES (p_key, NULL, p_new_value, p_user_id);
        
        RETURN jsonb_build_object('success', true, 'new_version', 1);
    END IF;

    -- Concurrency Check
    IF v_current_version != p_expected_version THEN
        RAISE EXCEPTION 'Concurrency Error: Record has changed. Expected v%, found v%', p_expected_version, v_current_version;
    END IF;

    -- Update
    UPDATE system_settings
    SET 
        value = p_new_value,
        version = version + 1,
        updated_at = NOW(),
        updated_by = p_user_id
    WHERE key = p_key AND version = p_expected_version;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

    IF v_updated_rows = 0 THEN
        RAISE EXCEPTION 'Concurrency Error: Update failed (Race Condition).';
    END IF;

    -- Audit Log (Update)
    INSERT INTO settings_audit_logs (setting_key, old_value, new_value, changed_by)
    VALUES (p_key, v_old_value, p_new_value, p_user_id);

    RETURN jsonb_build_object('success', true, 'new_version', v_current_version + 1);
END;
$$;

-- 3.5 Seed Initial Data (Valores por defecto)
INSERT INTO system_settings (key, value, description)
VALUES 
    ('business_profile', '{"name": "Mi Negocio", "address": "", "website": ""}', 'Informacion general del negocio'),
    ('financial_config', '{"tax_rate": 0.15, "currency": "USD", "currency_symbol": "$", "tax_enabled": true}', 'Configuracion fiscal y monetaria'),
    ('inventory_prefs', '{"low_stock_threshold": 5, "allow_stock_negative": false}', 'Preferencias de inventario')
ON CONFLICT (key) DO NOTHING;

-- 3.6 Enable Realtime (CORREGIDO)
DO $$
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'system_settings'
  ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE system_settings;
  END IF;
END
$$;

-- ==========================================
-- 4. RPC: process_sale_transaction (CORREGIDO)
-- ==========================================
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

  -- 1. Validar Stock
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

  -- 2. Logica de Cliente Upsert
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

  -- 3. Crear Venta
  INSERT INTO sales (
    sale_number, customer_id, 
    customer_name, customer_phone, customer_email,
    customer_document, customer_city, customer_address,
    subtotal, tax, discount, total, 
    account_id, payment_status, notes, created_at
  ) VALUES (
    p_sale_number, v_customer_id, 
    p_customer_name, p_customer_phone, p_customer_email,
    p_customer_id_number, p_customer_city, p_customer_address,
    p_subtotal, p_tax, p_discount, p_total,
    p_account_id, 'PAID', p_notes, NOW()
  ) RETURNING id INTO v_sale_id;

  -- 4. Items y Movimientos
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::DECIMAL;
    v_item_discount := COALESCE((v_item->>'discount')::DECIMAL, 0);
    v_cost_unit := COALESCE((v_item->>'cost_unit')::DECIMAL, 0);
    
    v_item_subtotal := (v_quantity * v_price) - v_item_discount;
    
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

  -- 5. Transaccion de Ingreso
  INSERT INTO transactions (
    type, amount, description, account_id, payment_method, reference_number, notes, created_at, created_by
  ) VALUES (
    'INCOME', p_total, 'Venta ' || p_sale_number || COALESCE(' - ' || p_customer_name, ''),
    p_account_id, v_payment_method_enum, p_sale_number, p_notes, NOW(), p_user_id
  ) RETURNING id INTO v_transaction_id;

  -- 6. Shipping (Opcional)
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
