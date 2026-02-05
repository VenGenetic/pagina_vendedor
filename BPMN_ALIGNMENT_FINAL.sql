-- ============================================
-- FINAL BPMN ALIGNMENT MIGRATION
-- ============================================
-- Includes ALL changes for Financial Management, Sales, and Restock processes.
-- Target: Supabase SQL Editor
-- ============================================

BEGIN;

-- 1. SCHEMA UPDATES: Sales Status & Product Flags
-- --------------------------------------------

-- Add 'REVERSED' to sales payment_status
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_status_check 
  CHECK (payment_status IN ('PAID', 'PENDING', 'PARTIAL', 'CANCELLED', 'REVERSED'));

-- Add price review flag to products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS needs_price_review BOOLEAN DEFAULT false;

COMMENT ON COLUMN products.needs_price_review IS 'Flag set when a price proposal is rejected, indicating the product batch needs manual price adjustment.';


-- 2. REVERSAL LOGIC: Aligned with BPMN
-- --------------------------------------------
-- Flow: Financial_Management_Process.bpmn -> Reversal Flow

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
        -- Activity_UpdateSaleHeader (BPMN)
        UPDATE sales SET payment_status = 'REVERSED', updated_at = NOW() WHERE id = v_sale_record.id;
        
        -- Activity_RestoreInventory (BPMN)
        FOR v_sale_item IN SELECT * FROM sale_items WHERE sale_id = v_sale_record.id LOOP
            IF v_sale_item.inventory_movement_id IS NOT NULL THEN
                SELECT * INTO v_inventory_movement FROM inventory_movements WHERE id = v_sale_item.inventory_movement_id;
                
                IF v_inventory_movement IS NOT NULL THEN
                    INSERT INTO inventory_movements (
                        product_id, type, quantity_change, unit_price, total_value,
                        transaction_id, reason, notes, created_at, created_by, created_by_name
                    ) VALUES (
                        v_inventory_movement.product_id,
                        'IN',
                        ABS(v_inventory_movement.quantity_change),
                        v_inventory_movement.unit_price,
                        ABS(v_inventory_movement.total_value),
                        p_reversal_transaction_id,
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

CREATE OR REPLACE FUNCTION rpc_reverse_transaction(
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
  v_rev_tx_id UUID;
  v_primary_rev_tx_id UUID;
BEGIN
  -- Activity_ReverseTransactionRPC (Validation)
  SELECT COALESCE(full_name, auth.users.email, 'System') INTO v_user_name 
  FROM auth.users LEFT JOIN admins ON auth.users.id = admins.auth_id 
  WHERE auth.users.id = p_user_id;

  SELECT * INTO v_original_tx FROM transactions WHERE id = p_transaction_id;
  IF v_original_tx IS NULL THEN RAISE EXCEPTION 'Transaction NOT FOUND'; END IF;

  v_group_id := v_original_tx.group_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'Group ID Missing'; END IF;

  SELECT COUNT(*) INTO v_count FROM transactions 
  WHERE group_id = v_group_id AND is_reversed = TRUE;
  IF v_count > 0 THEN RETURN jsonb_build_object('success', false, 'message', 'Already reversed'); END IF;

  -- Activity_MirrorGroup (Cloning)
  v_reversal_group_id := uuid_generate_v4();
  FOR v_r IN SELECT * FROM transactions WHERE group_id = v_group_id LOOP
      v_new_amount := -1 * v_r.amount;
      INSERT INTO transactions (
          type, amount, description, account_id, payment_method, reference_number, 
          notes, created_at, created_by, created_by_name, group_id, 
          related_transaction_id, is_manual_adjustment
      ) VALUES (
          'REFUND', v_new_amount, 'Reversión: ' || v_r.description, v_r.account_id,
          v_r.payment_method, 'REV-' || COALESCE(v_r.reference_number, ''),
          p_reason, NOW(), p_user_id, v_user_name, v_reversal_group_id, 
          v_r.id, TRUE
      ) RETURNING id INTO v_rev_tx_id;
      v_primary_rev_tx_id := v_rev_tx_id;
  END LOOP;

  UPDATE transactions SET is_reversed = TRUE WHERE group_id = v_group_id;

  IF v_original_tx.reference_number IS NOT NULL THEN
      PERFORM restore_inventory_for_reversal_v2(v_original_tx.reference_number, p_user_id, v_user_name, v_primary_rev_tx_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'reversal_group_id', v_reversal_group_id);
END;
$$;


-- 3. TRANSFER LOGIC: Aligned with BPMN
-- --------------------------------------------
-- Flow: Financial_Management_Process.bpmn -> Transfer Flow (Full Saga Pattern)

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
  v_group_id UUID;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'El monto debe ser positivo'; END IF;
  IF p_source_account_id = p_destination_account_id THEN RAISE EXCEPTION 'Las cuentas deben ser diferentes'; END IF;

  v_group_id := uuid_generate_v4();

  -- Activity_TransferSourceDebit (Source Debit is Negative)
  INSERT INTO transactions (
    type, amount, description, account_id, account_out_id, account_in_id,
    group_id, created_by, is_manual_adjustment
  ) VALUES (
    'TRANSFER', -1 * p_amount, p_description, p_source_account_id,
    p_source_account_id, p_destination_account_id, v_group_id, p_user_id, false
  ) RETURNING id INTO v_transaction_id;

  RETURN json_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'group_id', v_group_id,
    'message', 'Transferencia completada exitosamente'
  );
END;
$$ LANGUAGE plpgsql;


-- 4. RESTOCK LOGIC: Aligned with BPMN
-- --------------------------------------------
-- Flow: Restock_Process.bpmn -> SubProcess_RecordFinancial & SubProcess_WAC_Calculation

CREATE OR REPLACE FUNCTION process_restock_v3(
    p_account_id UUID,
    p_provider_name TEXT,
    p_payment_method TEXT,
    p_total_amount DECIMAL,
    p_reference_number TEXT,
    p_notes TEXT,
    p_user_id UUID,
    p_items JSONB -- Array of {product_id, quantity, cost_unit}
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    v_sum_movements INTEGER;
    v_baseline_stock INTEGER;
    v_baseline_cost DECIMAL;
    v_final_wac DECIMAL;
    v_selling_price DECIMAL;
    v_profit_margin DECIMAL := 65; -- Default fallback
    v_tax_rate DECIMAL := 15; -- Default fallback
    v_target_margin NUMERIC;
    v_sys_config JSONB;
BEGIN
    -- Activity_RecordFinancial (BPMN)
    IF p_total_amount > 0 THEN
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method, 
            reference_number, notes, transaction_date, group_id, created_by
        ) VALUES (
            'EXPENSE', p_total_amount,
            CONCAT('Compra de inventario', CASE WHEN p_provider_name IS NOT NULL AND p_provider_name <> '' THEN ' - ' || p_provider_name ELSE '' END),
            p_account_id, p_payment_method, p_reference_number, p_notes, NOW(), v_group_id, p_user_id
        ) RETURNING id INTO v_transaction_id;
    END IF;

    -- Fetch global pricing settings
    BEGIN
        SELECT value INTO v_sys_config FROM system_settings WHERE key = 'financial_config';
        v_tax_rate := COALESCE((v_sys_config->>'tax_rate')::DECIMAL * 100, 15);
        v_profit_margin := COALESCE((v_sys_config->>'default_margin')::DECIMAL * 100, 65);
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Process Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'cost_unit')::DECIMAL;

        -- Create Inventory Movement (IN)
        INSERT INTO inventory_movements (
            product_id, type, quantity_change, unit_price, total_value, 
            transaction_id, reason, created_by, movement_date
        ) VALUES (v_product_id, 'IN', v_quantity, v_unit_cost, v_quantity * v_unit_cost, v_transaction_id, 'PURCHASE', p_user_id, NOW())
        RETURNING id INTO v_movement_id;

        -- Verify Stock Consistency (BPMN)
        SELECT SUM(quantity_change) INTO v_sum_movements FROM inventory_movements WHERE product_id = v_product_id;
        SELECT current_stock, cost_price, target_margin 
        INTO v_current_stock, v_product_cost, v_target_margin
        FROM products WHERE id = v_product_id;

        -- Negative Stock Check & Reset (The Forgiveness Law)
        IF v_current_stock < 0 THEN
            v_baseline_stock := 0;
            v_baseline_cost := v_unit_cost;
        ELSE
            v_baseline_stock := v_current_stock - v_quantity;
            v_baseline_cost := v_product_cost;
            IF v_baseline_stock < 0 THEN
                v_baseline_stock := 0;
                v_baseline_cost := v_unit_cost;
            END IF;
        END IF;

        -- SubProcess_WAC_Calculation (BPMN)
        IF (v_baseline_stock + v_quantity) > 0 THEN
            v_final_wac := ((v_baseline_stock * v_baseline_cost) + (v_quantity * v_unit_cost)) / (v_baseline_stock + v_quantity);
        ELSE
            v_final_wac := v_unit_cost;
        END IF;

        -- Price Proposal Generation
        IF v_target_margin IS NOT NULL THEN
            v_selling_price := ROUND((v_final_wac / (1 - v_target_margin)), 2);
        ELSE
            v_selling_price := v_final_wac * (1 + (v_tax_rate/100)) * (1 + (v_profit_margin/100));
        END IF;

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

    RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id, 'group_id', v_group_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

COMMIT;
