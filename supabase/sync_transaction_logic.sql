-- ============================================
-- Sync Transaction Logic
-- ============================================
-- Description: This script synchronizes the backend functions and triggers with the documented workflows.
-- It acts as a "Source of Truth" application to ensure the database logic matches the code and documentation.
-- Includes fixes for: Missing sales columns, Payment Method Mapping, and Trigger Logic.
--
-- BPMN References:
--   Financial_Management_Process.bpmn: Reversal Flow, Transfer Flow
--   Sales_Process.bpmn: Sale Execution Subprocess
-- 
-- This file is the canonical source for trigger logic synchronization.
-- ============================================

BEGIN;

-- ==========================================
-- 1. ACCOUNT BALANCE TRIGGERS
-- ==========================================

-- Drop potential duplicate triggers to ensure integrity
DROP TRIGGER IF EXISTS trigger_update_account_balance ON transactions;
DROP TRIGGER IF EXISTS update_account_balance_trigger ON transactions;
DROP TRIGGER IF EXISTS on_transaction_created ON transactions;

-- Create/Replace the Balance Update Function
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_orig_type VARCHAR;
BEGIN
  -- CASE: INSERT (New Transaction)
  IF TG_OP = 'INSERT' THEN
    
    -- INCOME: Add to Account
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- EXPENSE: Subtract from Account
    ELSIF NEW.type = 'EXPENSE' THEN
      UPDATE accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
      
    -- TRANSFER: Subtract from Source, Add to Destination
    ELSIF NEW.type = 'TRANSFER' THEN
      -- Debit Source
      UPDATE accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_out_id;
      -- Credit Destination
      UPDATE accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_in_id;

    -- REFUND: Reverse the effect of the original transaction
    ELSIF NEW.type = 'REFUND' THEN
      IF NEW.related_transaction_id IS NOT NULL THEN
        SELECT type INTO v_orig_type FROM transactions WHERE id = NEW.related_transaction_id;
        
        -- Reverse INCOME -> Subtract
        IF v_orig_type = 'INCOME' THEN
          UPDATE accounts 
          SET balance = balance - NEW.amount, updated_at = NOW() 
          WHERE id = NEW.account_id;
          
        -- Reverse EXPENSE -> Add
        ELSIF v_orig_type = 'EXPENSE' THEN
          UPDATE accounts 
          SET balance = balance + NEW.amount, updated_at = NOW() 
          WHERE id = NEW.account_id;
        END IF;
      END IF;
    END IF;

    RETURN NEW;

  -- CASE: DELETE (Undo Transaction)
  ELSIF TG_OP = 'DELETE' THEN
    
    -- INCOME: Subtract from Account
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts 
      SET balance = balance - OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_id;
      
    -- EXPENSE: Add to Account
    ELSIF OLD.type = 'EXPENSE' THEN
      UPDATE accounts 
      SET balance = balance + OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_id;
      
    -- TRANSFER: Add to Source, Subtract from Destination
    ELSIF OLD.type = 'TRANSFER' THEN
      -- Refund Source
      UPDATE accounts 
      SET balance = balance + OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_out_id;
      -- Debit Destination
      UPDATE accounts 
      SET balance = balance - OLD.amount, updated_at = NOW()
      WHERE id = OLD.account_in_id;

    -- REFUND: Undo the Refund (Re-apply original)
    ELSIF OLD.type = 'REFUND' THEN
      IF OLD.related_transaction_id IS NOT NULL THEN
        SELECT type INTO v_orig_type FROM transactions WHERE id = OLD.related_transaction_id;
        
        -- Undo Refund of INCOME -> Add back
        IF v_orig_type = 'INCOME' THEN
          UPDATE accounts 
          SET balance = balance + OLD.amount, updated_at = NOW() 
          WHERE id = OLD.account_id;
          
        -- Undo Refund of EXPENSE -> Subtract again
        ELSIF v_orig_type = 'EXPENSE' THEN
          UPDATE accounts 
          SET balance = balance - OLD.amount, updated_at = NOW() 
          WHERE id = OLD.account_id;
        END IF;
      END IF;
    END IF;

    RETURN OLD;

  -- CASE: UPDATE (Delta Logic)
  ELSIF TG_OP = 'UPDATE' THEN
    
    -- 1. First, UNDO the OLD values
    IF OLD.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
    ELSIF OLD.type = 'EXPENSE' THEN
      UPDATE accounts SET balance = balance + OLD.amount WHERE id = OLD.account_id;
    ELSIF OLD.type = 'TRANSFER' THEN
      UPDATE accounts SET balance = balance + OLD.amount WHERE id = OLD.account_out_id;
      UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_in_id;
    ELSIF OLD.type = 'REFUND' THEN
       -- Undo Refund logic
       SELECT type INTO v_orig_type FROM transactions WHERE id = OLD.related_transaction_id;
       IF v_orig_type = 'INCOME' THEN
          UPDATE accounts SET balance = balance + OLD.amount WHERE id = OLD.account_id;
       ELSIF v_orig_type = 'EXPENSE' THEN
          UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
       END IF;
    END IF;

    -- 2. Then, APPLY the NEW values
    IF NEW.type = 'INCOME' THEN
      UPDATE accounts SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'EXPENSE' THEN
      UPDATE accounts SET balance = balance - NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
    ELSIF NEW.type = 'TRANSFER' THEN
      UPDATE accounts SET balance = balance - NEW.amount, updated_at = NOW() WHERE id = NEW.account_out_id;
      UPDATE accounts SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = NEW.account_in_id;
    ELSIF NEW.type = 'REFUND' THEN
       -- Apply Refund logic
       SELECT type INTO v_orig_type FROM transactions WHERE id = NEW.related_transaction_id;
       IF v_orig_type = 'INCOME' THEN
          UPDATE accounts SET balance = balance - NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
       ELSIF v_orig_type = 'EXPENSE' THEN
          UPDATE accounts SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = NEW.account_id;
       END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Re-create the Trigger
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

