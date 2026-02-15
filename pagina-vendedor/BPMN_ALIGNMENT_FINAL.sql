-- ============================================
-- FINAL BPMN ALIGNMENT MIGRATION (CONSOLIDATED)
-- ============================================
-- Includes ALL changes for Financial Management, Sales, Restock, and Product processes.
-- Logic: Saga Pattern, Reservation Pattern, Atomic Linkage, Forgiveness Law (Stock Reset).
-- ============================================

BEGIN;

-- ============================================================================
-- SECTION 1: SCHEMA UPDATES
-- ============================================================================

-- 1.1 Sales Status & Source
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_status_check 
  CHECK (payment_status IN ('PAID', 'PENDING', 'PARTIAL', 'CANCELLED', 'REVERSED', 'PARTIAL_RETURN'));

ALTER TABLE sales ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'POS' 
    CHECK (source IN ('POS', 'WHATSAPP', 'NOTION', 'API', 'OTHER'));

ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_proof_url TEXT;

-- 1.2 Product Flags
ALTER TABLE products ADD COLUMN IF NOT EXISTS needs_price_review BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_stock INTEGER DEFAULT 0;

-- 1.3 Demand Hits (Restock Process)
CREATE TABLE IF NOT EXISTS demand_hits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    hit_type VARCHAR(20) NOT NULL CHECK (hit_type IN ('SALE', 'STOCK_OUT', 'SEARCH', 'DROPSHIP')),
    quantity INTEGER DEFAULT 1,
    source VARCHAR(50),
    sale_id UUID REFERENCES sales(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 Stock Reservations (Sales Process)
CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    session_id TEXT, 
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMMITTED', 'RELEASED', 'EXPIRED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    committed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ
);

