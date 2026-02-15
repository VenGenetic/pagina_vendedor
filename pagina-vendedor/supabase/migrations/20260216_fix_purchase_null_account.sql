-- Migration: Fix process_purchase_transaction to handle null account_id
-- Purpose: Allow free purchases (Ingreso Gratuito) without creating financial transactions
--          and provide better validation for paid purchases
-- Date: 2026-02-16

BEGIN;

CREATE OR REPLACE FUNCTION public.process_purchase_transaction(
    p_items JSONB,          -- [{product_id, quantity, cost_unit}]
    p_account_id UUID,
    p_user_id UUID,
    p_provider_info TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_item RECORD;
    v_current_stock INTEGER;
    v_old_cost DECIMAL;
    v_new_wac DECIMAL;
    v_group_id UUID := uuid_generate_v4();
    v_total_amount DECIMAL := 0;
    v_product_name TEXT;
    v_effective_old_stock INTEGER;
    v_is_free_entry BOOLEAN;
BEGIN
    -- Determine if this is a free entry (Ingreso Gratuito)
    -- If account_id is NULL, we assume it's a free entry
    v_is_free_entry := (p_account_id IS NULL);
    
    -- ACID Atomicity: One fail rolls back everything
    
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER, cost_unit DECIMAL)
    LOOP
        -- Locking for financial integrity
        SELECT current_stock, cost_price, name 
        INTO v_current_stock, v_old_cost, v_product_name
        FROM public.products 
        WHERE id = v_item.product_id 
        FOR UPDATE;

        IF v_current_stock IS NULL THEN
            RAISE EXCEPTION 'Producto no encontrado: %', v_item.product_id;
        END IF;

        -- Logic Step 1: "Ley del Perdón"
        -- If stock is negative, we reset it to 0 before processing the purchase
        -- Now using non-destructive adjustment
        IF v_current_stock < 0 THEN
            PERFORM public.process_stock_adjustment(
                v_item.product_id,
                0,
                p_user_id,
                'SHRINKAGE',
                'Reset de stock negativo (Ley del Perdón) antes de compra'
            );
            
            v_effective_old_stock := 0;
        ELSE
            v_effective_old_stock := v_current_stock;
        END IF;


        -- Logic Step 3: WAC Calculation
        -- Using effective stock (post-Ley del Perdón)
        -- Formula: ((Qty1 * Cost1) + (Qty2 * Cost2)) / (Qty1 + Qty2)
        IF (v_effective_old_stock + v_item.quantity) > 0 THEN
            v_new_wac := ((v_effective_old_stock * v_old_cost) + (v_item.quantity * v_item.cost_unit)) / (v_effective_old_stock + v_item.quantity);
        ELSE
            v_new_wac := v_item.cost_unit;
        END IF;

        -- Logic Step 4: Pricing (Update Cost and Selling Price)
        UPDATE public.products 
        SET cost_price = v_new_wac,
            selling_price = v_new_wac * 1.65,
            updated_at = NOW()
        WHERE id = v_item.product_id;

        -- Logic Step 2: Inventory Movement
        INSERT INTO public.inventory_movements (
            product_id,
            type,
            quantity_change,
            unit_price,
            total_value,
            reason,
            notes,
            created_by
        ) VALUES (
            v_item.product_id,
            'IN',
            v_item.quantity,
            v_item.cost_unit,
            v_item.quantity * v_item.cost_unit,
            'PURCHASE',
            CASE 
                WHEN v_is_free_entry THEN 'Ingreso Gratuito: ' || COALESCE(p_provider_info, 'Donación')
                ELSE 'Compra: ' || COALESCE(p_provider_info, 'Proveedor')
            END,
            p_user_id
        );

        v_total_amount := v_total_amount + (v_item.quantity * v_item.cost_unit);
    END LOOP;

    -- Logic Step 5: Finance (Register the Expense)
    -- ONLY create a financial transaction if this is NOT a free entry
    IF NOT v_is_free_entry THEN
        INSERT INTO public.transactions (
            type,
            amount,
            description,
            account_id,
            account_out_id,
            group_id,
            created_by,
            transaction_date,
            notes
        ) VALUES (
            'EXPENSE',
            v_total_amount,
            'Compra de inventario: ' || COALESCE(p_provider_info, 'Proveedor'),
            p_account_id,
            p_account_id,
            v_group_id,
            p_user_id,
            NOW(),
            p_notes
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'group_id', v_group_id,
        'total_spent', v_total_amount,
        'is_free_entry', v_is_free_entry,
        'message', CASE 
            WHEN v_is_free_entry THEN 'Ingreso gratuito procesado exitosamente (sin transacción financiera)'
            ELSE 'Compra procesada exitosamente (Ley del Perdón + WAC)'
        END
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

COMMENT ON FUNCTION public.process_purchase_transaction IS 
'Processes a purchase/restock transaction with WAC calculation and Ley del Perdón. 
If p_account_id is NULL, treats it as a free entry (Ingreso Gratuito) and skips financial transaction creation.';

COMMIT;
