-- ============================================================================
-- Migration: BPMN Full Alignment
-- Date: 2026-02-05
-- Description: Complete alignment with Sales_Process.bpmn, Restock_Process.bpmn, 
--              and Financial_Management_Process.bpmn
-- ============================================================================

-- ============================================================================
-- SECTION 1: DEMAND AGGREGATION SYSTEM
-- BPMN Reference: Restock_Process.bpmn - Activity_QueryDemandStudy
-- ============================================================================

-- 1.1 Create demand_hits table
CREATE TABLE IF NOT EXISTS demand_hits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    hit_type VARCHAR(20) NOT NULL CHECK (hit_type IN ('SALE', 'STOCK_OUT', 'SEARCH', 'DROPSHIP')),
    quantity INTEGER DEFAULT 1,
    source VARCHAR(50), -- 'POS', 'DROPSHIP_FAIL', 'SEARCH', etc.
    sale_id UUID REFERENCES sales(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_hits_product ON demand_hits(product_id);
CREATE INDEX IF NOT EXISTS idx_demand_hits_created ON demand_hits(created_at);

COMMENT ON TABLE demand_hits IS 'BPMN: Tracks product demand for smart restock suggestions';

-- 1.2 Function to log demand hit
CREATE OR REPLACE FUNCTION log_demand_hit(
    p_product_id UUID,
    p_hit_type TEXT,
    p_quantity INTEGER DEFAULT 1,
    p_source TEXT DEFAULT 'POS',
    p_sale_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_hit_id UUID;
BEGIN
    INSERT INTO demand_hits (product_id, hit_type, quantity, source, sale_id)
    VALUES (p_product_id, p_hit_type, p_quantity, p_source, p_sale_id)
    RETURNING id INTO v_hit_id;
    
    RETURN v_hit_id;
END;
$$;

-- 1.3 Function to query demand study
CREATE OR REPLACE FUNCTION query_demand_study(
    p_product_ids UUID[],
    p_lookback_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    current_stock INTEGER,
    current_cost DECIMAL,
    suggested_quantity INTEGER,
    demand_score INTEGER,
    previous_cost DECIMAL,
    price_drop_detected BOOLEAN,
    name_in_system TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.current_stock,
        p.cost_price AS current_cost,
        -- Suggested quantity = max(demand in last N days, min reorder point)
        GREATEST(
            COALESCE(
                (SELECT SUM(dh.quantity) FROM demand_hits dh 
                 WHERE dh.product_id = p.id 
                 AND dh.created_at > NOW() - (p_lookback_days || ' days')::INTERVAL),
                0
            )::INTEGER,
            COALESCE(p.min_stock, 5)
        ) AS suggested_quantity,
        -- Demand score for prioritization
        COALESCE(
            (SELECT COUNT(*) FROM demand_hits dh 
             WHERE dh.product_id = p.id 
             AND dh.created_at > NOW() - (p_lookback_days || ' days')::INTERVAL),
            0
        )::INTEGER AS demand_score,
        -- Previous cost from history
        COALESCE(
            (SELECT pch.cost_before_tax 
             FROM product_cost_history pch 
             WHERE pch.product_id = p.id 
             ORDER BY pch.created_at DESC 
             LIMIT 1 OFFSET 1),
            p.cost_price
        ) AS previous_cost,
        -- Price drop detection
        CASE 
            WHEN p.cost_price < COALESCE(
                (SELECT pch.cost_before_tax 
                 FROM product_cost_history pch 
                 WHERE pch.product_id = p.id 
                 ORDER BY pch.created_at DESC 
                 LIMIT 1 OFFSET 1),
                p.cost_price
            ) THEN TRUE
            ELSE FALSE
        END AS price_drop_detected,
        p.name AS name_in_system
    FROM products p
    WHERE p.id = ANY(p_product_ids);
END;
$$;

-- ============================================================================
-- SECTION 2: STOCK RESERVATION PATTERN
-- BPMN Reference: Sales_Process.bpmn - Activity_ReserveStock, Activity_ReleaseReservation
-- ============================================================================

-- 2.1 Add reserved_stock to products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS reserved_stock INTEGER DEFAULT 0;

COMMENT ON COLUMN products.reserved_stock IS 'BPMN: Stock currently reserved for pending sales';

-- 2.2 Create stock_reservations table
CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    session_id TEXT, -- Identifies the sale session
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMMITTED', 'RELEASED', 'EXPIRED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    committed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reservations_product ON stock_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON stock_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_expires ON stock_reservations(expires_at) WHERE status = 'ACTIVE';

COMMENT ON TABLE stock_reservations IS 'BPMN: Temporary stock holds during sale processing';

-- 2.3 RPC: Reserve Stock
CREATE OR REPLACE FUNCTION reserve_stock(
    p_product_id UUID,
    p_quantity INTEGER,
    p_session_id TEXT DEFAULT NULL,
    p_expiry_minutes INTEGER DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_available INTEGER;
    v_reservation_id UUID;
    v_product_name TEXT;
BEGIN
    -- Lock product row
    SELECT current_stock - reserved_stock, name 
    INTO v_available, v_product_name
    FROM products 
    WHERE id = p_product_id
    FOR UPDATE;
    
    IF v_available IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product not found');
    END IF;
    
    IF v_available < p_quantity THEN
        -- Log demand hit for stock-out
        PERFORM log_demand_hit(p_product_id, 'STOCK_OUT', p_quantity, 'RESERVATION_FAIL');
        
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Insufficient stock',
            'available', v_available,
            'requested', p_quantity,
            'product_name', v_product_name
        );
    END IF;
    
    -- Create reservation
    INSERT INTO stock_reservations (product_id, quantity, session_id, expires_at)
    VALUES (p_product_id, p_quantity, p_session_id, NOW() + (p_expiry_minutes || ' minutes')::INTERVAL)
    RETURNING id INTO v_reservation_id;
    
    -- Update reserved stock
    UPDATE products 
    SET reserved_stock = reserved_stock + p_quantity
    WHERE id = p_product_id;
    
    RETURN jsonb_build_object(
        'success', true, 
        'reservation_id', v_reservation_id,
        'expires_at', NOW() + (p_expiry_minutes || ' minutes')::INTERVAL
    );
END;
$$;

-- 2.4 RPC: Commit Reservation (converts to actual stock decrease)
CREATE OR REPLACE FUNCTION commit_reservation(
    p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_reservation RECORD;
BEGIN
    -- Lock and get reservation
    SELECT * INTO v_reservation
    FROM stock_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;
    
    IF v_reservation IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
    END IF;
    
    IF v_reservation.status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation is not active: ' || v_reservation.status);
    END IF;
    
    -- Mark as committed
    UPDATE stock_reservations
    SET status = 'COMMITTED', committed_at = NOW()
    WHERE id = p_reservation_id;
    
    -- Decrease reserved stock (actual stock will be decreased by inventory_movement trigger)
    UPDATE products
    SET reserved_stock = reserved_stock - v_reservation.quantity
    WHERE id = v_reservation.product_id;
    
    RETURN jsonb_build_object('success', true, 'committed_quantity', v_reservation.quantity);
END;
$$;

-- 2.5 RPC: Release Reservation (cancels without stock change)
CREATE OR REPLACE FUNCTION release_reservation(
    p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_reservation RECORD;
BEGIN
    SELECT * INTO v_reservation
    FROM stock_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;
    
    IF v_reservation IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
    END IF;
    
    IF v_reservation.status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation already processed: ' || v_reservation.status);
    END IF;
    
    -- Mark as released
    UPDATE stock_reservations
    SET status = 'RELEASED', released_at = NOW()
    WHERE id = p_reservation_id;
    
    -- Return reserved stock to available
    UPDATE products
    SET reserved_stock = reserved_stock - v_reservation.quantity
    WHERE id = v_reservation.product_id;
    
    RETURN jsonb_build_object('success', true, 'released_quantity', v_reservation.quantity);
END;
$$;

-- 2.6 Function: Auto-release expired reservations (for cron job)
CREATE OR REPLACE FUNCTION auto_release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER := 0;
    v_reservation RECORD;
BEGIN
    FOR v_reservation IN 
        SELECT id, product_id, quantity 
        FROM stock_reservations 
        WHERE status = 'ACTIVE' AND expires_at < NOW()
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE stock_reservations
        SET status = 'EXPIRED', released_at = NOW()
        WHERE id = v_reservation.id;
        
        UPDATE products
        SET reserved_stock = reserved_stock - v_reservation.quantity
        WHERE id = v_reservation.product_id;
        
        v_count := v_count + 1;
    END LOOP;
    
    RETURN v_count;
END;
$$;

-- ============================================================================
-- SECTION 3: DROP SHIPPING SYSTEM
-- BPMN Reference: Sales_Process.bpmn - SubProcess_DropShipping
-- ============================================================================

-- 3.1 Create dropship_orders table
CREATE TABLE IF NOT EXISTS dropship_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES sales(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    customer_price DECIMAL(12,2) NOT NULL, -- What we charge customer
    provider_cost DECIMAL(12,2), -- What provider charges us
    margin_amount DECIMAL(12,2) GENERATED ALWAYS AS (customer_price - COALESCE(provider_cost, 0)) STORED,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED')),
    provider_name TEXT,
    tracking_number TEXT,
    transaction_group_id UUID, -- Links Income + Expense
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dropship_sale ON dropship_orders(sale_id);
CREATE INDEX IF NOT EXISTS idx_dropship_status ON dropship_orders(status);

COMMENT ON TABLE dropship_orders IS 'BPMN: Orders fulfilled directly from provider (no local inventory)';

-- 3.2 RPC: Check Provider Availability (Placeholder)
CREATE OR REPLACE FUNCTION check_provider_availability(
    p_product_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_product RECORD;
BEGIN
    -- Placeholder: In future, this could call external API
    SELECT id, name, sku INTO v_product FROM products WHERE id = p_product_id;
    
    IF v_product IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Product not found');
    END IF;
    
    -- Always return true for now (implement actual provider check later)
    RETURN jsonb_build_object(
        'success', true, 
        'available', true,
        'product_name', v_product.name,
        'message', 'Provider availability check pending implementation'
    );
END;
$$;

-- 3.3 RPC: Create Drop Ship Order with Dual Financial Entry
CREATE OR REPLACE FUNCTION create_dropship_order(
    p_sale_id UUID,
    p_product_id UUID,
    p_quantity INTEGER,
    p_customer_price DECIMAL,
    p_provider_cost DECIMAL,
    p_provider_name TEXT DEFAULT NULL,
    p_account_id UUID DEFAULT NULL, -- Account for income
    p_expense_account_id UUID DEFAULT NULL, -- Account for expense
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_order_id UUID;
    v_group_id UUID := uuid_generate_v4();
    v_income_tx_id UUID;
    v_expense_tx_id UUID;
    v_product_name TEXT;
BEGIN
    -- Get product name
    SELECT name INTO v_product_name FROM products WHERE id = p_product_id;
    
    -- Create the dropship order
    INSERT INTO dropship_orders (
        sale_id, product_id, quantity, customer_price, provider_cost, 
        provider_name, transaction_group_id
    ) VALUES (
        p_sale_id, p_product_id, p_quantity, p_customer_price, p_provider_cost,
        p_provider_name, v_group_id
    ) RETURNING id INTO v_order_id;
    
    -- BPMN: Activity_CreateDualFinancials - Atomic dual entry
    -- 1. Create INCOME transaction (what we charge customer)
    IF p_account_id IS NOT NULL THEN
        INSERT INTO transactions (
            type, amount, description, account_id, 
            reference_number, notes, group_id, created_by, transaction_date
        ) VALUES (
            'INCOME',
            p_customer_price * p_quantity,
            'Drop Ship: ' || v_product_name,
            p_account_id,
            'DS-' || v_order_id::TEXT,
            'Venta Drop Ship',
            v_group_id,
            p_user_id,
            NOW()
        ) RETURNING id INTO v_income_tx_id;
    END IF;
    
    -- 2. Create EXPENSE transaction (what we pay provider)
    IF p_expense_account_id IS NOT NULL AND p_provider_cost IS NOT NULL THEN
        INSERT INTO transactions (
            type, amount, description, account_id,
            reference_number, notes, group_id, created_by, transaction_date
        ) VALUES (
            'EXPENSE',
            p_provider_cost * p_quantity,
            'Costo Proveedor DS: ' || v_product_name,
            p_expense_account_id,
            'DS-' || v_order_id::TEXT,
            'Compra Drop Ship - ' || COALESCE(p_provider_name, 'Proveedor'),
            v_group_id,
            p_user_id,
            NOW()
        ) RETURNING id INTO v_expense_tx_id;
    END IF;
    
    -- BPMN: Activity_LogDemandHit - Record demand for future restocking suggestions
    PERFORM log_demand_hit(p_product_id, 'DROPSHIP', p_quantity, 'DROPSHIP_ORDER', p_sale_id);
    
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'group_id', v_group_id,
        'income_transaction_id', v_income_tx_id,
        'expense_transaction_id', v_expense_tx_id
    );
END;
$$;

-- ============================================================================
-- SECTION 4: FINANCIAL IMPROVEMENTS
-- BPMN Reference: Financial_Management_Process.bpmn
-- ============================================================================

-- 4.1 Admin Alerts table for Manual Intervention
CREATE TABLE IF NOT EXISTS admin_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(50) NOT NULL, -- 'COMPENSATION_FAILED', 'STOCK_INCONSISTENCY', etc.
    severity VARCHAR(20) DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    title TEXT NOT NULL,
    description TEXT,
    related_entity_type VARCHAR(50), -- 'transaction', 'sale', 'product', etc.
    related_entity_id UUID,
    context JSONB, -- Additional data for debugging
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_status ON admin_alerts(status);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_severity ON admin_alerts(severity);

COMMENT ON TABLE admin_alerts IS 'BPMN: Activity_ManualIntervention - Alerts requiring admin action';

-- 4.2 Function to create admin alert
CREATE OR REPLACE FUNCTION create_admin_alert(
    p_alert_type TEXT,
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT 'MEDIUM',
    p_related_entity_type TEXT DEFAULT NULL,
    p_related_entity_id UUID DEFAULT NULL,
    p_context JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_alert_id UUID;
BEGIN
    INSERT INTO admin_alerts (
        alert_type, title, description, severity,
        related_entity_type, related_entity_id, context
    ) VALUES (
        p_alert_type, p_title, p_description, p_severity,
        p_related_entity_type, p_related_entity_id, p_context
    ) RETURNING id INTO v_alert_id;
    
    RETURN v_alert_id;
END;
$$;

-- 4.3 Add REVERSED status to sales (BPMN specifies REVERSED, not CANCELLED)
-- First check current constraint and recreate if needed
DO $$
BEGIN
    -- Attempt to add REVERSED to enum-like check
    ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_status_check;
    ALTER TABLE sales ADD CONSTRAINT sales_payment_status_check 
        CHECK (payment_status IN ('PENDING', 'PAID', 'CANCELLED', 'REVERSED', 'PARTIAL_RETURN'));
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not update payment_status constraint: %', SQLERRM;
END;
$$;

-- 4.4 Add source column for hybrid sales (WhatsApp/Notion/POS)
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'POS' 
    CHECK (source IN ('POS', 'WHATSAPP', 'NOTION', 'API', 'OTHER'));

COMMENT ON COLUMN sales.source IS 'BPMN: Lane_Communication - Origin of sale (POS, WhatsApp, Notion)';

-- 4.5 Add delivery proof URL
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS delivery_proof_url TEXT;

COMMENT ON COLUMN sales.delivery_proof_url IS 'BPMN: Activity_UploadDeliveryProof - URL to shipping receipt image';

-- ============================================================================
-- SECTION 5: UPDATED SALE TRANSACTION WITH RESERVATION
-- BPMN Reference: Sales_Process.bpmn - Full flow with reservation pattern
-- ============================================================================

-- 5.1 New Sale RPC with Reservation Support
CREATE OR REPLACE FUNCTION process_sale_with_reservation(
    p_sale_number TEXT,
    p_customer_id_number TEXT,
    p_customer_name TEXT,
    p_subtotal DECIMAL,
    p_total DECIMAL,
    p_account_id UUID,
    p_payment_method TEXT,
    p_items JSONB, -- [{product_id, quantity, price, discount, cost_unit, reservation_id, is_dropship, provider_name, provider_cost}]
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
    v_reservation_id UUID;
    v_is_dropship BOOLEAN;
    v_provider_name TEXT;
    v_provider_cost DECIMAL;
    v_current_stock INTEGER;
    v_product_name TEXT;
    v_item_subtotal DECIMAL;
    v_movement_id UUID;
    v_group_id UUID := uuid_generate_v4();
    v_commit_result JSONB;
    v_ds_order_id UUID;
    v_ds_expense_id UUID;
BEGIN
    -- 1. BPMN: Validate and Commit reservations / Check stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_is_dropship := COALESCE((v_item->>'is_dropship')::BOOLEAN, FALSE);
        
        IF v_is_dropship THEN
            -- Skip local stock check for drop ship items
            CONTINUE;
        END IF;

        v_reservation_id := (v_item->>'reservation_id')::UUID;
        
        IF v_reservation_id IS NOT NULL THEN
            -- Commit the reservation
            v_commit_result := commit_reservation(v_reservation_id);
            
            IF NOT (v_commit_result->>'success')::BOOLEAN THEN
                RAISE EXCEPTION 'Failed to commit reservation: %', v_commit_result->>'error';
            END IF;
        ELSE
            -- Legacy/Direct mode: Stock check
            v_product_id := (v_item->>'product_id')::UUID;
            v_quantity := (v_item->>'quantity')::INTEGER;
            
            SELECT current_stock - reserved_stock, name INTO v_current_stock, v_product_name
            FROM products WHERE id = v_product_id FOR UPDATE;
            
            IF v_current_stock < v_quantity THEN
                RAISE EXCEPTION 'Stock insuficiente para %: disponible %, solicitado %', 
                    v_product_name, v_current_stock, v_quantity;
            END IF;
        END IF;
    END LOOP;

    -- 2. Customer Upsert
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
            INSERT INTO customers (identity_document, name, phone, email, city, address)
            VALUES (p_customer_id_number, COALESCE(p_customer_name, 'Cliente'), p_customer_phone, p_customer_email, p_customer_city, p_customer_address)
            RETURNING id INTO v_customer_id;
        END IF;
    END IF;

    -- 3. Create Sale Record
    INSERT INTO sales (
        sale_number, customer_id, customer_name, customer_phone, customer_email,
        subtotal, tax, discount, total, account_id, payment_status, notes, source
    ) VALUES (
        p_sale_number, v_customer_id, p_customer_name, p_customer_phone, p_customer_email,
        p_subtotal, p_tax, p_discount, p_total, p_account_id, 'PAID', p_notes, p_source
    ) RETURNING id INTO v_sale_id;

    -- 4. Process Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_price := (v_item->>'price')::DECIMAL;
        v_item_discount := COALESCE((v_item->>'discount')::DECIMAL, 0);
        v_item_subtotal := (v_quantity * v_price) - v_item_discount;
        v_is_dropship := COALESCE((v_item->>'is_dropship')::BOOLEAN, FALSE);
        
        IF v_is_dropship THEN
            v_provider_name := v_item->>'provider_name';
            v_provider_cost := COALESCE((v_item->>'provider_cost')::DECIMAL, 0);

            -- BPMN: Drop Shipping Enrollment
            INSERT INTO dropship_orders (
                sale_id, product_id, quantity, customer_price, provider_cost, 
                provider_name, transaction_group_id, status
            ) VALUES (
                v_sale_id, v_product_id, v_quantity, v_price, v_provider_cost,
                v_provider_name, v_group_id, 'CONFIRMED'
            ) RETURNING id INTO v_ds_order_id;

            -- BPMN: Activity_RecordFinancial (Provider Expense)
            -- We assume the provider is paid from the same account or main cash
            IF v_provider_cost > 0 THEN
                INSERT INTO transactions (
                    type, amount, description, account_id, payment_method, 
                    reference_number, notes, group_id, created_by, transaction_date
                ) VALUES (
                    'EXPENSE', v_provider_cost * v_quantity, 
                    'Provider DS: ' || COALESCE(v_provider_name, 'Proveedor') || ' (Sale ' || p_sale_number || ')',
                    p_account_id, 'OTHER', 'DS-' || v_ds_order_id, 
                    'Costo de mercancia Drop Ship', v_group_id, p_user_id, NOW()
                ) RETURNING id INTO v_ds_expense_id;
            END IF;

            -- Sale Item record (linked to DS order instead of movement)
            INSERT INTO sale_items (
                sale_id, product_id, quantity, unit_price, discount, subtotal
            ) VALUES (
                v_sale_id, v_product_id, v_quantity, v_price, v_item_discount, v_item_subtotal
            );

            -- Log demand as Drop Ship
            PERFORM log_demand_hit(v_product_id, 'DROPSHIP', v_quantity, p_source, v_sale_id);
        ELSE
            -- Normal Inventory Item
            v_cost_unit := COALESCE((v_item->>'cost_unit')::DECIMAL, 0);
            
            -- Create Inventory Movement (OUT)
            INSERT INTO inventory_movements (
                product_id, type, quantity_change, unit_price, total_value,
                reason, notes, created_by
            ) VALUES (
                v_product_id, 'OUT', -v_quantity, v_price, v_item_subtotal,
                'SALE', 'Venta ' || p_sale_number, p_user_id
            ) RETURNING id INTO v_movement_id;

            -- Create Sale Item
            INSERT INTO sale_items (
                sale_id, product_id, quantity, unit_price, discount, subtotal, inventory_movement_id
            ) VALUES (
                v_sale_id, v_product_id, v_quantity, v_price, v_item_discount, v_item_subtotal, v_movement_id
            );
            
            -- Log demand hit for restocking suggestions
            PERFORM log_demand_hit(v_product_id, 'SALE', v_quantity, p_source, v_sale_id);
        END IF;
    END LOOP;

    -- 5. Create Income Transaction (Total customer payment)
    INSERT INTO transactions (
        type, amount, description, account_id, payment_method, 
        reference_number, notes, group_id, created_by, created_by_name, transaction_date
    ) VALUES (
        'INCOME', p_total, 'Venta ' || p_sale_number || COALESCE(' - ' || p_customer_name, ''),
        p_account_id, p_payment_method, p_sale_number, p_notes, v_group_id, p_user_id, p_user_name, NOW()
    ) RETURNING id INTO v_transaction_id;

    -- 6. Create Shipping Expense
    IF p_shipping_cost > 0 AND p_shipping_account_id IS NOT NULL THEN
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method,
            reference_number, notes, group_id, created_by, created_by_name, transaction_date
        ) VALUES (
            'EXPENSE', p_shipping_cost, 'Envío venta ' || p_sale_number,
            p_shipping_account_id, p_payment_method, p_sale_number, p_notes, v_group_id, p_user_id, p_user_name, NOW()
        ) RETURNING id INTO v_shipping_tx_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'transaction_id', v_transaction_id,
        'customer_id', v_customer_id,
        'group_id', v_group_id
    );

EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$;

-- ============================================================================
-- SECTION 6: UPDATE REVERSAL TO USE REVERSED STATUS
-- BPMN Reference: Financial_Management_Process.bpmn - Activity_UpdateSaleHeader
-- ============================================================================

CREATE OR REPLACE FUNCTION restore_inventory_for_reversal(
    p_reference_number TEXT,
    p_user_id UUID,
    p_user_name TEXT,
    p_reversal_group_id UUID
) RETURNS VOID AS $$
DECLARE
    v_sale_record RECORD;
    v_sale_item RECORD;
    v_inventory_movement RECORD;
BEGIN
    SELECT * INTO v_sale_record FROM sales WHERE sale_number = p_reference_number;
    
    IF v_sale_record IS NOT NULL THEN
        -- BPMN: Activity_UpdateSaleHeader - Use REVERSED not CANCELLED
        UPDATE sales SET payment_status = 'REVERSED', updated_at = NOW() WHERE id = v_sale_record.id;
        
        -- Restore Items
        FOR v_sale_item IN SELECT * FROM sale_items WHERE sale_id = v_sale_record.id LOOP
            IF v_sale_item.inventory_movement_id IS NOT NULL THEN
                SELECT * INTO v_inventory_movement FROM inventory_movements WHERE id = v_sale_item.inventory_movement_id;
                
                IF v_inventory_movement IS NOT NULL THEN
                    INSERT INTO inventory_movements (
                        product_id, type, quantity_change, unit_price, total_value,
                        reason, notes, created_at, created_by, created_by_name
                    ) VALUES (
                        v_inventory_movement.product_id,
                        'IN',
                        ABS(v_inventory_movement.quantity_change),
                        v_inventory_movement.unit_price,
                        ABS(v_inventory_movement.total_value),
                        'RETURN', 
                        'Restauracion por reversión ' || p_reference_number,
                        NOW(), p_user_id, p_user_name
                    );
                END IF;
            END IF;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 7: PARTIAL RETURN SUPPORT
-- BPMN Reference: Sales_Process.bpmn - Return Flow
-- ============================================================================

CREATE OR REPLACE FUNCTION process_partial_return(
    p_sale_id UUID,
    p_items JSONB, -- [{sale_item_id, quantity_to_return}]
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Devolución solicitada'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_sale RECORD;
    v_item JSONB;
    v_sale_item RECORD;
    v_refund_amount DECIMAL := 0;
    v_group_id UUID := uuid_generate_v4();
    v_user_name TEXT;
    v_qty_to_return INTEGER;
BEGIN
    -- Get sale
    SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
    IF v_sale IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sale not found');
    END IF;
    
    -- Get user name
    SELECT COALESCE(full_name, email, 'System') INTO v_user_name 
    FROM auth.users LEFT JOIN admins ON auth.users.id = admins.auth_id 
    WHERE auth.users.id = p_user_id;

    -- Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_sale_item 
        FROM sale_items 
        WHERE id = (v_item->>'sale_item_id')::UUID;
        
        IF v_sale_item IS NULL THEN
            CONTINUE;
        END IF;
        
        v_qty_to_return := (v_item->>'quantity_to_return')::INTEGER;
        
        IF v_qty_to_return > v_sale_item.quantity THEN
            v_qty_to_return := v_sale_item.quantity;
        END IF;
        
        -- Calculate refund for this item
        v_refund_amount := v_refund_amount + (v_qty_to_return * v_sale_item.unit_price);
        
        -- Create IN movement to restore stock
        INSERT INTO inventory_movements (
            product_id, type, quantity_change, unit_price, total_value,
            reason, notes, created_by, created_by_name
        ) VALUES (
            v_sale_item.product_id, 'IN', v_qty_to_return, v_sale_item.unit_price,
            v_qty_to_return * v_sale_item.unit_price,
            'RETURN', 'Devolución parcial venta ' || v_sale.sale_number,
            p_user_id, v_user_name
        );
    END LOOP;
    
    -- Create REFUND transaction
    IF v_refund_amount > 0 THEN
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method,
            reference_number, notes, group_id, created_by, created_by_name, transaction_date
        ) VALUES (
            'REFUND', -v_refund_amount, 'Devolución parcial ' || v_sale.sale_number,
            v_sale.account_id, 'OTHER',
            'RET-' || v_sale.sale_number, p_reason, v_group_id, p_user_id, v_user_name, NOW()
        );
    END IF;
    
    -- Update sale status
    UPDATE sales SET payment_status = 'PARTIAL_RETURN', updated_at = NOW() WHERE id = p_sale_id;

    RETURN jsonb_build_object(
        'success', true,
        'refund_amount', v_refund_amount,
        'group_id', v_group_id
    );
END;
$$;

-- ============================================================================
-- SECTION 8: GRANTS & COMMENTS
-- ============================================================================

-- Grant execute on new functions
GRANT EXECUTE ON FUNCTION log_demand_hit TO authenticated;
GRANT EXECUTE ON FUNCTION query_demand_study TO authenticated;
GRANT EXECUTE ON FUNCTION reserve_stock TO authenticated;
GRANT EXECUTE ON FUNCTION commit_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION release_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION check_provider_availability TO authenticated;
GRANT EXECUTE ON FUNCTION create_dropship_order TO authenticated;
GRANT EXECUTE ON FUNCTION create_admin_alert TO authenticated;
GRANT EXECUTE ON FUNCTION process_sale_with_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION process_partial_return TO authenticated;

-- RLS policies for new tables
ALTER TABLE demand_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dropship_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read demand_hits" ON demand_hits;
CREATE POLICY "Allow authenticated read demand_hits" ON demand_hits FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow authenticated insert demand_hits" ON demand_hits;
CREATE POLICY "Allow authenticated insert demand_hits" ON demand_hits FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read stock_reservations" ON stock_reservations;
CREATE POLICY "Allow authenticated read stock_reservations" ON stock_reservations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow authenticated insert stock_reservations" ON stock_reservations;
CREATE POLICY "Allow authenticated insert stock_reservations" ON stock_reservations FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated update stock_reservations" ON stock_reservations;
CREATE POLICY "Allow authenticated update stock_reservations" ON stock_reservations FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated read dropship_orders" ON dropship_orders;
CREATE POLICY "Allow authenticated read dropship_orders" ON dropship_orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow authenticated insert dropship_orders" ON dropship_orders;
CREATE POLICY "Allow authenticated insert dropship_orders" ON dropship_orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated update dropship_orders" ON dropship_orders;
CREATE POLICY "Allow authenticated update dropship_orders" ON dropship_orders FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated read admin_alerts" ON admin_alerts;
CREATE POLICY "Allow authenticated read admin_alerts" ON admin_alerts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow authenticated insert admin_alerts" ON admin_alerts;
CREATE POLICY "Allow authenticated insert admin_alerts" ON admin_alerts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated update admin_alerts" ON admin_alerts;
CREATE POLICY "Allow authenticated update admin_alerts" ON admin_alerts FOR UPDATE TO authenticated USING (true);

-- Final comment
COMMENT ON SCHEMA public IS 'BPMN Full Alignment Migration Applied: 2026-02-05';