-- 1.5 Drop Ship Orders
CREATE TABLE IF NOT EXISTS dropship_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES sales(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    customer_price DECIMAL(12,2) NOT NULL,
    provider_cost DECIMAL(12,2),
    status VARCHAR(20) DEFAULT 'PENDING',
    provider_name TEXT,
    transaction_group_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.6 Admin Alerts (Financial Management)
CREATE TABLE IF NOT EXISTS admin_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'MEDIUM',
    title TEXT NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'OPEN',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.7 Price Proposals (Restock Process)
CREATE TABLE IF NOT EXISTS price_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  inventory_movement_id UUID REFERENCES inventory_movements(id),
  current_cost DECIMAL(12,2) NOT NULL,
  current_stock INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  new_unit_cost DECIMAL(12,2) NOT NULL,
  proposed_cost DECIMAL(12,2) NOT NULL,
  proposed_price DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EDITED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_price_proposals_status ON price_proposals(status);
CREATE INDEX IF NOT EXISTS idx_price_proposals_product ON price_proposals(product_id);

-- 1.8 Audit Enhancement
ALTER TABLE product_cost_history ADD COLUMN IF NOT EXISTS related_proposal_id UUID REFERENCES price_proposals(id);

-- ============================================================================
-- SECTION 2: HELPER RPCS (Reservations, Demand, Alerts)
-- ============================================================================

CREATE OR REPLACE FUNCTION log_demand_hit(p_product_id UUID, p_hit_type TEXT, p_quantity INTEGER DEFAULT 1, p_source TEXT DEFAULT 'POS', p_sale_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_hit_id UUID;
BEGIN
    INSERT INTO demand_hits (product_id, hit_type, quantity, source, sale_id)
    VALUES (p_product_id, p_hit_type, p_quantity, p_source, p_sale_id) RETURNING id INTO v_hit_id;
    RETURN v_hit_id;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_stock(p_product_id UUID, p_quantity INTEGER, p_session_id TEXT DEFAULT NULL, p_expiry_minutes INTEGER DEFAULT 15)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_available INTEGER;
    v_reservation_id UUID;
BEGIN
    SELECT current_stock - reserved_stock INTO v_available FROM products WHERE id = p_product_id FOR UPDATE;
    IF v_available < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient stock');
    END IF;
    INSERT INTO stock_reservations (product_id, quantity, session_id, expires_at)
    VALUES (p_product_id, p_quantity, p_session_id, NOW() + (p_expiry_minutes || ' minutes')::INTERVAL) RETURNING id INTO v_reservation_id;
    UPDATE products SET reserved_stock = reserved_stock + p_quantity WHERE id = p_product_id;
    RETURN jsonb_build_object('success', true, 'reservation_id', v_reservation_id);
END;
$$;

CREATE OR REPLACE FUNCTION commit_reservation(p_reservation_id UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_reservation RECORD;
BEGIN
    SELECT * INTO v_reservation FROM stock_reservations WHERE id = p_reservation_id FOR UPDATE;
    IF v_reservation.status != 'ACTIVE' THEN RETURN jsonb_build_object('success', false); END IF;
    UPDATE stock_reservations SET status = 'COMMITTED', committed_at = NOW() WHERE id = p_reservation_id;
    UPDATE products SET reserved_stock = reserved_stock - v_reservation.quantity WHERE id = v_reservation.product_id;
    RETURN jsonb_build_object('success', true, 'quantity', v_reservation.quantity);
END;
$$;

CREATE OR REPLACE FUNCTION release_reservation(p_reservation_id UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_reservation RECORD;
BEGIN
    SELECT * INTO v_reservation FROM stock_reservations WHERE id = p_reservation_id FOR UPDATE;
    IF v_reservation.status != 'ACTIVE' THEN RETURN jsonb_build_object('success', false); END IF;
    UPDATE stock_reservations SET status = 'RELEASED', released_at = NOW() WHERE id = p_reservation_id;
    UPDATE products SET reserved_stock = reserved_stock - v_reservation.quantity WHERE id = v_reservation.product_id;
    RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================================
-- SECTION 3: CORE WORKFLOW RPCS
-- ============================================================================

-- 3.1 RESTOCK (WAC, Forgiveness Law, Financial First)
CREATE OR REPLACE FUNCTION process_restock_v3(
    p_account_id UUID,
    p_provider_name TEXT,
    p_payment_method TEXT,
    p_total_amount DECIMAL,
    p_reference_number TEXT,
    p_notes TEXT,
    p_user_id UUID,
    p_items JSONB, -- Array of {product_id, quantity, cost_unit}
    p_tax_percent DECIMAL DEFAULT 15,    
    p_margin_percent DECIMAL DEFAULT 65, 
    p_discount_percent DECIMAL DEFAULT 0 
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_group_id UUID := uuid_generate_v4();
    v_transaction_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_unit_cost DECIMAL;
    v_current_stock INTEGER;
    v_product_cost DECIMAL;
    v_movement_id UUID;
    v_baseline_stock INTEGER;
    v_baseline_cost DECIMAL;
    v_final_wac DECIMAL;
    v_selling_price DECIMAL;
BEGIN
    -- Financial First
    IF p_total_amount > 0 THEN
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method, 
            reference_number, notes, transaction_date, group_id, created_by
        ) VALUES (
            'EXPENSE', p_total_amount,
            CONCAT('Compra de inventario', CASE WHEN p_provider_name IS NOT NULL THEN ' - ' || p_provider_name ELSE '' END),
            p_account_id, p_payment_method, p_reference_number, p_notes, NOW(), v_group_id, p_user_id
        ) RETURNING id INTO v_transaction_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'cost_unit')::DECIMAL;

        INSERT INTO inventory_movements (
            product_id, type, quantity_change, unit_price, total_value, 
            transaction_id, reason, created_by, movement_date
        ) VALUES (v_product_id, 'IN', v_quantity, v_unit_cost, v_quantity * v_unit_cost, v_transaction_id, 'PURCHASE', p_user_id, NOW())
        RETURNING id INTO v_movement_id;

        SELECT current_stock, cost_price INTO v_current_stock, v_product_cost FROM products WHERE id = v_product_id;

        -- Forgiveness Law (Reset negative stock)
        IF v_current_stock < 0 THEN
            v_baseline_stock := 0;
            v_baseline_cost := v_unit_cost;
        ELSE
            v_baseline_stock := v_current_stock - v_quantity;
            v_baseline_cost := v_product_cost;
            IF v_baseline_stock < 0 THEN v_baseline_stock := 0; v_baseline_cost := v_unit_cost; END IF;
        END IF;

        -- WAC Calculation
        IF (v_baseline_stock + v_quantity) > 0 THEN
            v_final_wac := ((v_baseline_stock * v_baseline_cost) + (v_quantity * v_unit_cost)) / (v_baseline_stock + v_quantity);
        ELSE
            v_final_wac := v_unit_cost;
        END IF;

        -- Price Proposal
        v_selling_price := (v_final_wac * (1 + (p_tax_percent/100))) / (1 - (p_margin_percent/100));

        DELETE FROM price_proposals WHERE product_id = v_product_id AND status = 'PENDING';
        INSERT INTO price_proposals (
            product_id, inventory_movement_id, current_cost, current_stock,
            new_quantity, new_unit_cost, proposed_cost, proposed_price, status
        ) VALUES (
            v_product_id, v_movement_id, v_product_cost, v_current_stock - v_quantity,
            v_quantity, v_unit_cost, ROUND(v_final_wac, 2), ROUND(v_selling_price, 2), 'PENDING'
        );
        UPDATE products SET needs_price_review = false WHERE id = v_product_id;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'group_id', v_group_id);
END;
$$;


-- 3.2 SALES (Reservation, Drop Shipping, Atomic)
CREATE OR REPLACE FUNCTION process_sale_with_reservation(
    p_sale_number TEXT,
    p_customer_id_number TEXT,
    p_customer_name TEXT,
    p_subtotal DECIMAL,
    p_total DECIMAL,
    p_account_id UUID,
    p_payment_method TEXT,
    p_items JSONB, 
    p_user_id UUID,
    p_customer_phone TEXT DEFAULT NULL,
    p_customer_email TEXT DEFAULT NULL,
    p_customer_city TEXT DEFAULT NULL,
    p_customer_address TEXT DEFAULT NULL,
    p_tax DECIMAL DEFAULT 0,
    p_discount DECIMAL DEFAULT 0,
    p_shipping_cost DECIMAL DEFAULT 0,
    p_user_name TEXT DEFAULT 'System',
    p_notes TEXT DEFAULT NULL,
    p_shipping_account_id UUID DEFAULT NULL,
    p_source TEXT DEFAULT 'POS'
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_sale_id UUID;
    v_transaction_id UUID;
    v_customer_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_reservation_id UUID;
    v_current_stock INTEGER;
    v_group_id UUID := uuid_generate_v4();
    v_ds_order_id UUID;
    v_movement_id UUID;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_reservation_id := (v_item->>'reservation_id')::UUID;
        IF v_reservation_id IS NOT NULL THEN
            PERFORM commit_reservation(v_reservation_id);
        ELSE
            -- Logic for non-reserved items (Stock Check)
            v_product_id := (v_item->>'product_id')::UUID;
            v_quantity := (v_item->>'quantity')::INTEGER;
            IF NOT COALESCE((v_item->>'is_dropship')::BOOLEAN, FALSE) THEN
                SELECT current_stock - reserved_stock INTO v_current_stock FROM products WHERE id = v_product_id FOR UPDATE;
                IF v_current_stock < v_quantity THEN
                     RAISE EXCEPTION 'Stock insuficiente';
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- Upsert Customer
    IF p_customer_id_number IS NOT NULL AND p_customer_id_number != '' THEN
        SELECT id INTO v_customer_id FROM customers WHERE identity_document = p_customer_id_number;
        IF v_customer_id IS NOT NULL THEN
            UPDATE customers SET name = p_customer_name WHERE id = v_customer_id;
        ELSE
            INSERT INTO customers (identity_document, name, phone, email, city, address)
            VALUES (p_customer_id_number, p_customer_name, p_customer_phone, p_customer_email, p_customer_city, p_customer_address)
            RETURNING id INTO v_customer_id;
        END IF;
    END IF;

    -- Create Sale
    INSERT INTO sales (
        sale_number, customer_id, customer_name, customer_phone, customer_email,
        subtotal, tax, discount, total, account_id, payment_status, notes, source
    ) VALUES (
        p_sale_number, v_customer_id, p_customer_name, p_customer_phone, p_customer_email,
        p_subtotal, p_tax, p_discount, p_total, p_account_id, 'PAID', p_notes, p_source
    ) RETURNING id INTO v_sale_id;

    -- Process Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        
        IF COALESCE((v_item->>'is_dropship')::BOOLEAN, FALSE) THEN
            -- Drop Shipping
             INSERT INTO dropship_orders (
                sale_id, product_id, quantity, customer_price, provider_cost, 
                provider_name, transaction_group_id, status
            ) VALUES (
                v_sale_id, v_product_id, v_quantity, (v_item->>'price')::DECIMAL, 
                (v_item->>'provider_cost')::DECIMAL, v_item->>'provider_name', v_group_id, 'CONFIRMED'
            ) RETURNING id INTO v_ds_order_id;
            
            -- Record Expense for DropShip
             INSERT INTO transactions (
                type, amount, description, account_id, payment_method, 
                reference_number, group_id, created_by, transaction_date
            ) VALUES (
                'EXPENSE', ((v_item->>'provider_cost')::DECIMAL * v_quantity), 
                'Provider DS: ' || (v_item->>'provider_name'),
                p_account_id, 'OTHER', 'DS-' || v_ds_order_id, v_group_id, p_user_id, NOW()
            );
            
            INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
            VALUES (v_sale_id, v_product_id, v_quantity, (v_item->>'price')::DECIMAL, (v_item->>'price')::DECIMAL * v_quantity);
        ELSE
            -- Normal Inventory
            INSERT INTO inventory_movements (
                product_id, type, quantity_change, unit_price, total_value, reason, notes, created_by
            ) VALUES (
                v_product_id, 'OUT', -v_quantity, (v_item->>'price')::DECIMAL, 
                (v_item->>'price')::DECIMAL * v_quantity, 'SALE', 'Venta ' || p_sale_number, p_user_id
            ) RETURNING id INTO v_movement_id;

            INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal, inventory_movement_id)
            VALUES (v_sale_id, v_product_id, v_quantity, (v_item->>'price')::DECIMAL, (v_item->>'price')::DECIMAL * v_quantity, v_movement_id);
            
            PERFORM log_demand_hit(v_product_id, 'SALE', v_quantity, p_source, v_sale_id);
        END IF;
    END LOOP;

    -- Income Transaction
    INSERT INTO transactions (
        type, amount, description, account_id, payment_method, 
        reference_number, notes, group_id, created_by, created_by_name, transaction_date
    ) VALUES (
        'INCOME', p_total, 'Venta ' || p_sale_number,
        p_account_id, p_payment_method, p_sale_number, p_notes, v_group_id, p_user_id, p_user_name, NOW()
    );

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'group_id', v_group_id);
END;
$$;


-- 3.3 PRODUCT CREATION V2 (Equity & Opening Balance)
CREATE OR REPLACE FUNCTION create_product_v2(
    p_sku TEXT,
    p_name TEXT,
    p_category TEXT,
    p_cost_price DECIMAL,
    p_selling_price DECIMAL,
    p_current_stock INTEGER, -- Opening Balance
    p_min_stock INTEGER,
    p_max_stock INTEGER,
    p_target_margin DECIMAL,
    p_user_id UUID,
    p_image_url TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_product_id UUID;
    v_group_id UUID;
    v_account_id UUID;
    v_equity_account_id UUID;
BEGIN
    INSERT INTO products (
        sku, name, category, cost_price, selling_price, current_stock,
        min_stock, max_stock, target_margin, image_url, description, brand
    ) VALUES (
        p_sku, p_name, p_category, p_cost_price, p_selling_price, 0, -- Start 0, adjust later
        p_min_stock, p_max_stock, p_target_margin, p_image_url, p_description, p_brand
    ) RETURNING id INTO v_product_id;

    -- Handle Opening Balance
    IF p_current_stock > 0 THEN
        v_group_id := uuid_generate_v4();
        
        -- Create Inventory Movement (OPENING_BALANCE)
        INSERT INTO inventory_movements (
            product_id, type, quantity_change, unit_price, total_value,
            reason, notes, created_by
        ) VALUES (
            v_product_id, 'IN', p_current_stock, p_cost_price, p_current_stock * p_cost_price,
            'ADJUSTMENT', 'Inventario Inicial (Equity)', p_user_id
        );

        -- Find or Create Equity Account
        SELECT id INTO v_equity_account_id FROM accounts WHERE name = 'Capital Social / Inventario Inicial';
        IF v_equity_account_id IS NULL THEN
            INSERT INTO accounts (name, type, balance, is_nominal) VALUES ('Capital Social / Inventario Inicial', 'NOMINAL', 0, true) RETURNING id INTO v_equity_account_id;
        END IF;
        
        -- Find or Create Asset Account (Inventory Asset) - Optional, typically implicit in stock value.
        -- But for double entry, we need to balance the Equity. 
        -- We won't create a Transaction unless we track Inventory Value in a specific Account.
        -- Usage: 'INCOME' type transaction to Equity Account to represent initialization?
        -- For now, let's just log it as a Non-Cash Transaction if needed, or skip if we rely on Inventory vs Equity Valuation.
        -- BPMN says: "Record Opening Equity".
        
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method, group_id, created_by, notes
        ) VALUES (
            'INCOME', p_current_stock * p_cost_price,
            'Apertura de Inventario: ' || p_name,
            v_equity_account_id, 'OTHER', v_group_id, p_user_id, 'Registro de Capital Inicial en Inventario'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'product_id', v_product_id);
END;
$$; 

-- 3.4 Transfer Funds (Saga)
CREATE OR REPLACE FUNCTION transfer_funds(
  p_source_account_id UUID,
  p_destination_account_id UUID,
  p_amount DECIMAL,
  p_description TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_transaction_id UUID;
  v_group_id UUID := uuid_generate_v4();
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Monto positivo requerido'; END IF;

  INSERT INTO transactions (
    type, amount, description, account_id, account_out_id, account_in_id,
    group_id, created_by
  ) VALUES (
    'TRANSFER', -1 * p_amount, p_description, p_source_account_id,
    p_source_account_id, p_destination_account_id, v_group_id, p_user_id
  ) RETURNING id INTO v_transaction_id;

  RETURN json_build_object('success', true, 'transaction_id', v_transaction_id, 'group_id', v_group_id);
END;
$$ LANGUAGE plpgsql;

-- 3.5 Reversal Logic (Correct Status)
CREATE OR REPLACE FUNCTION restore_inventory_for_reversal_v2(
    p_reference_number TEXT,
    p_user_id UUID,
    p_user_name TEXT,
    p_reversal_transaction_id UUID
) RETURNS VOID AS $$
DECLARE
    v_sale_record RECORD;
    v_sale_item RECORD;
    v_inventory_movement RECORD;
BEGIN
     SELECT * INTO v_sale_record FROM sales WHERE sale_number = p_reference_number;
     
     IF v_sale_record IS NOT NULL THEN
        UPDATE sales SET payment_status = 'REVERSED', updated_at = NOW() WHERE id = v_sale_record.id;
        
        FOR v_sale_item IN SELECT * FROM sale_items WHERE sale_id = v_sale_record.id LOOP
            IF v_sale_item.inventory_movement_id IS NOT NULL THEN
                SELECT * INTO v_inventory_movement FROM inventory_movements WHERE id = v_sale_item.inventory_movement_id;
                IF v_inventory_movement IS NOT NULL THEN
                    INSERT INTO inventory_movements (
                        product_id, type, quantity_change, unit_price, total_value,
                        transaction_id, reason, notes, created_at, created_by, created_by_name
                    ) VALUES (
                        v_inventory_movement.product_id, 'IN', ABS(v_inventory_movement.quantity_change),
                        v_inventory_movement.unit_price, ABS(v_inventory_movement.total_value),
                        p_reversal_transaction_id, 'RETURN', 'Reversión ' || p_reference_number,
                        NOW(), p_user_id, p_user_name
                    );
                END IF;
            END IF;
        END LOOP;
     END IF;
END;
$$ LANGUAGE plpgsql;

-- 3.6 Price Proposal Management
CREATE OR REPLACE FUNCTION approve_price_proposal(
    p_proposal_id UUID,
    p_user_id UUID,
    p_final_price DECIMAL DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_proposal RECORD;
    v_final_cost DECIMAL;
    v_final_selling_price DECIMAL;
BEGIN
    SELECT * INTO v_proposal FROM price_proposals WHERE id = p_proposal_id AND status = 'PENDING';
    IF v_proposal IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Proposal not found'); END IF;
    
    v_final_cost := v_proposal.proposed_cost;
    v_final_selling_price := COALESCE(p_final_price, v_proposal.proposed_price);

    PERFORM set_config('app.current_proposal_id', p_proposal_id::TEXT, true);

    UPDATE products SET cost_price = v_final_cost, selling_price = v_final_selling_price, updated_at = NOW() WHERE id = v_proposal.product_id;
    UPDATE price_proposals SET status = 'APPROVED', applied_at = NOW(), applied_by = p_user_id, proposed_price = v_final_selling_price WHERE id = p_proposal_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION reject_price_proposal(p_proposal_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE price_proposals SET status = 'REJECTED', applied_at = NOW(), applied_by = p_user_id WHERE id = p_proposal_id AND status = 'PENDING';
    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3.7 Potential Valuation View
CREATE OR REPLACE VIEW view_potential_inventory_valuation AS
SELECT 
  p.id as product_id, p.sku, p.name as product_name, p.current_stock, p.cost_price as current_unit_cost,
  (p.current_stock * p.cost_price) as current_total_value, pp.id as proposal_id,
  pp.proposed_cost as potential_unit_cost, pp.proposed_price as potential_selling_price,
  (p.current_stock * pp.proposed_cost) as potential_total_value,
  ((p.current_stock * pp.proposed_cost) - (p.current_stock * p.cost_price)) as value_diff,
  pp.created_at as proposal_date
FROM products p JOIN price_proposals pp ON p.id = pp.product_id WHERE pp.status = 'PENDING';

COMMIT;
