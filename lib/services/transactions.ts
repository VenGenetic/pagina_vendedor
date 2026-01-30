import { supabase } from '@/lib/supabase/client';
import { generateSaleNumber, safeAmount } from '@/lib/utils';
import type { CreateSaleInput, CreatePurchaseInput, EntradaCrearGasto, EntradaCrearIngreso, EntradaCrearTransferencia } from '@/types';

const PAYMENT_METHOD_MAP_REVERSE: Record<string, 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK' | 'OTHER'> = {
  'EFECTIVO': 'CASH',
  'TARJETA': 'CARD',
  'TRANSFERENCIA': 'TRANSFER',
  'CHEQUE': 'CHECK',
  'OTRO': 'OTHER'
};

async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { id: null, name: null };

  const { data: admin } = await supabase
    .from('admins')
    .select('full_name')
    .eq('auth_id', user.id)
    .single();

  const adminName = admin && typeof admin === 'object' && 'full_name' in admin
    ? (admin as { full_name: string }).full_name
    : null;

  return {
    id: user.id,
    name: adminName || user.email || 'Usuario'
  };
}

/**
 * Process a complete sale transaction with full data integrity
 * This function handles:
 * 1. Create sale record
 * 2. Create sale items
 * 3. Create inventory movements (OUT)
 * 4. Update product stock (via trigger)
 * 5. Create transaction (INCOME)
 * 6. Update account balance (via trigger)
 */
export async function processSale(input: CreateSaleInput) {
  try {
    const user = await getCurrentUser();

    // Obtener costos de los productos (Opcional, si queremos enviarlos explícitamente, 
    // pero el RPC podría buscarlos. Por ahora mantenemos la lógica de obtener cost_map
    // para enviarlo en el array de items y que quede registrado en el histórico).
    const productIds = input.articulos.map((a) => a.id_producto);
    const { data: productsCostData } = await supabase
      .from('products')
      .select('id, cost_price')
      .in('id', productIds);

    const costMap = new Map<string, number>();
    (productsCostData || []).forEach((p: any) => {
      costMap.set(p.id, Number(p.cost_price) || 0);
    });

    // Prepare items for JSONB parameter
    const itemsPayload = input.articulos.map(item => ({
      product_id: item.id_producto,
      quantity: item.cantidad,
      price: item.precio_unitario,
      discount: item.descuento || 0,
      cost_unit: item.costo_unitario ?? costMap.get(item.id_producto) ?? 0
    }));

    // Calculate totals locally for the RPC call params
    const subtotal = safeAmount(input.articulos.reduce((sum, item) => sum + (item.cantidad * item.precio_unitario), 0));
    const tax = safeAmount(input.impuesto || 0);
    const discount = safeAmount(input.descuento || 0);
    const shippingCost = safeAmount(input.costo_envio || 0);
    const total = safeAmount(subtotal + tax - discount);

    // Call RPC
    const { data, error } = await supabase.rpc('process_sale_transaction', {
      p_sale_number: generateSaleNumber(),
      p_customer_name: input.nombre_cliente,
      p_customer_phone: input.telefono_cliente,
      p_customer_email: input.email_cliente,
      p_subtotal: subtotal,
      p_tax: tax,
      p_discount: discount,
      p_total: total,
      p_shipping_cost: shippingCost,
      p_account_id: input.id_cuenta,
      p_payment_method: PAYMENT_METHOD_MAP_REVERSE[input.metodo_pago],
      p_items: itemsPayload,
      p_user_id: user.id,
      p_user_name: user.name,
      p_notes: input.notas,
      p_shipping_account_id: input.id_cuenta_envio
    });

    if (error) throw error;

    return {
      success: true,
      data
    };

  } catch (error: any) {
    console.error('Error processing sale:', error);
    return {
      success: false,
      error: error.message || 'Failed to process sale',
    };
  }
}

/**
 * Process a purchase/restock transaction
 */
