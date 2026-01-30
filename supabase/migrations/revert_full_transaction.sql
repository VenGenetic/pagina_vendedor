-- Actualizar función delete_transaction para revertir también inventario y ventas
-- Revertir dinero (cuentas), inventario (productos) y eliminar registros relacionados (ventas)

CREATE OR REPLACE FUNCTION delete_transaction(p_transaction_id UUID)
RETURNS JSON AS $$
DECLARE
  v_transaction RECORD;
  v_sale RECORD;
  v_rec RECORD;
BEGIN
  -- 1. Obtener Transacción
  SELECT * INTO v_transaction FROM transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN 
    RETURN json_build_object('success', false, 'error', 'Transacción no encontrada'); 
  END IF;

  -- 2. Revertir Dinero (Lógica Original)
  CASE v_transaction.type
    WHEN 'INCOME' THEN
      IF v_transaction.account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance - v_transaction.amount, updated_at = NOW() WHERE id = v_transaction.account_id;
      END IF;
    WHEN 'EXPENSE' THEN
      IF v_transaction.account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + v_transaction.amount, updated_at = NOW() WHERE id = v_transaction.account_id;
      END IF;
    WHEN 'TRANSFER' THEN
      IF v_transaction.account_out_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + v_transaction.amount, updated_at = NOW() WHERE id = v_transaction.account_out_id;
      END IF;
      IF v_transaction.account_in_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance - v_transaction.amount, updated_at = NOW() WHERE id = v_transaction.account_in_id;
      END IF;
  END CASE;

  -- 3. REVERTIR INVENTARIO

  -- Caso A: Enlace Directo (Compras / Gastos con Inventario usando transaction_id)
  FOR v_rec IN SELECT * FROM inventory_movements WHERE transaction_id = p_transaction_id LOOP
    -- Revertir Stock
    -- Si fue IN (qty > 0): Current - qty.
    -- Si fue OUT (qty < 0): Current - qty (que suma).
    UPDATE products SET current_stock = current_stock - v_rec.quantity_change WHERE id = v_rec.product_id;
    
    -- Eliminar movimiento
    DELETE FROM inventory_movements WHERE id = v_rec.id;
  END LOOP;

  -- Caso B: Enlace Indirecto vía Venta (Income)
  -- Si la transacción tiene reference_number que coincide con una venta
  IF v_transaction.reference_number IS NOT NULL THEN
     SELECT * INTO v_sale FROM sales WHERE sale_number = v_transaction.reference_number;
     
     IF FOUND THEN
        -- Encontrar movimientos vinculados a los items de la venta
        FOR v_rec IN 
            SELECT im.id, im.quantity_change, im.product_id 
            FROM sale_items si
            JOIN inventory_movements im ON si.inventory_movement_id = im.id
            WHERE si.sale_id = v_sale.id
        LOOP
            -- Revertir Stock
            UPDATE products SET current_stock = current_stock - v_rec.quantity_change WHERE id = v_rec.product_id;
            
            -- Eliminar movimiento
            DELETE FROM inventory_movements WHERE id = v_rec.id;
        END LOOP;

        -- Eliminar Items de Venta
        DELETE FROM sale_items WHERE sale_id = v_sale.id;

        -- Eliminar Venta
        DELETE FROM sales WHERE id = v_sale.id;
     END IF;
  END IF;

  -- 4. Eliminar Transacción
  DELETE FROM transactions WHERE id = p_transaction_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Transacción, dinero e inventario revertidos exitosamente'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;
