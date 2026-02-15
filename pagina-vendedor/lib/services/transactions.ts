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
      cost_unit: item.costo_unitario ?? costMap.get(item.id_producto) ?? 0,
      reservation_id: item.reservation_id,
      is_dropship: item.is_dropship,
      provider_name: item.provider_name,
      provider_cost: item.provider_cost
    }));

    // Calculate totals locally for the RPC call params
    const subtotal = safeAmount(input.articulos.reduce((sum, item) => sum + (item.cantidad * item.precio_unitario), 0));
    const tax = safeAmount(input.impuesto || 0);
    const discount = safeAmount(input.descuento || 0);
    const shippingCost = safeAmount(input.costo_envio || 0);
    const total = safeAmount(subtotal + tax - discount);

    // Call RPC
    const { data, error } = await supabase.rpc('process_sale_with_reservation', {
      p_sale_number: generateSaleNumber(),
      p_customer_id_number: input.cedula_cliente || null,
      p_customer_name: input.nombre_cliente,
      p_customer_phone: input.telefono_cliente || null,
      p_customer_email: input.email_cliente || null,
      p_customer_city: input.ciudad_cliente || null,
      p_customer_address: input.direccion_cliente || null,
      p_subtotal: Math.abs(subtotal),
      p_tax: Math.abs(tax),
      p_discount: Math.abs(discount),
      p_total: Math.abs(total),
      p_shipping_cost: Math.abs(shippingCost),
      p_account_id: input.id_cuenta,
      p_payment_method: PAYMENT_METHOD_MAP_REVERSE[input.metodo_pago],
      p_items: itemsPayload,
      p_user_id: user.id,
      p_user_name: user.name,
      p_notes: input.notas,
      p_shipping_account_id: input.id_cuenta_envio,
      p_source: input.source || 'POS'
    } as any);

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
 * Modified to use Atomic WAC RPC (process_restock_v2)
 */
