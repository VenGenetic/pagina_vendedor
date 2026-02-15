-- Migration: Fix Broken Sale-Finance Link
-- Date: 2026-02-15
-- Description: Updates process_sale_with_reservation to properly link Sales and Inventory Movements to the Financial Transaction.
--              1. Creates Transaction BEFORE processing items.
--              2. Updates Sale header with transaction_id.
--              3. Inserts Inventory Movements WITH transaction_id.

BEGIN;

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

    -- 4. Create Income Transaction (Total customer payment) - MOVED UP from Step 5
    -- We create this EARLY so we have the transaction_id for the links
    INSERT INTO transactions (
        type, amount, description, account_id, payment_method, 
        reference_number, notes, group_id, created_by, created_by_name, transaction_date
    ) VALUES (
        'INCOME', p_total, 'Venta ' || p_sale_number || COALESCE(' - ' || p_customer_name, ''),
        p_account_id, p_payment_method, p_sale_number, p_notes, v_group_id, p_user_id, p_user_name, NOW()
    ) RETURNING id INTO v_transaction_id;

    -- 4.1 Update Sale with Transaction ID (The Strong Link)
    UPDATE sales 
    SET transaction_id = v_transaction_id 
    WHERE id = v_sale_id;

    -- 5. Process Items
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

            -- Sale Item record
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
            
            -- Create Inventory Movement (OUT) - NOW WITH TRANSACTION_ID
            INSERT INTO inventory_movements (
                product_id, type, quantity_change, unit_price, total_value,
                reason, notes, created_by, transaction_id
            ) VALUES (
                v_product_id, 'OUT', -v_quantity, v_price, v_item_subtotal,
                'SALE', 'Venta ' || p_sale_number, p_user_id, v_transaction_id
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

    -- 6. Create Shipping Expense (Post-processing)
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

COMMIT;
