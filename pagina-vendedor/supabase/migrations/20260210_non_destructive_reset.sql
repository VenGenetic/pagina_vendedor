-- Migration: Non-Destructive Stock Reset Logic
-- Date: 2026-02-10
-- Description: Adds 'SHRINKAGE' reason, 'Gasto por Merma' account, and atomic adjustment RPCs.

BEGIN;

-- 1. Update Inventory Movement Reason Constraint
DO $$ 
BEGIN
  ALTER TABLE public.inventory_movements 
  DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;
  
  ALTER TABLE public.inventory_movements 
  ADD CONSTRAINT inventory_movements_reason_check 
    CHECK (reason IN ('SALE', 'PURCHASE', 'RETURN', 'DAMAGE', 'THEFT', 'COUNT_ADJUSTMENT', 'SHRINKAGE', 'OTHER'));
EXCEPTION WHEN others THEN 
  RAISE NOTICE 'Error updating constraint: %', SQLERRM;
END $$;

-- 2. Ensure 'Gasto por Merma' Account Exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE name = 'Gasto por Merma') THEN
        INSERT INTO public.accounts (name, type, balance, is_nominal, currency, is_active)
        VALUES ('Gasto por Merma', 'CASH', 0.00, true, 'USD', true);
    END IF;
END $$;

-- 3. Create process_stock_adjustment RPC
CREATE OR REPLACE FUNCTION public.process_stock_adjustment(
    p_product_id UUID,
    p_target_quantity INTEGER,
    p_user_id UUID,
    p_reason TEXT DEFAULT 'SHRINKAGE',
    p_notes TEXT DEFAULT 'Ajuste de stock automático'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_stock INTEGER;
    v_cost_price DECIMAL;
    v_delta INTEGER;
    v_adjustment_value DECIMAL;
    v_account_id UUID;
    v_movement_id UUID;
    v_group_id UUID := uuid_generate_v4();
BEGIN
    -- 1. Lock Product Row
    SELECT current_stock, cost_price 
    INTO v_current_stock, v_cost_price
    FROM public.products
    WHERE id = p_product_id
    FOR UPDATE;

    IF v_current_stock IS NULL THEN
        RAISE EXCEPTION 'Producto no encontrado: %', p_product_id;
    END IF;

    -- 2. Calculate Delta
    v_delta := p_target_quantity - v_current_stock;

    -- Only proceed if there is an actual change
    IF v_delta = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'No adjustment needed');
    END IF;

    -- 3. Get Expense Account for Shrinkage
    SELECT id INTO v_account_id FROM public.accounts WHERE name = 'Gasto por Merma' LIMIT 1;
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'Cuenta "Gasto por Merma" no encontrada.';
    END IF;

    -- 4. Create Inventory Movement
    -- If v_delta is negative (reduction), type is 'OUT'
    -- If v_delta is positive (increase), type is 'IN'
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
        p_product_id,
        CASE WHEN v_delta < 0 THEN 'OUT' ELSE 'IN' END,
        v_delta,
        v_cost_price,
        ABS(v_delta * v_cost_price),
        p_reason,
        p_notes,
        p_user_id
    ) RETURNING id INTO v_movement_id;

    -- 5. Create Financial Transaction (EXPENSE for losses, INCOME for gains - though shrinkage is usually loss)
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
        CASE WHEN v_delta < 0 THEN 'EXPENSE' ELSE 'INCOME' END,
        ABS(v_delta * v_cost_price),
        'Ajuste de inventario (' || p_reason || '): ' || p_notes,
        v_account_id,
        v_account_id,
        v_group_id,
        p_user_id,
        NOW(),
        'Movement ID: ' || v_movement_id
    );

    -- products.current_stock is updated by trigger_update_product_stock

    RETURN jsonb_build_object(
        'success', true,
        'delta', v_delta,
        'new_stock', p_target_quantity,
        'group_id', v_group_id
    );
END;
$$;

-- 4. Create reset_negative_stock_v2 RPC
CREATE OR REPLACE FUNCTION public.reset_negative_stock_v2(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_prod RECORD;
    v_count INTEGER := 0;
    v_results JSONB := '[]'::jsonb;
    v_res JSONB;
BEGIN
    FOR v_prod IN 
        SELECT id FROM public.products WHERE current_stock < 0
    LOOP
        v_res := public.process_stock_adjustment(
            v_prod.id,
            0,
            p_user_id,
            'SHRINKAGE',
            'Reset de stock negativo (Ley del Perdón v2)'
        );
        v_results := v_results || v_res;
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'processed_count', v_count,
        'details', v_results
    );
END;
$$;

COMMIT;
