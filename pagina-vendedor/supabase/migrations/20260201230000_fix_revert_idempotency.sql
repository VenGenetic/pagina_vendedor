-- Migration: fix_revert_idempotency
-- Purpose: Prevent duplicate reversals by checking if a transaction has already been reversed.
-- Date: 2026-02-01

CREATE OR REPLACE FUNCTION revert_transaction_soft(
  p_transaction_id UUID,
  p_user_id UUID
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
  v_reverse_account_id UUID;
  v_reverse_account_dest_id UUID;
  v_user_name TEXT;
  v_existing_repro TEXT;
BEGIN
  -- 1. Get User Name for logging
  SELECT COALESCE(full_name, email, 'System') INTO v_user_name 
  FROM auth.users LEFT JOIN admins ON auth.users.id = admins.auth_id 
  WHERE auth.users.id = p_user_id;
  
  IF v_user_name IS NULL THEN
    v_user_name := 'System';
  END IF;

  -- 2. Fetch Original Transaction
  SELECT * INTO v_original_tx FROM transactions WHERE id = p_transaction_id;
  
  IF v_original_tx IS NULL THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;

  -- 2.5 IDEMPOTENCY CHECK
  -- Check if a reversal transaction already exists for this original transaction
  -- We identify it by the note/description or reference number pattern
  -- Note: We check if ANY transaction exists that claims to be a reversal of this ID
  -- AND has the opposite type (or is a reversal at all)
  IF EXISTS (
    SELECT 1 FROM transactions 
    WHERE notes = 'Reversión de transacción ' || p_transaction_id
  ) THEN
    -- Already reversed, return success to prevent error but do nothing
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Transaction already reversed',
      'idempotent', true
    );
  END IF;

  -- 3. Determine Reversal Type and Accounts
  IF v_original_tx.type = 'INCOME' THEN
    v_new_type := 'EXPENSE';
    v_reverse_account_id := v_original_tx.account_id;
    -- For Expense, account_out_id is usually the same as account_id
    v_reverse_account_dest_id := v_original_tx.account_id; 
    
  ELSIF v_original_tx.type = 'EXPENSE' THEN
    v_new_type := 'INCOME';
    v_reverse_account_id := v_original_tx.account_id;
    
  ELSIF v_original_tx.type = 'TRANSFER' THEN
    v_new_type := 'TRANSFER';
    -- Swap Source and Dest (Logic remains same as original script)
    NULL; -- Placeholder
  ELSE
    RAISE EXCEPTION 'Unknown transaction type: %', v_original_tx.type;
  END IF;

  v_new_description := 'Anulación: ' || v_original_tx.description;

  -- 4. Create Compensating Transaction
  IF v_original_tx.type = 'TRANSFER' THEN
      INSERT INTO transactions (
        type, amount, description, 
        account_id, -- Often the primary account for the view, or null?
        account_out_id, account_in_id,
        payment_method, reference_number, notes,
        created_at, created_by, created_by_name
      ) VALUES (
        'TRANSFER',
        v_original_tx.amount,
        v_new_description,
        v_original_tx.account_in_id, -- New primary? Or keep logic simple.
        v_original_tx.account_in_id, -- New Source = Old Dest
        v_original_tx.account_out_id, -- New Dest = Old Source
        v_original_tx.payment_method,
        'REV-' || COALESCE(v_original_tx.reference_number, ''),
        'Reversión de transacción ' || p_transaction_id,
        NOW(), p_user_id, v_user_name
      ) RETURNING id INTO v_new_tx_id;
  ELSE
      -- Income / Expense
      INSERT INTO transactions (
        type, amount, description,
        account_id,
        payment_method, reference_number, notes,
        created_at, created_by, created_by_name
      ) VALUES (
        v_new_type,
        v_original_tx.amount,
        v_new_description,
        v_original_tx.account_id,
        v_original_tx.payment_method,
        'REV-' || COALESCE(v_original_tx.reference_number, ''),
        'Reversión de transacción ' || p_transaction_id,
        NOW(), p_user_id, v_user_name
      ) RETURNING id INTO v_new_tx_id;
  END IF;

  -- 5. Handle Inventory & specific Sale logic
  -- CASE A: Transaction linked to a SALE (by reference number)
  -- Only if it was an INCOME (Main sale transaction)
  IF v_original_tx.type = 'INCOME' AND v_original_tx.reference_number IS NOT NULL THEN
     
     SELECT * INTO v_sale_record FROM sales WHERE sale_number = v_original_tx.reference_number;
     
     IF v_sale_record IS NOT NULL THEN
        -- Mark sale as cancelled
        UPDATE sales SET payment_status = 'CANCELLED', updated_at = NOW() WHERE id = v_sale_record.id;
        
        -- Loop through sale items to reverse inventory
        FOR v_sale_item IN SELECT * FROM sale_items WHERE sale_id = v_sale_record.id LOOP
            
            -- Find original movement
            IF v_sale_item.inventory_movement_id IS NOT NULL THEN
                SELECT * INTO v_inventory_movement FROM inventory_movements WHERE id = v_sale_item.inventory_movement_id;
                
                IF v_inventory_movement IS NOT NULL THEN
                    -- Create compensatory movement (IN)
                    -- Original was OUT (negative quantity in logic, but absolute in db? schema says quantity_change is signed)
                    -- If original was -1, new should be +1.
                    
                    INSERT INTO inventory_movements (
                        product_id, type, quantity_change, unit_price, total_value,
                        transaction_id, reason, notes, created_at, created_by, created_by_name
                    ) VALUES (
                        v_inventory_movement.product_id,
                        'IN',
                        ABS(v_inventory_movement.quantity_change), -- Restoration is positive
                        v_inventory_movement.unit_price,
                        ABS(v_inventory_movement.total_value),
                        v_new_tx_id, -- Link to the REVERSAL transaction
                        'TRANSACTION_REVERSAL',
                        'Restauracion por anulacion de venta ' || v_sale_record.sale_number,
                        NOW(),
                        p_user_id,
                        v_user_name
                    );
                END IF;
            END IF;
        END LOOP;
     END IF;
  END IF;

  -- CASE B: Transaction linked directly to Inventory Movements (e.g. Purchase)
  -- Purchases (EXPENSE) usually have `inventory_movements.transaction_id` pointing to them.
  -- Only do this if we haven't already handled it via Sale logic (to avoid double dip if sale also linked via ID)
  -- But Sales usually map via `sale_items`, not `transaction_id` directly on the movement (though they might).
  -- Let's be safe: If it's an EXPENSE (Purchase), we definitely look for movements.
  
  IF v_original_tx.type = 'EXPENSE' THEN
      FOR v_inventory_movement IN SELECT * FROM inventory_movements WHERE transaction_id = p_transaction_id LOOP
          
          -- Purchase movements are IN (+). Reversal should be OUT (-).
          -- Check original type
          IF v_inventory_movement.type = 'IN' THEN
             INSERT INTO inventory_movements (
                 product_id, type, quantity_change, unit_price, total_value,
                 transaction_id, reason, notes, created_at, created_by, created_by_name
             ) VALUES (
                 v_inventory_movement.product_id,
                 'OUT',
                 -1 * ABS(v_inventory_movement.quantity_change), -- Remove stock
                 v_inventory_movement.unit_price,
                 v_inventory_movement.total_value,
                 v_new_tx_id,
                 'TRANSACTION_REVERSAL',
                 'Anulacion de compra/ingreso',
                 NOW(),
                 p_user_id,
                 v_user_name
             );
          END IF;
      END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'new_transaction_id', v_new_tx_id
  );

END;
$$;
