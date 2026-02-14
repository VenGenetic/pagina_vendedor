-- Migration: Refined Atomic Financial RPCs v3
-- Date: 2026-02-10
-- Description: Updates transfer_funds for dual-entry audit and adds process_purchase_transaction with Ley del Perdón and WAC.

-- 1. Update transfer_funds to use dual-entry logic for financial integrity
CREATE OR REPLACE FUNCTION public.transfer_funds(
  p_source_account_id UUID,
  p_destination_account_id UUID,
  p_amount DECIMAL,
  p_description TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_group_id UUID := uuid_generate_v4();
  v_tx_out_id UUID;
  v_tx_in_id UUID;
BEGIN
  -- Validation
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo';
  END IF;
  
  IF p_source_account_id = p_destination_account_id THEN
    RAISE EXCEPTION 'Las cuentas de origen y destino deben ser diferentes';
  END IF;

  -- Entry 1: Debit from Source (EXPENSE)
  INSERT INTO public.transactions (
    type,
    amount,
    description,
    account_id,
    account_out_id,
    account_in_id,
    group_id,
    created_by,
    transaction_date
  ) VALUES (
    'EXPENSE',
    p_amount,
    'Transferencia (Salida): ' || p_description,
    p_source_account_id,
    p_source_account_id,
    p_destination_account_id,
    v_group_id,
    p_user_id,
    NOW()
  ) RETURNING id INTO v_tx_out_id;

  -- Entry 2: Credit to Destination (INCOME)
  INSERT INTO public.transactions (
    type,
    amount,
    description,
    account_id,
    account_out_id,
    account_in_id,
    group_id,
    created_by,
    transaction_date
  ) VALUES (
    'INCOME',
    p_amount,
    'Transferencia (Entrada): ' || p_description,
    p_destination_account_id,
    p_source_account_id,
    p_destination_account_id,
    v_group_id,
    p_user_id,
    NOW()
  ) RETURNING id INTO v_tx_in_id;

  RETURN json_build_object(
    'success', true,
    'group_id', v_group_id,
    'transaction_out_id', v_tx_out_id,
    'transaction_in_id', v_tx_in_id,
    'message', 'Transferencia dual completada exitosamente'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE; 
END;
$$ LANGUAGE plpgsql;

-- 2. Refined process_purchase_transaction RPC
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
BEGIN
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
            'Compra: ' || COALESCE(p_provider_info, 'Proveedor'),
            p_user_id
        );

        v_total_amount := v_total_amount + (v_item.quantity * v_item.cost_unit);
    END LOOP;

    -- Logic Step 5: Finance (Register the Expense)
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

    RETURN jsonb_build_object(
        'success', true,
        'group_id', v_group_id,
        'total_spent', v_total_amount,
        'message', 'Compra procesada exitosamente (Ley del Perdón + WAC)'
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

-- 3. Refined rpc_reverse_transaction (Ledger-Aware)
-- Replaces previous versions to ensure account_in_id/out_id are mirrored correctly.
CREATE OR REPLACE FUNCTION public.rpc_reverse_transaction(
  p_transaction_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Reversión solicitada por usuario'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_original_tx RECORD;
  v_group_id UUID;
  v_reversal_group_id UUID;
  v_r RECORD;
  v_new_amount DECIMAL;
  v_user_name TEXT;
  v_count INTEGER;
BEGIN
  -- 1. Get User Name for Audit
  SELECT COALESCE(full_name, auth.users.email, 'System') INTO v_user_name 
  FROM auth.users LEFT JOIN public.admins ON auth.users.id = admins.auth_id 
  WHERE auth.users.id = p_user_id;

  -- 2. Validate Target Transaction
  SELECT * INTO v_original_tx FROM public.transactions WHERE id = p_transaction_id;
  IF v_original_tx IS NULL THEN
    RAISE EXCEPTION 'Transaction NOT FOUND: %', p_transaction_id;
  END IF;

  v_group_id := v_original_tx.group_id;

  -- 3. Validate Group Existence (Essential for atomic reversal)
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Legacy Transaction Violation: Group ID missing.';
  END IF;

  -- 4. Validate Not Already Reversed
  SELECT COUNT(*) INTO v_count FROM public.transactions 
  WHERE group_id = v_group_id AND is_reversed = TRUE;

  IF v_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Transaction Group is already reversed.');
  END IF;

  -- 5. Create Reversal Group Link
  v_reversal_group_id := uuid_generate_v4();

  -- 6. Mirror Loop
  FOR v_r IN SELECT * FROM public.transactions WHERE group_id = v_group_id LOOP
      v_new_amount := -1 * v_r.amount;

      INSERT INTO public.transactions (
          type, 
          amount, 
          description, 
          account_id, 
          account_in_id,    -- Mirroring ledger columns
          account_out_id,   -- Mirroring ledger columns
          payment_method, 
          reference_number, 
          notes, 
          created_at, 
          created_by, 
          created_by_name,
          group_id, 
          related_transaction_id,
          is_manual_adjustment,
          transaction_date
      ) VALUES (
          CASE WHEN v_r.type = 'INCOME' THEN 'EXPENSE' ELSE 'INCOME' END, -- Invert type for balance restoration
          ABS(v_new_amount),
          'Reversión: ' || v_r.description,
          v_r.account_id,
          v_r.account_out_id, -- Swap In/Out for restoration
          v_r.account_in_id,  -- Swap Out/In for restoration
          v_r.payment_method,
          'REV-' || COALESCE(v_r.reference_number, ''),
          p_reason,
          NOW(),
          p_user_id,
          v_user_name,
          v_reversal_group_id,
          v_r.id,
          TRUE,
          NOW()
      );
  END LOOP;

  -- 7. Mark Original Group as Reversed
  UPDATE public.transactions 
  SET is_reversed = TRUE 
  WHERE group_id = v_group_id;

  -- 8. Async Inventory Restoration (Triggered if linked to a sale)
  IF v_original_tx.reference_number IS NOT NULL THEN
      PERFORM public.restore_inventory_for_reversal(v_original_tx.reference_number, p_user_id, v_user_name, v_reversal_group_id);
  END IF;

  RETURN jsonb_build_object(
      'success', true, 
      'reversal_group_id', v_reversal_group_id,
      'message', 'Transaction Group reversed successfully.'
  );
END;
$$;
