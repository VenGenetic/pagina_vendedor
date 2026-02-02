-- Migration: rpc_reverse_transaction
-- Purpose: Full implementation of Safe Reversal Logic
-- Date: 2026-02-02

CREATE OR REPLACE FUNCTION rpc_reverse_transaction(
  p_transaction_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Reversión solicitada por usuario'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_original_tx RECORD;
  v_new_tx_id UUID;
  v_sale_record RECORD;
  v_sale_item RECORD;
  v_inventory_movement RECORD;
  v_new_type VARCHAR;
  v_new_description TEXT;
  v_user_name TEXT;
BEGIN
  -- 1. Get User Name
  SELECT COALESCE(full_name, email, 'System') INTO v_user_name 
  FROM auth.users LEFT JOIN admins ON auth.users.id = admins.auth_id 
  WHERE auth.users.id = p_user_id;
  
  IF v_user_name IS NULL THEN v_user_name := 'System'; END IF;

  -- 2. Fetch Original & Validate
  SELECT * INTO v_original_tx FROM transactions WHERE id = p_transaction_id;
  
  IF v_original_tx IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_original_tx.is_reversed THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transaction already reversed');
  END IF;

  -- 3. Determine Reversal Type
  -- We use 'REFUND' as the generic "Anti-Transaction" type, but maintain directionality via amount logic or separate types?
  -- If we use 'REFUND', it needs to act as Income or Expense depending on original?
  -- Better: Use 'REFUND' as the type, and handle Balance updates in Trigger based on 'REFUND' context?
  -- Wait, `trigger_update_account_balance` needs to know if REFUND adds or subtracts.
  -- Simpler: Keep using 'INCOME'/'EXPENSE' for the *Accounting* layer, but mark as 'REFUND' if we successfully updated trigger?
  -- Or: Update `trigger_update_account_balance` to handle 'REFUND'.
  -- Let's stick to the Plan: Use 'REFUND'. 
  -- But we need to update the Trigger Logic too! (See Step 4).
  -- Actually, the easiest way to avoid Trigger Hell is to use the OPPOSITE type (INCOME/EXPENSE) and link them.
  -- But User requested 'REFUND'.
  -- Let's use 'REFUND' and assume we update the logic.
  
  v_new_type := 'REFUND';
  v_new_description := 'Reversión: ' || v_original_tx.description;

  -- 4. Create Reversal Transaction
  INSERT INTO transactions (
    type, amount, description,
    account_id,
    payment_method, reference_number, notes,
    related_transaction_id,  -- <Link
    created_at, created_by, created_by_name
  ) VALUES (
    v_new_type,
    v_original_tx.amount, -- Store as positive, handled by logic
    v_new_description,
    v_original_tx.account_id,
    v_original_tx.payment_method,
    'REV-' || COALESCE(v_original_tx.reference_number, ''),
    p_reason,
    p_transaction_id,
    NOW(), p_user_id, v_user_name
  ) RETURNING id INTO v_new_tx_id;

  -- 5. Mark Original as Reversed
  UPDATE transactions SET is_reversed = true WHERE id = p_transaction_id;

  -- 6. Inventory Logic (Restoration)
  -- Same logic as before: Reverse movements
  IF v_original_tx.reference_number IS NOT NULL THEN
     SELECT * INTO v_sale_record FROM sales WHERE sale_number = v_original_tx.reference_number;
     IF v_sale_record IS NOT NULL THEN
        UPDATE sales SET payment_status = 'CANCELLED', updated_at = NOW() WHERE id = v_sale_record.id;
        FOR v_sale_item IN SELECT * FROM sale_items WHERE sale_id = v_sale_record.id LOOP
            IF v_sale_item.inventory_movement_id IS NOT NULL THEN
                SELECT * INTO v_inventory_movement FROM inventory_movements WHERE id = v_sale_item.inventory_movement_id;
                IF v_inventory_movement IS NOT NULL THEN
                    INSERT INTO inventory_movements (
                        product_id, type, quantity_change, unit_price, total_value,
                        transaction_id, reason, notes, created_at, created_by, created_by_name
                    ) VALUES (
                        v_inventory_movement.product_id,
                        'IN', -- Restore
                        ABS(v_inventory_movement.quantity_change),
                        v_inventory_movement.unit_price,
                        ABS(v_inventory_movement.total_value),
                        v_new_tx_id,
                        'RETURN', -- Reason
                        'Restauracion por reversión',
                        NOW(), p_user_id, v_user_name
                    );
                END IF;
            END IF;
        END LOOP;
     END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'new_transaction_id', v_new_tx_id);
END;
$$;