export async function processPurchase(input: CreatePurchaseInput) {
  try {
    const user = await getCurrentUser();

    // Prepare items for JSONB parameter
    const itemsPayload = input.articulos.map(item => ({
      product_id: item.id_producto,
      quantity: item.cantidad,
      cost_unit: item.costo_unitario
    }));

    // Calculate total amount (Real money out)
    const rawTotal = input.articulos.reduce(
      (sum, item) => sum + (item.cantidad * item.costo_unitario),
      0
    );

    // Handle Free Entry Logic for Financial Transaction
    // If free, p_amount = 0 (No Expense Created), but Items carry their 'cost_unit' for WAC
    const finalAmount = input.es_ingreso_gratuito ? 0 : safeAmount(rawTotal);

    // Call Atomic RPC
    const { data: rpcData, error: transactionError } = await (supabase.rpc as any)('process_purchase_transaction', {
      p_items: itemsPayload,
      p_account_id: input.id_cuenta || null,
      p_user_id: user.id === 'Usuario' ? null : user.id,
      p_provider_info: input.nombre_proveedor || '',
      p_notes: input.notas || (input.es_ingreso_gratuito ? 'Ingreso Gratuito' : undefined)
    });

    if (transactionError) throw transactionError;

    return {
      success: true,
      data: rpcData,
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

    const { data, error } = await supabase.rpc('process_generic_transaction', {
      p_type: 'EXPENSE',
      p_amount: Math.abs(input.monto),
      p_description: input.descripcion,
      p_account_id: input.id_cuenta,
      p_payment_method: PAYMENT_METHOD_MAP_REVERSE[input.metodo_pago],
      p_reference_number: input.numero_referencia,
      p_notes: input.notas,
      p_user_id: user.id,
      p_category_id: input.id_categoria
    } as any);

    if (error) throw error;
    const transaction = { id: (data as any).transaction_id };

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

    // 1. Create Main Income Transaction (Sale Value) via RPC
    const { data, error } = await supabase.rpc('process_generic_transaction', {
      p_type: 'INCOME',
      p_amount: Math.abs(input.monto),
      p_description: input.descripcion,
      p_account_id: input.id_cuenta,
      p_payment_method: PAYMENT_METHOD_MAP_REVERSE[input.metodo_pago],
      p_reference_number: input.numero_referencia,
      p_notes: input.notas,
      p_user_id: user.id,
      p_category_id: input.id_categoria
    } as any);

    if (error) throw error;
    const transaction = { id: (data as any).transaction_id };


    // 2. Optional: Create Cost Expense (if provided)
    if (input.costo_repuesto && input.costo_repuesto > 0 && input.id_cuenta_costo) {
      await createExpense({
        descripcion: `Costo Repuesto: ${input.descripcion}`,
        monto: Math.abs(input.costo_repuesto),
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
        monto: Math.abs(input.costo_envio),
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
 * NOW: Soft Reversal
 */
export async function deleteCommission(transactionId: string) {
  try {
    const user = await getCurrentUser();

    // 1. Find the main transaction to get reference number (REL- or ENV-)
    const { data: mainTx, error: fetchError } = await supabase
      .from('transactions')
      .select('reference_number, id')
      .eq('id', transactionId)
      .single();

    if (fetchError) throw fetchError;
    if (!mainTx) throw new Error('Transaction not found');

    // 2. Find associated cost expenses
    const { data: associatedTxs, error: assocError } = await supabase
      .from('transactions')
      .select('id')
      .or(`reference_number.eq.REL-${(mainTx as any).id},reference_number.eq.ENV-${(mainTx as any).id}`);

    if (assocError) throw assocError;

    // 3. Revert associated expenses
    for (const tx of (associatedTxs as any[]) || []) {
      await supabase.rpc('rpc_reverse_transaction', {
        p_transaction_id: tx.id,
        p_user_id: user.id,
        p_reason: 'Reversión automática (Comisión eliminada)'
      } as any);
    }

    // 4. Revert main transaction
    const { error: revertError } = await supabase.rpc('rpc_reverse_transaction', {
      p_transaction_id: transactionId,
      p_user_id: user.id,
      p_reason: 'Reversión manual de comisión'
    } as any);

    if (revertError) throw revertError;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting/reverting commission:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete commission',
    };
  }
}

/**
 * Revert a Sale
 * 
 * BPMN Reference: Financial_Management_Process.bpmn
 * Flow: Reversal Flow (With Correlation)
 * 
 * Implements:
 * - Activity_ReverseTransactionRPC: Validate & create mirror group
 * - Activity_RestoreInventory: Restore stock via IN movements
 * - Activity_UpdateSaleHeader: Set status to REVERSED
 * 
 * Finds all transactions linked to the sale and reverses them.
 * The RPC handles inventory and sale status.
 */
export async function deleteSale(saleId: string) {
  try {
    const user = await getCurrentUser();

    // 1. Get Sale to find sale_number
    const { data: sale, error: saleFetchError } = await supabase
      .from('sales')
      .select('sale_number')
      .eq('id', saleId)
      .single();

    if (saleFetchError) throw saleFetchError;
    const saleData = sale as any;

    if (!saleData?.sale_number) {
      throw new Error("Sale number not found");
    }

    // 2. Find all transactions linked to this sale (Income + Shipping)
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id')
      .eq('reference_number', saleData.sale_number);

    if (txError) throw txError;

    // 3. Revert EACH transaction (Note: the SQL RPC now handles groups, 
    // but the frontend passes a specific ID. Calling it once reverses the whole group).
    // To be safe and avoid "Already Reversed" errors in loops, we only call it for the first ID.
    if (transactions && transactions.length > 0) {
      const firstTx = (transactions as any[])[0];
      const { error: rpcError } = await supabase.rpc('rpc_reverse_transaction', {
        p_transaction_id: firstTx.id,
        p_user_id: user.id,
        p_reason: 'Anulación de Venta #' + (saleData?.sale_number || '')
      } as any);

      if (rpcError) {
        // Handle the case where it might already be reversed
        if (!(rpcError as any).message?.includes('already reversed')) {
          throw rpcError;
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error reverting sale:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Revert a Purchase
 */
export async function deletePurchase(transactionId: string) {
  try {
    const user = await getCurrentUser();

    // Call RPC to revert
    const { error } = await supabase.rpc('rpc_reverse_transaction', {
      p_transaction_id: transactionId,
      p_user_id: user.id,
      p_reason: 'Reversión manual de compra'
    } as any);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Error reverting purchase:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Revert a generic Expense
 */
export async function deleteExpense(transactionId: string) {
  try {
    const user = await getCurrentUser();

    const { error } = await supabase.rpc('rpc_reverse_transaction', {
      p_transaction_id: transactionId,
      p_user_id: user.id,
      p_reason: 'Reversión manual de gasto'
    } as any);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error reverting expense:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Creates a transfer between two accounts
 * 
 * BPMN Reference: Financial_Management_Process.bpmn
 * Flow: Transfer Flow (Full Saga Pattern)
 * 
 * Implements:
 * - Activity_TransferSourceDebit: Debit Source Account
 * - Activity_TransferDestCredit: Credit Destination Account
 * 
 * Compensation: Handled at database transaction level (atomic)
 * Manual Intervention: N/A (PostgreSQL ensures consistency)
 */
export async function crearTransferencia(input: EntradaCrearTransferencia) {
  try {
    const user = await getCurrentUser();

    // Call the RPC function we created in SQL
    const { data, error } = await supabase
      .rpc('transfer_funds', {
        p_source_account_id: input.id_cuenta_origen,
        p_destination_account_id: input.id_cuenta_destino,
        p_amount: Math.abs(input.monto),
        p_description: input.descripcion,
        p_user_id: user.id === 'Usuario' ? null : user.id
      } as any);

    if (error) throw error;

    return { success: true, data };
  } catch (error) {
    console.error('Error creating transfer:', error);
    return { success: false, error };
  }
}

export interface UpdateTransactionDetailsInput {
  transactionId: string;
  description?: string;
  notes?: string;
  reference_number?: string;
}

export async function updateTransactionDetails(input: UpdateTransactionDetailsInput) {
  try {
    const updates: any = {};
    if (input.description !== undefined) updates.description = input.description;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.reference_number !== undefined) updates.reference_number = input.reference_number;

    if (Object.keys(updates).length === 0) return { success: true };

    const { error } = await supabase
      .from('transactions')
      .update(updates as never)
      .eq('id', input.transactionId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error updating transaction:', error);
    return { success: false, error: error.message };
  }
}

export interface UpdateSaleDetailsInput {
  saleId: string;
  customer_name?: string;
  customer_document?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_city?: string;
  customer_address?: string;
}

export async function updateSaleDetails(input: UpdateSaleDetailsInput) {
  try {
    const updates: any = {};
    if (input.customer_name !== undefined) updates.customer_name = input.customer_name;
    if (input.customer_document !== undefined) updates.customer_document = input.customer_document;
    if (input.customer_phone !== undefined) updates.customer_phone = input.customer_phone;
    if (input.customer_email !== undefined) updates.customer_email = input.customer_email;
    if (input.customer_city !== undefined) updates.customer_city = input.customer_city;
    if (input.customer_address !== undefined) updates.customer_address = input.customer_address;

    if (Object.keys(updates).length === 0) return { success: true };

    const { error } = await supabase
      .from('sales')
      .update(updates as never)
      .eq('id', input.saleId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error updating sale:', error);
    return { success: false, error: error.message };
  }
}
export async function reserveStock(productId: string, quantity: number, sessionId?: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('reserve_stock', {
      p_product_id: productId,
      p_quantity: quantity,
      p_session_id: sessionId
    } as any);

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error reserving stock:', error);
    return { success: false, error: error.message };
  }
}

export async function releaseReservation(reservationId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('release_reservation', {
      p_reservation_id: reservationId
    } as any);

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error releasing reservation:', error);
    return { success: false, error: error.message };
  }
}

export interface CreateProductInput {
  sku: string;
  name: string;
  category?: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;

  target_margin?: number | null;
  image_url?: string;
  description?: string;
  brand?: string;
}

export async function createProduct(input: CreateProductInput) {
  try {
    const user = await getCurrentUser();

    const { data, error } = await supabase.rpc('create_product_v2', {
      p_sku: input.sku,
      p_name: input.name,
      p_category: input.category || 'General',
      p_cost_price: input.cost_price,
      p_selling_price: input.selling_price,
      p_current_stock: input.current_stock,

      p_target_margin: input.target_margin,
      p_user_id: user.id || undefined,
      p_image_url: input.image_url,
      p_description: input.description,
      p_brand: input.brand
    } as any);

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error creating product:', error);
    return { success: false, error: error.message };
  }
}

export async function getDailyGrossProfit(startDate: string, endDate: string) {
  try {
    const { data, error } = await (supabase.rpc as any)('get_daily_gross_profit', {
      p_start_date: startDate,
      p_end_date: endDate
    });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error fetching gross profit:', error);
    return { success: false, error: error.message };
  }
}
