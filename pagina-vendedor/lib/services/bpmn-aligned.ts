/**
 * BPMN Alignment Services
 * 
 * This module contains service functions that align with the BPMN diagrams:
 * - Sales_Process.bpmn (Reservation, Drop Ship, Returns)
 * - Restock_Process.bpmn (Demand Study)
 * - Financial_Management_Process.bpmn (Alerts)
 */

import { supabase } from '@/lib/supabase/client';

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

// ============================================================================
// BPMN ALIGNMENT: Stock Reservation Pattern
// Reference: Sales_Process.bpmn - Activity_ReserveStock
// ============================================================================

export interface ReservationItem {
    productId: string;
    quantity: number;
}

export interface ReservationResult {
    success: boolean;
    reservationId?: string;
    expiresAt?: string;
    error?: string;
    available?: number;
}

/**
 * Reserve stock for a pending sale
 * BPMN: Activity_ReserveStock
 */
export async function reserveStock(
    productId: string,
    quantity: number,
    sessionId?: string
): Promise<ReservationResult> {
    try {
        const { data, error } = await supabase.rpc('reserve_stock', {
            p_product_id: productId,
            p_quantity: quantity,
            p_session_id: sessionId || null,
            p_expiry_minutes: 15
        } as any);

        if (error) throw error;

        const result = data as any;
        return {
            success: result.success,
            reservationId: result.reservation_id,
            expiresAt: result.expires_at,
            error: result.error,
            available: result.available
        };
    } catch (error: any) {
        console.error('Error reserving stock:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Reserve multiple items at once
 */
export async function reserveMultipleStock(
    items: ReservationItem[],
    sessionId?: string
): Promise<{ success: boolean; reservations: Map<string, string>; errors: string[] }> {
    const reservations = new Map<string, string>();
    const errors: string[] = [];

    for (const item of items) {
        const result = await reserveStock(item.productId, item.quantity, sessionId);
        if (result.success && result.reservationId) {
            reservations.set(item.productId, result.reservationId);
        } else {
            errors.push(`${item.productId}: ${result.error}`);
            // Rollback previous reservations
            for (const [, resId] of reservations) {
                await releaseReservation(resId);
            }
            return { success: false, reservations: new Map(), errors };
        }
    }

    return { success: true, reservations, errors: [] };
}

/**
 * Release a stock reservation
 * BPMN: Activity_ReleaseReservation
 */
export async function releaseReservation(reservationId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { data, error } = await supabase.rpc('release_reservation', {
            p_reservation_id: reservationId
        } as any);

        if (error) throw error;
        return { success: (data as any).success, error: (data as any).error };
    } catch (error: any) {
        console.error('Error releasing reservation:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// BPMN ALIGNMENT: Drop Shipping
// Reference: Sales_Process.bpmn - SubProcess_DropShipping
// ============================================================================

export interface DropShipInput {
    saleId?: string;
    productId: string;
    quantity: number;
    customerPrice: number;
    providerCost: number;
    providerName?: string;
    accountId: string;
    expenseAccountId?: string;
}

/**
 * Check if provider has stock available
 * BPMN: Activity_CheckProviderStock
 */
export async function checkProviderAvailability(productId: string): Promise<{ available: boolean; message?: string }> {
    try {
        const { data, error } = await supabase.rpc('check_provider_availability', {
            p_product_id: productId
        } as any);

        if (error) throw error;
        return { available: (data as any).available, message: (data as any).message };
    } catch (error: any) {
        console.error('Error checking provider:', error);
        return { available: false, message: error.message };
    }
}

/**
 * Create a drop ship order with dual financial entry
 * BPMN: Activity_CreateDropShipOrder + Activity_CreateDualFinancials
 */
export async function createDropShipOrder(input: DropShipInput): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
        const user = await getCurrentUser();

        const { data, error } = await supabase.rpc('create_dropship_order', {
            p_sale_id: input.saleId || null,
            p_product_id: input.productId,
            p_quantity: input.quantity,
            p_customer_price: input.customerPrice,
            p_provider_cost: input.providerCost,
            p_provider_name: input.providerName || null,
            p_account_id: input.accountId,
            p_expense_account_id: input.expenseAccountId || null,
            p_user_id: user.id
        } as any);

        if (error) throw error;

        const result = data as any;
        return {
            success: result.success,
            orderId: result.order_id,
            error: result.error
        };
    } catch (error: any) {
        console.error('Error creating dropship order:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all drop ship orders
 */
export async function getDropShipOrders(status?: string) {
    try {
        let query = supabase
            .from('dropship_orders')
            .select(`
        *,
        product:products(id, name, sku),
        sale:sales(id, sale_number, customer_name)
      `)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error('Error fetching dropship orders:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update drop ship order status
 */
export async function updateDropShipStatus(
    orderId: string,
    status: 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
    trackingNumber?: string
) {
    try {
        const updates: any = { status, updated_at: new Date().toISOString() };

        if (status === 'SHIPPED' && trackingNumber) {
            updates.tracking_number = trackingNumber;
            updates.shipped_at = new Date().toISOString();
        }
        if (status === 'DELIVERED') {
            updates.delivered_at = new Date().toISOString();
        }

        const { error } = await supabase
            .from('dropship_orders')
            .update(updates as never)
            .eq('id', orderId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error('Error updating dropship status:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// BPMN ALIGNMENT: Partial Returns
// Reference: Sales_Process.bpmn - Return Flow
// ============================================================================

export interface ReturnItem {
    saleItemId: string;
    quantityToReturn: number;
}

/**
 * Process a partial return (return specific items from a sale)
 * BPMN: Activity_CreateRefund + Activity_RestoreStock
 */
export async function processPartialReturn(
    saleId: string,
    items: ReturnItem[],
    reason?: string
): Promise<{ success: boolean; refundAmount?: number; error?: string }> {
    try {
        const user = await getCurrentUser();

        const itemsPayload = items.map(item => ({
            sale_item_id: item.saleItemId,
            quantity_to_return: item.quantityToReturn
        }));

        const { data, error } = await supabase.rpc('process_partial_return', {
            p_sale_id: saleId,
            p_items: itemsPayload,
            p_user_id: user.id,
            p_reason: reason || 'Devolución solicitada'
        } as any);

        if (error) throw error;

        const result = data as any;
        return {
            success: result.success,
            refundAmount: result.refund_amount,
            error: result.error
        };
    } catch (error: any) {
        console.error('Error processing return:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get sale items for return selection
 */
export async function getSaleItemsForReturn(saleId: string) {
    try {
        const { data, error } = await supabase
            .from('sale_items')
            .select(`
        id,
        quantity,
        unit_price,
        subtotal,
        product:products(id, name, sku)
      `)
            .eq('sale_id', saleId);

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error('Error fetching sale items:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// BPMN ALIGNMENT: Demand Study
// Reference: Restock_Process.bpmn - Activity_QueryDemandStudy
// ============================================================================

export interface DemandStudyResult {
    productId: string;
    productName: string;
    currentStock: number;
    currentCost: number;
    suggestedQuantity: number;
    demandScore: number;
    previousCost: number;
    priceDropDetected: boolean;
}

/**
 * Query demand study for smart restock suggestions
 * BPMN: Activity_QueryDemandStudy
 */
export async function queryDemandStudy(
    productIds: string[],
    lookbackDays: number = 30
): Promise<{ success: boolean; data?: DemandStudyResult[]; error?: string }> {
    try {
        const { data, error } = await supabase.rpc('query_demand_study', {
            p_product_ids: productIds,
            p_lookback_days: lookbackDays
        } as any);

        if (error) throw error;

        const results = (data as any[] || []).map(row => ({
            productId: row.product_id,
            productName: row.product_name,
            currentStock: row.current_stock,
            currentCost: Number(row.current_cost),
            suggestedQuantity: row.suggested_quantity,
            demandScore: row.demand_score,
            previousCost: Number(row.previous_cost),
            priceDropDetected: row.price_drop_detected
        }));

        return { success: true, data: results };
    } catch (error: any) {
        console.error('Error querying demand study:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Log a demand hit manually
 */
export async function logDemandHit(
    productId: string,
    hitType: 'SALE' | 'STOCK_OUT' | 'SEARCH' | 'DROPSHIP',
    quantity: number = 1,
    source: string = 'MANUAL'
) {
    try {
        const { data, error } = await supabase.rpc('log_demand_hit', {
            p_product_id: productId,
            p_hit_type: hitType,
            p_quantity: quantity,
            p_source: source
        } as any);

        if (error) throw error;
        return { success: true, hitId: data };
    } catch (error: any) {
        console.error('Error logging demand hit:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// BPMN ALIGNMENT: Admin Alerts
// Reference: Financial_Management_Process.bpmn - Activity_ManualIntervention
// ============================================================================

export interface AdminAlert {
    id: string;
    alertType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description?: string;
    status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'IGNORED';
    createdAt: string;
}

/**
 * Get all admin alerts
 */
export async function getAdminAlerts(status?: string): Promise<{ success: boolean; data?: AdminAlert[]; error?: string }> {
    try {
        let query = supabase
            .from('admin_alerts')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) throw error;

        const alerts = (data || []).map((row: any) => ({
            id: row.id,
            alertType: row.alert_type,
            severity: row.severity,
            title: row.title,
            description: row.description,
            status: row.status,
            createdAt: row.created_at
        }));

        return { success: true, data: alerts };
    } catch (error: any) {
        console.error('Error fetching admin alerts:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Acknowledge an admin alert
 */
export async function acknowledgeAlert(alertId: string) {
    try {
        const user = await getCurrentUser();

        const { error } = await supabase
            .from('admin_alerts')
            .update({
                status: 'ACKNOWLEDGED',
                acknowledged_at: new Date().toISOString(),
                acknowledged_by: user.id
            } as never)
            .eq('id', alertId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error('Error acknowledging alert:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Resolve an admin alert
 */
export async function resolveAlert(alertId: string, notes?: string) {
    try {
        const user = await getCurrentUser();

        const { error } = await supabase
            .from('admin_alerts')
            .update({
                status: 'RESOLVED',
                resolved_at: new Date().toISOString(),
                resolved_by: user.id,
                resolution_notes: notes || null
            } as never)
            .eq('id', alertId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error('Error resolving alert:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// BPMN ALIGNMENT: Delivery Proof Upload
// Reference: Sales_Process.bpmn - Activity_UploadDeliveryProof
// ============================================================================

/**
 * Upload delivery proof image
 * BPMN: Activity_UploadDeliveryProof
 */
export async function uploadDeliveryProof(
    saleId: string,
    file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
        const fileName = `delivery-proofs/${saleId}-${Date.now()}.${file.name.split('.').pop()}`;

        const { error: uploadError } = await supabase.storage
            .from('sales-attachments')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('sales-attachments')
            .getPublicUrl(fileName);

        const publicUrl = urlData.publicUrl;

        // Update sale with proof URL
        const { error: updateError } = await supabase
            .from('sales')
            .update({ delivery_proof_url: publicUrl } as never)
            .eq('id', saleId);

        if (updateError) throw updateError;

        return { success: true, url: publicUrl };
    } catch (error: any) {
        console.error('Error uploading delivery proof:', error);
        return { success: false, error: error.message };
    }
}