export async function processPurchase(input: CreatePurchaseInput) {
  try {
    const user = await getCurrentUser();

    let transaction: any = null;

    if (!input.es_ingreso_gratuito) {
      if (!input.id_cuenta || !input.metodo_pago) {
        throw new Error('Se requiere cuenta y método de pago para compras con costo');
      }

      const totalCost = safeAmount(input.articulos.reduce(
        (sum, item) => sum + item.cantidad * item.costo_unitario,
        0
      ));

      // Create transaction (EXPENSE)
      const { data: transactionData, error: transactionError } = await supabase
        .from('transactions')
        .insert({
          type: 'EXPENSE',
          amount: totalCost,
          description: `Compra de inventario${input.nombre_proveedor ? ` - ${input.nombre_proveedor}` : ''}`,
          account_id: input.id_cuenta,
          account_out_id: input.id_cuenta,
          payment_method: PAYMENT_METHOD_MAP_REVERSE[input.metodo_pago],
          notes: input.notas,
          created_by: user.id,
          created_by_name: user.name,
        } as any)
        .select()
        .single();

      if (transactionError) throw transactionError;
      transaction = transactionData;
    }

    // Create inventory movements (IN) (Parallelized)
    await Promise.all(input.articulos.map(async (item) => {
      // 0. Get current stock (No longer needed as stock is updated by trigger)
      // const { data: currentProduct, error: fetchError } = await supabase
      //   .from('products')
      //   .select('current_stock')
      //   .eq('id', item.id_producto)
      //   .single();

      // if (fetchError) throw fetchError;

      // // Cast to any to handle potential type inference issues with single()
      // const productData = currentProduct as any;
      // const newStock = (productData?.current_stock || 0) + item.cantidad;

      // 1. Create Movement
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: item.id_producto,
          type: 'IN',
          quantity_change: item.cantidad, // Positive for IN
          unit_price: item.costo_unitario,
          total_value: item.cantidad * item.costo_unitario,
          transaction_id: transaction?.id || null,
          reason: input.es_ingreso_gratuito ? 'COUNT_ADJUSTMENT' : 'PURCHASE',
          notes: input.notas || (input.es_ingreso_gratuito ? 'Ingreso externo / Gratuito' : undefined),
        } as any);

      if (movementError) throw movementError;

      // 2. Update Product Costs and Selling Price (Updated At only, NO STOCK OVERWRITE)
      // Stock is handled by DB Trigger: trigger_update_product_stock (from inventory_movements)
      const updates: any = {
        updated_at: new Date().toISOString()
      };

      if (item.costo_unitario > 0) {
        updates.cost_price = item.costo_unitario;
        // Use IVA and profit margin provided, or defaults if not provided
        const ivaTax = input.iva_tax ?? 15; // Default 15% IVA
        const profitMargin = input.profit_margin ?? 65; // Default 65% profit margin
        const ivaMultiplier = 1 + (ivaTax / 100);
        const profitMultiplier = 1 + (profitMargin / 100);
        updates.selling_price = safeAmount(item.costo_unitario * ivaMultiplier * profitMultiplier);
      }

      const { error: updateError } = await (supabase as any)
        .from('products')
        .update(updates)
        .eq('id', item.id_producto);

      if (updateError) throw updateError;
    }));

    return {
      success: true,
      data: { transaction },
    };
  } catch (error: any) {
    console.error('Error processing purchase:', error);
    return {
      success: false,
      error: error.message || 'Failed to process purchase',
    };
  }
}

/**
 * Create an expense transaction
 */
export async function createExpense(input: EntradaCrearGasto) {
  try {
    const user = await getCurrentUser();

    const { data: transaction, error } = await supabase
      .from('transactions')
      .insert({
        type: 'EXPENSE',
        amount: input.monto,
        description: input.descripcion,
        account_id: input.id_cuenta,
        account_out_id: input.id_cuenta,
        payment_method: PAYMENT_METHOD_MAP_REVERSE[input.metodo_pago],
        reference_number: input.numero_referencia,
        notes: input.notas,
        created_by: user.id,
        created_by_name: user.name,
      } as any)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: { transaction },
    };
  } catch (error: any) {
    console.error('Error creating expense:', error);
    return {
      success: false,
      error: error.message || 'Failed to create expense',
    };
  }
}

/**
 * Create a commission/other income transaction (No inventory)
 * Supports creating associated cost/shipping expenses automatically.
 */