COMMIT;

-- ==========================================
-- 2. SALES RPC (Updated with Fixes)
-- ==========================================

CREATE OR REPLACE FUNCTION process_sale_transaction(
  p_sale_number TEXT,
  p_customer_id_number TEXT, -- Cédula/RUC
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT,
  p_customer_city TEXT,
  p_customer_address TEXT,
  p_subtotal DECIMAL,
  p_tax DECIMAL,
  p_discount DECIMAL,
  p_total DECIMAL,
  p_shipping_cost DECIMAL,
  p_account_id UUID,
  p_payment_method TEXT, -- 'EFECTIVO', 'TARJETA', 'TRANSFERENCIA' (Mapped from frontend)
  p_items JSONB, -- Array of objects: { product_id, quantity, price, discount, cost_unit }
  p_user_id UUID,
  p_user_name TEXT,
  p_notes TEXT,
  p_shipping_account_id UUID DEFAULT NULL
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
  v_current_stock INTEGER;
  v_product_name TEXT;
  v_item_subtotal DECIMAL;
  v_item_cost_total DECIMAL;
  v_movement_id UUID;
  v_payment_method_enum VARCHAR;
BEGIN
  -- 1. Map payment method to enum
  v_payment_method_enum := p_payment_method;

  -- 2. Validate Stock for ALL items first
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    -- Lock the product
    SELECT current_stock, name INTO v_current_stock, v_product_name
    FROM products
    WHERE id = v_product_id
    FOR UPDATE;

    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto: %. Stock actual: %, Solicitado: %', v_product_name, v_current_stock, v_quantity;
    END IF;
  END LOOP;

  -- 3. Customer Logic (Upsert)
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
      INSERT INTO customers (
        identity_document, name, phone, email, city, address, created_at, updated_at
      ) VALUES (
        p_customer_id_number, 
        COALESCE(p_customer_name, 'Cliente Sin Nombre'), 
        p_customer_phone, 
        p_customer_email, 
        p_customer_city, 
        p_customer_address,
        NOW(), NOW()
      ) RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  -- 4. Create Sale Record (FIX: Added shipping_cost, created_by)
  INSERT INTO sales (
    sale_number, 
    customer_id, 
    customer_name, 
    customer_phone, 
    customer_email,
    subtotal, tax, discount, total, 
    shipping_cost, -- FIXED
    account_id, payment_status, notes, 
    created_at, created_by, created_by_name -- FIXED
  ) VALUES (
    p_sale_number, 
    v_customer_id,
    p_customer_name, 
    p_customer_phone, 
    p_customer_email,
    p_subtotal, p_tax, p_discount, p_total,
    p_shipping_cost, -- FIXED
    p_account_id, 'PAID', p_notes,
    NOW(), p_user_id, p_user_name -- FIXED
  ) RETURNING id INTO v_sale_id;

  -- 5. Process Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_price := (v_item->>'price')::DECIMAL;
    v_item_discount := COALESCE((v_item->>'discount')::DECIMAL, 0);
    v_cost_unit := COALESCE((v_item->>'cost_unit')::DECIMAL, 0);
    
    v_item_subtotal := (v_quantity * v_price) - v_item_discount;
    v_item_cost_total := v_quantity * v_cost_unit;

    -- Inventory Movement (OUT)
    INSERT INTO inventory_movements (
      product_id, type, quantity_change, unit_price, total_value,
      reason, notes, created_at, created_by, created_by_name -- FIXED
    ) VALUES (
      v_product_id, 'OUT', -v_quantity, v_price, v_item_subtotal,
      'SALE', 'Venta ' || p_sale_number, NOW(), p_user_id, p_user_name -- FIXED
    ) RETURNING id INTO v_movement_id;

    -- Sale Item (FIX: Added cost columns)
    INSERT INTO sale_items (
      sale_id, product_id, quantity, unit_price, discount,
      subtotal, inventory_movement_id,
      cost_unit, cost_total -- FIXED
    ) VALUES (
      v_sale_id, v_product_id, v_quantity, v_price, v_item_discount,
      v_item_subtotal, v_movement_id,
      v_cost_unit, v_item_cost_total -- FIXED
    );
  END LOOP;

  -- 6. Create Income Transaction (FIX: Added created_by_name)
  INSERT INTO transactions (
    type, amount, description, 
    account_id, payment_method, reference_number,
    notes, created_at, created_by, created_by_name -- FIXED
  ) VALUES (
    'INCOME', p_total, 'Venta ' || p_sale_number || COALESCE(' - ' || p_customer_name, ''),
    p_account_id, v_payment_method_enum, p_sale_number,
    p_notes, NOW(), p_user_id, p_user_name -- FIXED
  ) RETURNING id INTO v_transaction_id;

  -- 7. Create Shipping Expense (FIX: Added created_by_name)
  IF p_shipping_cost > 0 AND p_shipping_account_id IS NOT NULL THEN
    INSERT INTO transactions (
      type, amount, description, 
      account_id, payment_method, reference_number,
      notes, created_at, created_by, created_by_name -- FIXED
    ) VALUES (
      'EXPENSE', p_shipping_cost, 'Envío venta ' || p_sale_number,
      p_shipping_account_id, v_payment_method_enum, p_sale_number,
      p_notes, NOW(), p_user_id, p_user_name -- FIXED
    ) RETURNING id INTO v_shipping_tx_id;
  END IF;

  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'transaction_id', v_transaction_id,
    'customer_id', v_customer_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ==========================================
-- 3. CONSTRAINTS
-- ==========================================
-- Permit negative balances as per General Ledger Key Logic
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS positive_balance;
