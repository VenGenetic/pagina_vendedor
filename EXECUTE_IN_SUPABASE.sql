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
      'EXPENSE', p_shipping_cost, 'Env√≠o venta ' || p_sale_number,
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
- -   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
 - -   T I E R E D   S Y S T E M   R E S E T   &   A U D I T   L O G G I N G  
 - -   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
  
 - -   1 .   C r e a t e   S y s t e m   E v e n t s   L o g   ( P e r s i s t e n t   A u d i t )  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   s y s t e m _ e v e n t s _ l o g   (  
         i d   U U I D   P R I M A R Y   K E Y   D E F A U L T   g e n _ r a n d o m _ u u i d ( ) ,  
         e v e n t _ t y p e   V A R C H A R ( 5 0 )   N O T   N U L L ,   - -   e . g . ,   ' S Y S T E M _ R E S E T _ T I E R _ 1 '  
         d e s c r i p t i o n   T E X T   N O T   N U L L ,  
         m e t a d a t a   J S O N B   D E F A U L T   ' { } ' : : j s o n b ,   - -   S t o r e   e x t r a   d e t a i l s   i f   n e e d e d  
         c r e a t e d _ a t   T I M E S T A M P   W I T H   T I M E   Z O N E   D E F A U L T   N O W ( ) ,  
         c r e a t e d _ b y   U U I D   - -   L i n k   t o   a u t h . u s e r s   i f   a v a i l a b l e  
 ) ;  
  
 - -   I n d e x   f o r   s e a r c h i n g   l o g s  
 C R E A T E   I N D E X   I F   N O T   E X I S T S   i d x _ s y s t e m _ e v e n t s _ t y p e   O N   s y s t e m _ e v e n t s _ l o g ( e v e n t _ t y p e ) ;  
 C R E A T E   I N D E X   I F   N O T   E X I S T S   i d x _ s y s t e m _ e v e n t s _ d a t e   O N   s y s t e m _ e v e n t s _ l o g ( c r e a t e d _ a t   D E S C ) ;  
  
 - -   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
 - -   T I E R   1 :   T R A N S A C T I O N   R E S E T   ( P r e s e r v e s   S t o c k )  
 - -   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
 C R E A T E   O R   R E P L A C E   F U N C T I O N   r e s e t _ t i e r _ 1 _ t r a n s a c t i o n s ( p _ u s e r _ i d   U U I D ,   p _ f o r m a t t e d _ d a t e   T E X T )  
 R E T U R N S   J S O N B  
 L A N G U A G E   p l p g s q l  
 S E C U R I T Y   D E F I N E R   - -   R u n   a s   s u p e r u s e r   t o   b y p a s s   R L S / c o n s t r a i n t s   i f   n e e d e d  
 A S   $ $  
 D E C L A R E  
         v _ a c c o u n t   R E C O R D ;  
 B E G I N  
         - -   1 .   L o g   t h e   a t t e m p t  
         I N S E R T   I N T O   s y s t e m _ e v e n t s _ l o g   ( e v e n t _ t y p e ,   d e s c r i p t i o n ,   c r e a t e d _ b y )  
         V A L U E S   ( ' R E S E T _ T I E R _ 1 ' ,   ' I n i c i a n d o   l i m p i e z a   d e   t r a n s a c c i o n e s   ( S t o c k   p r e s e r v a d o )   -   '   | |   p _ f o r m a t t e d _ d a t e ,   p _ u s e r _ i d ) ;  
  
         - -   2 .   D i s a b l e   T r i g g e r s   t o   p r e v e n t   s i d e - e f f e c t s   ( e . g . ,   a u t o - s t o c k   u p d a t e s   o r   b a l a n c e   p r o p o g a t i o n )  
         A L T E R   T A B L E   t r a n s a c t i o n s   D I S A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   i n v e n t o r y _ m o v e m e n t s   D I S A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   a c c o u n t s   D I S A B L E   T R I G G E R   A L L ;  
  
         - -   3 .   C l e a r   T r a n s a c t i o n a l   T a b l e s  
         - -   N o t e :   W e   D E L E T E   i n s t e a d   o f   T R U N C A T E   t o   b e   s e l e c t i v e   i f   n e e d e d ,   b u t   h e r e   w e   w a n t   a l l   t r a n s a c t i o n s   g o n e .  
         D E L E T E   F R O M   s a l e _ i t e m s ;  
         D E L E T E   F R O M   s a l e s ;  
         D E L E T E   F R O M   t r a n s a c t i o n s ;   - -   W i p e s   I n c o m e ,   E x p e n s e s ,   T r a n s f e r s ,   C o m m i s s i o n   P a y o u t s  
  
         - -   4 .   R e - c l a s s i f y   I n v e n t o r y   M o v e m e n t s   ( C r u c i a l   S t e p )  
         - -   D e t a c h   f r o m   t r a n s a c t i o n s   a n d   c o n v e r t   t o   A d j u s t m e n t s   s o   t h e y   d o n ' t   b r e a k   r e p o r t s  
         - -   S e t   t o t a l _ v a l u e   t o   0   t o   w i p e   J o h n ' s   d e b t / c o m m i s s i o n   h i s t o r y  
         U P D A T E   i n v e n t o r y _ m o v e m e n t s    
         S E T    
                 t r a n s a c t i o n _ i d   =   N U L L ,  
                 r e a s o n   =   ' C O U N T _ A D J U S T M E N T ' ,   - -   " A j u s t e   d e   C o n t e o "  
                 t y p e   =   ' A D J U S T M E N T ' ,  
                 t o t a l _ v a l u e   =   0 ,  
                 n o t e s   =   C O A L E S C E ( n o t e s ,   ' ' )   | |   '   [ R e s e t   T 1 :   P r e s e r v a d o ] '  
         W H E R E   t r a n s a c t i o n _ i d   I S   N O T   N U L L   O R   t y p e   I N   ( ' I N ' ,   ' O U T ' ) ;    
         - -   W e   u p d a t e   A L L   b e c a u s e   w e   a r e   e f f e c t i v e l y   r e s e t t i n g   t h e   " h i s t o r y "   b u t   k e e p i n g   t h e   " c o u n t "  
  
         - -   5 .   R e s e t   A c c o u n t   B a l a n c e s  
         U P D A T E   a c c o u n t s   S E T   b a l a n c e   =   0 . 0 0 ;  
  
         - -   6 .   I n s e r t   O p e n i n g   B a l a n c e   T r a n s a c t i o n s   ( 0 . 0 0 )  
         F O R   v _ a c c o u n t   I N   S E L E C T   i d   F R O M   a c c o u n t s   W H E R E   i s _ a c t i v e   =   t r u e   L O O P  
                 I N S E R T   I N T O   t r a n s a c t i o n s   (  
                         t y p e ,   a m o u n t ,   d e s c r i p t i o n ,   a c c o u n t _ i d ,   p a y m e n t _ m e t h o d ,   n o t e s ,   c r e a t e d _ a t ,   c r e a t e d _ b y  
                 )   V A L U E S   (  
                         ' I N C O M E ' ,    
                         0 . 0 0 ,    
                         ' S Y S T E M _ R E S E T _ O P E N I N G _ B A L A N C E ' ,    
                         v _ a c c o u n t . i d ,    
                         ' O T H E R ' ,    
                         ' R e i n i c i o   T i e r   1 :   B a l a n c e   I n i c i a l ' ,    
                         N O W ( ) ,    
                         p _ u s e r _ i d  
                 ) ;  
         E N D   L O O P ;  
  
         - -   7 .   R e - e n a b l e   T r i g g e r s  
         A L T E R   T A B L E   t r a n s a c t i o n s   E N A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   i n v e n t o r y _ m o v e m e n t s   E N A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   a c c o u n t s   E N A B L E   T R I G G E R   A L L ;  
  
         - -   8 .   F i n a l   L o g  
         I N S E R T   I N T O   s y s t e m _ e v e n t s _ l o g   ( e v e n t _ t y p e ,   d e s c r i p t i o n ,   c r e a t e d _ b y )  
         V A L U E S   ( ' R E S E T _ T I E R _ 1 _ C O M P L E T E ' ,   ' F i n a l i z a d a   l i m p i e z a   d e   t r a n s a c c i o n e s ' ,   p _ u s e r _ i d ) ;  
  
         R E T U R N   j s o n b _ b u i l d _ o b j e c t ( ' s u c c e s s ' ,   t r u e ,   ' m e s s a g e ' ,   ' T r a n s a c c i o n e s   e l i m i n a d a s .   I n v e n t a r i o   p r e s e r v a d o . ' ) ;  
  
 E X C E P T I O N   W H E N   O T H E R S   T H E N  
         - -   R e - e n a b l e   t r i g g e r s   i n   c a s e   o f   e r r o r   t o   a v o i d   l e a v i n g   D B   i n   b a d   s t a t e  
         A L T E R   T A B L E   t r a n s a c t i o n s   E N A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   i n v e n t o r y _ m o v e m e n t s   E N A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   a c c o u n t s   E N A B L E   T R I G G E R   A L L ;  
         R A I S E ;  
 E N D ;  
 $ $ ;  
  
 - -   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
 - -   T I E R   2 :   I N V E N T O R Y   R E S E T   ( W i p e s   S t o c k )  
 - -   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
 C R E A T E   O R   R E P L A C E   F U N C T I O N   r e s e t _ t i e r _ 2 _ i n v e n t o r y ( p _ u s e r _ i d   U U I D ,   p _ f o r m a t t e d _ d a t e   T E X T )  
 R E T U R N S   J S O N B  
 L A N G U A G E   p l p g s q l  
 S E C U R I T Y   D E F I N E R  
 A S   $ $  
 D E C L A R E  
         v _ a c c o u n t   R E C O R D ;  
 B E G I N  
         I N S E R T   I N T O   s y s t e m _ e v e n t s _ l o g   ( e v e n t _ t y p e ,   d e s c r i p t i o n ,   c r e a t e d _ b y )  
         V A L U E S   ( ' R E S E T _ T I E R _ 2 ' ,   ' I n i c i a n d o   r e i n i c i o   d e   i n v e n t a r i o   ( S t o c k   a   0 )   -   '   | |   p _ f o r m a t t e d _ d a t e ,   p _ u s e r _ i d ) ;  
  
         - -   D i s a b l e   T r i g g e r s  
         A L T E R   T A B L E   t r a n s a c t i o n s   D I S A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   i n v e n t o r y _ m o v e m e n t s   D I S A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   p r o d u c t s   D I S A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   a c c o u n t s   D I S A B L E   T R I G G E R   A L L ;  
  
         - -   W I P E   E V E R Y T H I N G   e x c e p t   d e f i n i t i o n s  
         D E L E T E   F R O M   i n v e n t o r y _ m o v e m e n t s ;  
         D E L E T E   F R O M   s a l e _ i t e m s ;  
         D E L E T E   F R O M   s a l e s ;  
         D E L E T E   F R O M   t r a n s a c t i o n s ;  
  
         - -   R e s e t   S t o c k   t o   0  
         U P D A T E   p r o d u c t s   S E T   c u r r e n t _ s t o c k   =   0 ;  
          
         - -   R e s e t   B a l a n c e s  
         U P D A T E   a c c o u n t s   S E T   b a l a n c e   =   0 . 0 0 ;  
  
         - -   I n s e r t   O p e n i n g   B a l a n c e s  
         F O R   v _ a c c o u n t   I N   S E L E C T   i d   F R O M   a c c o u n t s   W H E R E   i s _ a c t i v e   =   t r u e   L O O P  
                 I N S E R T   I N T O   t r a n s a c t i o n s   (  
                         t y p e ,   a m o u n t ,   d e s c r i p t i o n ,   a c c o u n t _ i d ,   p a y m e n t _ m e t h o d ,   n o t e s ,   c r e a t e d _ a t ,   c r e a t e d _ b y  
                 )   V A L U E S   (  
                         ' I N C O M E ' ,   0 . 0 0 ,   ' S Y S T E M _ R E S E T _ O P E N I N G _ B A L A N C E ' ,   v _ a c c o u n t . i d ,   ' O T H E R ' ,   ' R e i n i c i o   T i e r   2 :   B a l a n c e   I n i c i a l ' ,   N O W ( ) ,   p _ u s e r _ i d  
                 ) ;  
         E N D   L O O P ;  
  
         - -   R e - e n a b l e   T r i g g e r s  
         A L T E R   T A B L E   t r a n s a c t i o n s   E N A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   i n v e n t o r y _ m o v e m e n t s   E N A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   p r o d u c t s   E N A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   a c c o u n t s   E N A B L E   T R I G G E R   A L L ;  
  
         I N S E R T   I N T O   s y s t e m _ e v e n t s _ l o g   ( e v e n t _ t y p e ,   d e s c r i p t i o n ,   c r e a t e d _ b y )  
         V A L U E S   ( ' R E S E T _ T I E R _ 2 _ C O M P L E T E ' ,   ' F i n a l i z a d o   r e i n i c i o   d e   i n v e n t a r i o ' ,   p _ u s e r _ i d ) ;  
  
         R E T U R N   j s o n b _ b u i l d _ o b j e c t ( ' s u c c e s s ' ,   t r u e ,   ' m e s s a g e ' ,   ' I n v e n t a r i o   y   t r a n s a c c i o n e s   e l i m i n a d o s . ' ) ;  
  
 E X C E P T I O N   W H E N   O T H E R S   T H E N  
         A L T E R   T A B L E   t r a n s a c t i o n s   E N A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   i n v e n t o r y _ m o v e m e n t s   E N A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   p r o d u c t s   E N A B L E   T R I G G E R   A L L ;  
         A L T E R   T A B L E   a c c o u n t s   E N A B L E   T R I G G E R   A L L ;  
         R A I S E ;  
 E N D ;  
 $ $ ;  
  
 - -   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
 - -   T I E R   3 :   F A C T O R Y   R E S E T   ( H a r d   R e s e t )  
 - -   = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =  
 C R E A T E   O R   R E P L A C E   F U N C T I O N   r e s e t _ t i e r _ 3 _ h a r d ( p _ u s e r _ i d   U U I D ,   p _ f o r m a t t e d _ d a t e   T E X T )  
 R E T U R N S   J S O N B  
 L A N G U A G E   p l p g s q l  
 S E C U R I T Y   D E F I N E R  
 A S   $ $  
 B E G I N  
         I N S E R T   I N T O   s y s t e m _ e v e n t s _ l o g   ( e v e n t _ t y p e ,   d e s c r i p t i o n ,   c r e a t e d _ b y )  
         V A L U E S   ( ' R E S E T _ T I E R _ 3 ' ,   ' F A C T O R Y   R E S E T   I N I T I A T E D   -   '   | |   p _ f o r m a t t e d _ d a t e ,   p _ u s e r _ i d ) ;  
  
         - -   T R U N C A T E   C A S C A D E   ( F a s t e s t ,   c l e a n e s t   w i p e )  
         T R U N C A T E   T A B L E   s a l e _ i t e m s ,   s a l e s ,   i n v e n t o r y _ m o v e m e n t s ,   t r a n s a c t i o n s   R E S T A R T   I D E N T I T Y   C A S C A D E ;  
  
         - -   R e s e t   A c c o u n t s   ( H a r d   D e l e t e   a n d   R e s e e d )  
         D E L E T E   F R O M   a c c o u n t s ;  
          
         I N S E R T   I N T O   a c c o u n t s   ( n a m e ,   t y p e ,   b a l a n c e ,   c u r r e n c y ,   i s _ a c t i v e )   V A L U E S  
             ( ' B A N C O   P I C H I N C H A   K A T I U S K A ' ,   ' B A N K ' ,   0 . 0 0 ,   ' U S D ' ,   t r u e ) ,  
             ( ' B A N C O   G U A Y A Q U I L   K A T I U S K A ' ,   ' B A N K ' ,   0 . 0 0 ,   ' U S D ' ,   t r u e ) ,  
             ( ' E F E C T I V O ' ,   ' C A S H ' ,   0 . 0 0 ,   ' U S D ' ,   t r u e ) ,  
             ( ' C a j a   G r a n d e ' ,   ' C A S H ' ,   0 . 0 0 ,   ' U S D ' ,   t r u e ) ;  
  
         - -   R e s e t   P r o d u c t s   S t o c k  
         U P D A T E   p r o d u c t s   S E T   c u r r e n t _ s t o c k   =   0 ;  
  
         - -   N o t e :   W e   d o   N O T   t r u n c a t e   s y s t e m _ e v e n t s _ l o g   s o   w e   h a v e   a   r e c o r d   o f   t h i s   e v e n t  
         I N S E R T   I N T O   s y s t e m _ e v e n t s _ l o g   ( e v e n t _ t y p e ,   d e s c r i p t i o n ,   c r e a t e d _ b y )  
         V A L U E S   ( ' R E S E T _ T I E R _ 3 _ C O M P L E T E ' ,   ' F a c t o r y   R e s e t   C o m p l e t e .   S y s t e m   l o o k s   l i k e   n e w . ' ,   p _ u s e r _ i d ) ;  
  
         R E T U R N   j s o n b _ b u i l d _ o b j e c t ( ' s u c c e s s ' ,   t r u e ,   ' m e s s a g e ' ,   ' S i s t e m a   r e i n i c i a d o   a   e s t a d o   d e   f √ ° b r i c a . ' ) ;  
 E N D ;  
 $ $ ;  
 