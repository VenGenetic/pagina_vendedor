-- Migration: Update process_restock_v3 to support Negotiated Cost and System Earnings
-- Date: 2026-02-08
-- Description: Updates the RPC to accept `negotiated_cost` in the items JSON.
-- Logic:
-- 1. Inventory is always valued at `unit_cost` (List Price).
-- 2. Bank Debit is `negotiated_cost` if provided, else `unit_cost * (1 - discount)`.
-- 3. System Earning is `unit_cost - negotiated_cost` if provided, else `unit_cost * discount`.

CREATE OR REPLACE FUNCTION public.process_restock_v3(
    p_provider_name text,
    p_payment_method text,
    p_items jsonb,  -- Array of {product_id, quantity, unit_cost, discount_rate, negotiated_cost}
    p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
    v_transaction_group_id uuid;
    v_total_amount numeric := 0;
    v_item jsonb;
    v_product_id uuid;
    v_quantity numeric;
    v_unit_cost numeric;
    v_discount_rate numeric;
    v_negotiated_cost numeric;
    v_final_cost_for_payment numeric;
    v_system_earning numeric;
    v_current_stock numeric;
    v_new_stock numeric;
    v_old_cost numeric;
    v_new_wac numeric;
    v_user_id uuid;
BEGIN
    -- 1. Get current User ID
    v_user_id := auth.uid();
    
    -- 2. Create Transaction Group
    INSERT INTO transaction_groups (
        type,
        notes,
        created_by
    ) VALUES (
        'PURCHASE',
        p_notes,
        v_user_id
    ) RETURNING id INTO v_transaction_group_id;

    -- 3. Iterate through items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::uuid;
        v_quantity := (v_item->>'quantity')::numeric;
        v_unit_cost := (v_item->>'unit_cost')::numeric; -- LIST PRICE (Inventory Value)
        v_discount_rate := COALESCE((v_item->>'discount_rate')::numeric, 0);
        v_negotiated_cost := (v_item->>'negotiated_cost')::numeric; -- Optional: REAL PRICE

        -- LOGIC: Determine Payment vs Earning
        IF v_negotiated_cost IS NOT NULL AND v_negotiated_cost >= 0 THEN
            -- Override: Use Negotiated Cost for payment
            v_final_cost_for_payment := v_negotiated_cost;
            v_system_earning := v_unit_cost - v_negotiated_cost;
        ELSE
            -- Standard: Use Discount Rate
            v_final_cost_for_payment := v_unit_cost * (1 - v_discount_rate);
            v_system_earning := v_unit_cost * v_discount_rate;
        END IF;

        -- 4. Create Inventory Movement (Valued at LIST PRICE / UNIT COST)
        -- We always track inventory value at the List Price to calculate margins correctly later.
        INSERT INTO inventory_movements (
            product_id,
            movement_type,
            quantity,
            unit_cost, -- Value at List Price
            transaction_group_id,
            created_by
        ) VALUES (
            v_product_id,
            'IN',
            v_quantity,
            v_unit_cost, 
            v_transaction_group_id,
            v_user_id
        );

        -- 5. Calculate WAC (Weighted Average Cost) - Using LIST PRICE
        SELECT current_stock, cost_price INTO v_current_stock, v_old_cost
        FROM products WHERE id = v_product_id;

        IF v_current_stock < 0 THEN
            -- Forgiveness Law: Reset negative stock, WAC becomes new List Price
            v_new_wac := v_unit_cost;
            v_new_stock := v_quantity;
             -- Reset negative stock log could be added here if needed
        ELSE
            v_new_stock := v_current_stock + v_quantity;
            IF v_new_stock > 0 THEN
                v_new_wac := ((v_current_stock * v_old_cost) + (v_quantity * v_unit_cost)) / v_new_stock;
            ELSE
                v_new_wac := v_old_cost;
            END IF;
        END IF;

        -- Update Product Cost (WAC) and Stock
        -- NOTE: Selling Price trigger will auto-update price based on this new cost
        UPDATE products 
        SET 
            cost_price = v_new_wac,
            current_stock = current_stock + v_quantity
        WHERE id = v_product_id;

        -- 6. Record Financial Transaction (Bank Debit) - The Real Cash Out
        INSERT INTO transactions (
            transaction_group_id,
            account_id, -- Should be dynamic, but fixed for now or passed in? Assuming Bank/Cash
            amount,
            transaction_type,
            description,
            created_by
        ) VALUES (
            v_transaction_group_id,
            (SELECT id FROM accounts WHERE name = 'Banco' LIMIT 1), -- TODO: Make dynamic based on p_payment_method
            - (v_final_cost_for_payment * v_quantity), -- Negative for Debit (Spending)
            'EXPENSE',
            'Restock Payment: ' || p_provider_name,
            v_user_id
        );

        -- 7. Record System Earning (Credit) - The Gap/Savings
        IF v_system_earning > 0 THEN
            INSERT INTO transactions (
                transaction_group_id,
                account_id,
                amount,
                transaction_type,
                description,
                created_by
            ) VALUES (
                v_transaction_group_id,
                (SELECT id FROM accounts WHERE type = 'REVENUE' AND name = 'System Earnings' LIMIT 1), -- Ensure this account exists!
                (v_system_earning * v_quantity), -- Positive for Credit (Earning)
                'INCOME',
                'Buying Profit / Discount Gap',
                v_user_id
            );
        END IF;

    END LOOP;

    RETURN v_transaction_group_id;
END;
$function$;
