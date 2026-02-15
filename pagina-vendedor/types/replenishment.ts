export interface SmartReplenishmentItem {
    product_id: string;
    sku: string;
    name: string;
    category: string | null;
    brand: string | null;
    current_stock: number;
    cost_price: number;
    selling_price: number;
    sales_last_5: number;
    sales_prev_25: number;
    days_since_creation: number;
    weighted_velocity: number;
    dynamic_safety_stock: number;
    replenishment_status: 'AUTOMATIC_REORDER' | 'MANUAL_REVIEW_NEW' | 'DO_NOT_BUY';
}

export interface ReplenishmentCalculation extends SmartReplenishmentItem {
    suggested_reorder_point: number;
    raw_need: number;
    final_buy_qty: number;
    uncapped_need: number;
    is_capped: boolean;
    status_label: 'CRITICAL' | 'REORDER' | 'OK' | 'OVERSTOCK';
}