export async function createIncome(input: EntradaCrearIngreso) {
  try {
    const user = await getCurrentUser();

    // 1. Create Main Income Transaction (Sale Value)
    const { data: transactionData, error } = await supabase
      .from('transactions')
      .insert({
        type: 'INCOME',
        amount: input.monto,
        description: input.descripcion,
        account_id: input.id_cuenta,
        account_in_id: input.id_cuenta,
        payment_method: PAYMENT_METHOD_MAP_REVERSE[input.metodo_pago],
        reference_number: input.numero_referencia,
        notes: input.notas,
        created_by: user.id,
        created_by_name: user.name,
      } as any)
      .select()
      .single();

    if (error) throw error;
    const transaction = transactionData as any; // Fix TS 'never' inference


    // 2. Optional: Create Cost Expense (if provided)
    if (input.costo_repuesto && input.costo_repuesto > 0 && input.id_cuenta_costo) {
      await createExpense({
        descripcion: `Costo Repuesto: ${input.descripcion}`,
        monto: input.costo_repuesto,
        id_cuenta: input.id_cuenta_costo,
        metodo_pago: 'OTRO',
        numero_referencia: `REL-${transaction.id}`,
        notas: `Costo asociado a venta #${transaction.id}`
      });
    }

    // 3. Optional: Create Shipping Expense (if provided)
    if (input.costo_envio && input.costo_envio > 0 && input.id_cuenta_envio) {
      await createExpense({
        descripcion: `Envío Repuesto: ${input.descripcion}`,
        monto: input.costo_envio,
        id_cuenta: input.id_cuenta_envio,
        metodo_pago: 'OTRO',
        numero_referencia: `ENV-${transaction.id}`,
        notas: `Envío asociado a venta #${transaction.id}`
      });
    }

    return {
      success: true,
      data: { transaction },
    };
  } catch (error: any) {
    console.error('Error creating income:', error);
    return {
      success: false,
      error: error.message || 'Failed to create income',
    };
  }
}

/**
 * Delete a commission transaction and its associated costs (expenses)
 */
export async function deleteCommission(transactionId: string) {
  try {
    // 1. Delete associated expenses first (referencing the main income ID)
    const { error: errorExpenses } = await supabase
      .from('transactions')
      .delete()
      .or(`reference_number.eq.REL-${transactionId},reference_number.eq.ENV-${transactionId}`);

    if (errorExpenses) throw errorExpenses;

    // 2. Delete the main income transaction
    const { error: errorMain } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId);

    if (errorMain) throw errorMain;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting commission:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete commission',
    };
  }
}

/**
 * Delete a Sale and all associated records (Inventory movements, Transaction, Items)
 * This reverts the stock deduction and the money income.
 */
export async function deleteSale(saleId: string) {
  try {
    // 1. Get Sale to find sale_number for linking transactions
    const { data: sale, error: saleFetchError } = await supabase
      .from('sales')
      .select('sale_number')
      .eq('id', saleId)
      .single();

    if (saleFetchError) throw saleFetchError;
    const saleData = sale as any;

    // 2. Get Inventory Movement IDs from sale items to delete them
    const { data: items, error: itemsError } = await supabase
      .from('sale_items')
      .select('inventory_movement_id')
      .eq('sale_id', saleId);

    if (itemsError) throw itemsError;

    const movementIds = (items || [])
      .map((i: any) => i.inventory_movement_id)
      .filter((id: any) => id !== null) as string[];

    // 3. Delete Inventory Movements (Stock should be restored by DB triggers)
    if (movementIds.length > 0) {
      const { error: moveError } = await supabase
        .from('inventory_movements')
        .delete()
        .in('id', movementIds);
      if (moveError) throw moveError;
    }

    // 4. Delete Transactions (Income and potentially Shipping Expense)
    // Linked via reference_number
    if (saleData?.sale_number) {
      const { error: txError } = await supabase
        .from('transactions')
        .delete()
        .eq('reference_number', saleData.sale_number);
      if (txError) throw txError;
    }

    // 5. Delete the Sale itself (Cascades to sale_items)
    const { error: deleteError } = await supabase
      .from('sales')
      .delete()
      .eq('id', saleId);

    if (deleteError) throw deleteError;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting sale:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a Purchase Transaction
 * Reverts stock addition and money expense.
 */
export async function deletePurchase(transactionId: string) {
  try {
    // 1. Delete associated Inventory Movements (Stock should be restored by DB triggers)
    // Purchases store the transaction_id in the movement
    const { error: moveError } = await supabase
      .from('inventory_movements')
      .delete()
      .eq('transaction_id', transactionId);

    if (moveError) throw moveError;

    // 2. Delete the Transaction
    const { error: txError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId);

    if (txError) throw txError;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting purchase:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a generic Expense Transaction
 */
export async function deleteExpense(transactionId: string) {
  try {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting expense:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Crea una transferencia entre dos cuentas
 */
export async function crearTransferencia(input: EntradaCrearTransferencia) {
  try {
    const user = await getCurrentUser();

    // Call the RPC function we created in SQL
    const { data, error } = await supabase
      .rpc('transfer_funds', {
        p_source_account_id: input.id_cuenta_origen,
        p_destination_account_id: input.id_cuenta_destino,
        p_amount: input.monto,
        p_description: input.descripcion,
        p_user_id: user.id || undefined
      } as any);

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('Error creating transfer:', error);
    return { success: false, error };
  }
}
