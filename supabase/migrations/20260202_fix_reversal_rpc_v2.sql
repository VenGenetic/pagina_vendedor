-- Migration: RPC Reverse Transaction V3 (Signed Ledger & Inventory Link)
-- Description: 
-- 1. Updates Reversal Logic to work with Signed Ledger (Math Mirror).
-- 2. Links Restore Inventory movements to the Reversal Transaction ID.

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
  v_rev_tx_id UUID;  -- Captured ID for Inventory Linking
  v_primary_rev_tx_id UUID; -- The one we will link inventory to
BEGIN
  -- 1. Get User Name
  SELECT COALESCE(full_name, auth.users.email, 'System') INTO v_user_name 
  FROM auth.users LEFT JOIN admins ON auth.users.id = admins.auth_id 
  WHERE auth.users.id = p_user_id;
  
  IF v_user_name IS NULL THEN v_user_name := 'System'; END IF;

  -- 2. Validate Target Transaction
  SELECT * INTO v_original_tx FROM transactions WHERE id = p_transaction_id;
  
  IF v_original_tx IS NULL THEN
    RAISE EXCEPTION 'Transaction NOT FOUND: %', p_transaction_id;
  END IF;

  v_group_id := v_original_tx.group_id;

  -- 3. Validate Group Existence
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Legacy Transaction Violation: No Group ID.';
  END IF;

  -- 4. Validate Not Already Reversed
  SELECT COUNT(*) INTO v_count FROM transactions 
  WHERE group_id = v_group_id AND is_reversed = TRUE;

  IF v_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Transaction Group is already reversed.');
  END IF;

  -- 5. Create New Reversal Group ID
  v_reversal_group_id := uuid_generate_v4();

  -- 6. Execute Mirror Loop
  FOR v_r IN SELECT * FROM transactions WHERE group_id = v_group_id LOOP
      
      -- Invert Sign (Math Mirror)
      v_new_amount := -1 * v_r.amount;

      -- Insert Mirror Entry
      INSERT INTO transactions (
          type, 
          amount, 
          description, 
          account_id, 
          payment_method, 
          reference_number, 
          notes, 
          created_at, 
          created_by, 
          created_by_name,
          group_id, 
          related_transaction_id,
          is_manual_adjustment
      ) VALUES (
          'REFUND', 
          v_new_amount,
          'Reversión: ' || v_r.description,
          v_r.account_id,
          v_r.payment_method,
          'REV-' || COALESCE(v_r.reference_number, ''),
          p_reason,
          NOW(),
          p_user_id,
          v_user_name,
          v_reversal_group_id, 
          v_r.id, 
          TRUE
      ) RETURNING id INTO v_rev_tx_id;
      
      -- Helper: If this is the reversal of the original input ID, or valid proxy, ignore. 
      -- We will just pick the FIRST generated ID to link inventory to, or pass the Group ID.
      -- Let's arbitrarily overwrite v_primary_rev_tx_id. 
      -- Ideally, we pick the one with Positive Amount? (Asset Refund)? 
      -- Simpler: Just pick the last one or first one. 
      v_primary_rev_tx_id := v_rev_tx_id;
      
  END LOOP;

  -- 7. Mark Original Group as Reversed
  UPDATE transactions 
  SET is_reversed = TRUE 
  WHERE group_id = v_group_id;

  -- 8. Handle Inventory Restoration
  IF v_original_tx.reference_number IS NOT NULL THEN
      PERFORM restore_inventory_for_reversal_v2(
          v_original_tx.reference_number, 
          p_user_id, 
          v_user_name, 
          v_primary_rev_tx_id -- Pass the Transaction ID!
      );
  END IF;

  RETURN jsonb_build_object(
      'success', true, 
      'reversal_group_id', v_reversal_group_id,
      'message', 'Transaction Group reversed successfully.'
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- Helper Function V2 (Accepts Transaction ID)
CREATE OR REPLACE FUNCTION restore_inventory_for_reversal_v2(
    p_reference_number TEXT,
    p_user_id UUID,
    p_user_name TEXT,
    p_reversal_transaction_id UUID -- Changed from Group ID to specific Transaction ID
) RETURNS VOID AS $$
DECLARE
    v_sale_record RECORD;
    v_sale_item RECORD;
    v_inventory_movement RECORD;
BEGIN
     SELECT * INTO v_sale_record FROM sales WHERE sale_number = p_reference_number;
     
     IF v_sale_record IS NOT NULL THEN
        -- Cancel Sale Status
        UPDATE sales SET payment_status = 'REVERSED', updated_at = NOW() WHERE id = v_sale_record.id;
        
        -- Restore Items
        FOR v_sale_item IN SELECT * FROM sale_items WHERE sale_id = v_sale_record.id LOOP
            IF v_sale_item.inventory_movement_id IS NOT NULL THEN
                SELECT * INTO v_inventory_movement FROM inventory_movements WHERE id = v_sale_item.inventory_movement_id;
                
                IF v_inventory_movement IS NOT NULL THEN
                    INSERT INTO inventory_movements (
                        product_id, type, quantity_change, unit_price, total_value,
                        transaction_id, -- LINK HERE
                        reason, notes, created_at, created_by, created_by_name
                    ) VALUES (
                        v_inventory_movement.product_id,
                        'IN',
                        ABS(v_inventory_movement.quantity_change),
                        v_inventory_movement.unit_price,
                        ABS(v_inventory_movement.total_value),
                        p_reversal_transaction_id, -- EXPLICIT LINK
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
