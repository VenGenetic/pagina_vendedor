# 📊 Smart Replenishment Guide

This document defines the Business Intelligence logic for **Sales Velocity** and **Dynamic Reorder Points**.

---

## 🚀 Sales Velocity

**Definition:** The average number of units sold per day for a specific product.

### Formula
```
Sales Velocity = Units Sold (365 days) / 365
```

### SQL View: `v_sales_velocity`

```sql
CREATE OR REPLACE VIEW v_sales_velocity AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  p.sku,
  p.current_stock,
  COALESCE(SUM(
    CASE 
      WHEN im.movement_type = 'OUT' 
       AND im.reason = 'SALE'
       AND im.created_at >= NOW() - INTERVAL '365 days'
      THEN im.quantity 
      ELSE 0 
    END
  ), 0) AS units_sold_365d,
  
  ROUND(
    COALESCE(SUM(
      CASE 
        WHEN im.movement_type = 'OUT' 
         AND im.reason = 'SALE'
         AND im.created_at >= NOW() - INTERVAL '365 days'
        THEN im.quantity 
        ELSE 0 
      END
    ), 0)::NUMERIC / 365, 2
  ) AS sales_velocity_daily,
  
  -- Also calculate 30-day velocity for trending products
  ROUND(
    COALESCE(SUM(
      CASE 
        WHEN im.movement_type = 'OUT' 
         AND im.reason = 'SALE'
         AND im.created_at >= NOW() - INTERVAL '30 days'
        THEN im.quantity 
        ELSE 0 
      END
    ), 0)::NUMERIC / 30, 2
  ) AS sales_velocity_30d

FROM products p
LEFT JOIN inventory_movements im ON im.product_id = p.id
GROUP BY p.id, p.name, p.sku, p.current_stock;
```

### Usage in Frontend

```typescript
// Fetch sales velocity for dashboard
const { data, error } = await supabase
  .from('v_sales_velocity')
  .select('*')
  .order('sales_velocity_daily', { ascending: false })
  .limit(20);

// Display as "Fast Movers" widget
```

---

## 📈 Dynamic min_stock_level

**The old way:** Static `min_stock_level` = 5 (same for all products)

**The new way:** Dynamic reorder point based on:
1. **Sales Velocity:** How fast the product sells
2. **Lead Time:** How long it takes to receive new stock

### Formula
```
Dynamic Min Stock = Sales Velocity × Lead Time (days) × Safety Factor
```

### Components

| Component | Description | Typical Value |
|-----------|-------------|---------------|
| Sales Velocity | Units/day from `v_sales_velocity` | Varies |
| Lead Time | Days from order to receipt | 7-14 days |
| Safety Factor | Buffer for variability | 1.2-1.5 |

### SQL View: `v_smart_reorder_points`

```sql
CREATE OR REPLACE VIEW v_smart_reorder_points AS
SELECT
  sv.product_id,
  sv.product_name,
  sv.sku,
  sv.current_stock,
  sv.sales_velocity_daily,
  sv.sales_velocity_30d,
  
  -- Default lead time (can be overridden per product/supplier)
  COALESCE(p.lead_time_days, 10) AS lead_time_days,
  
  -- Safety factor (higher for variable demand)
  CASE
    WHEN sv.sales_velocity_30d > sv.sales_velocity_daily * 1.5 THEN 1.5  -- Trending UP
    WHEN sv.sales_velocity_30d < sv.sales_velocity_daily * 0.5 THEN 1.2  -- Trending DOWN
    ELSE 1.3  -- Stable
  END AS safety_factor,
  
  -- DYNAMIC MIN STOCK CALCULATION
  CEIL(
    sv.sales_velocity_daily 
    * COALESCE(p.lead_time_days, 10) 
    * CASE
        WHEN sv.sales_velocity_30d > sv.sales_velocity_daily * 1.5 THEN 1.5
        WHEN sv.sales_velocity_30d < sv.sales_velocity_daily * 0.5 THEN 1.2
        ELSE 1.3
      END
  ) AS dynamic_min_stock,
  
  -- DAYS OF STOCK REMAINING
  CASE 
    WHEN sv.sales_velocity_daily > 0 
    THEN ROUND(sv.current_stock / sv.sales_velocity_daily, 1)
    ELSE NULL
  END AS days_of_stock,
  
  -- REORDER URGENCY
  CASE
    WHEN sv.current_stock <= 0 THEN 'OUT_OF_STOCK'
    WHEN sv.current_stock < CEIL(sv.sales_velocity_daily * COALESCE(p.lead_time_days, 10)) THEN 'CRITICAL'
    WHEN sv.current_stock < CEIL(sv.sales_velocity_daily * COALESCE(p.lead_time_days, 10) * 1.5) THEN 'REORDER_NOW'
    ELSE 'OK'
  END AS reorder_status

FROM v_sales_velocity sv
JOIN products p ON p.id = sv.product_id;
```

---

## 🎯 Reorder Status Definitions

| Status | Meaning | Action |
|--------|---------|--------|
| `OUT_OF_STOCK` | Stock = 0 | 🔴 Emergency reorder |
| `CRITICAL` | Stock < (Velocity × Lead Time) | 🟠 Order immediately |
| `REORDER_NOW` | Stock < (Velocity × Lead Time × 1.5) | 🟡 Place order today |
| `OK` | Sufficient stock | 🟢 No action needed |

---

## 🛒 Economic Order Quantity (EOQ)

For products with consistent demand, calculate optimal order quantity:

### Formula
```
EOQ = √((2 × Annual Demand × Order Cost) / Holding Cost per Unit)
```

### SQL Function
```sql
CREATE OR REPLACE FUNCTION calculate_eoq(
  p_product_id UUID,
  p_order_cost DECIMAL DEFAULT 50.00,    -- Cost to place an order
  p_holding_rate DECIMAL DEFAULT 0.20    -- 20% of unit cost per year
) RETURNS INTEGER AS $$
DECLARE
  v_annual_demand INTEGER;
  v_unit_cost DECIMAL;
  v_eoq INTEGER;
BEGIN
  -- Get annual demand from velocity
  SELECT CEIL(sales_velocity_daily * 365)
  INTO v_annual_demand
  FROM v_sales_velocity
  WHERE product_id = p_product_id;
  
  -- Get unit cost
  SELECT cost_price INTO v_unit_cost
  FROM products WHERE id = p_product_id;
  
  -- Calculate EOQ
  IF v_annual_demand > 0 AND v_unit_cost > 0 THEN
    v_eoq := CEIL(SQRT(
      (2 * v_annual_demand * p_order_cost) / 
      (v_unit_cost * p_holding_rate)
    ));
  ELSE
    v_eoq := 10;  -- Default minimum order
  END IF;
  
  RETURN v_eoq;
END;
$$ LANGUAGE plpgsql;
```

---

## 📱 Dashboard Integration

### Low Stock Alert Widget
```typescript
// Fetch products needing reorder
const { data: alerts } = await supabase
  .from('v_smart_reorder_points')
  .select('*')
  .in('reorder_status', ['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NOW'])
  .order('reorder_status', { ascending: true });

// Display with color-coded urgency
```

### Example Output
| Product | Stock | Velocity | Days Left | Status |
|---------|-------|----------|-----------|--------|
| Brake Pads | 3 | 0.8/day | 3.7 days | 🔴 CRITICAL |
| Chain 520 | 5 | 0.3/day | 16.7 days | 🟡 REORDER_NOW |
| Oil Filter | 25 | 0.5/day | 50 days | 🟢 OK |

---

## 🔧 Adding Lead Time to Products

```sql
-- Add lead_time_days column if not exists
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 10;

-- Update based on supplier knowledge
UPDATE products 
SET lead_time_days = 14 
WHERE supplier_name = 'Overseas Supplier';

UPDATE products 
SET lead_time_days = 3 
WHERE supplier_name = 'Local Distributor';
```

---

## ✅ Implementation Checklist

- [ ] Create `v_sales_velocity` view
- [ ] Add `lead_time_days` column to `products`
- [ ] Create `v_smart_reorder_points` view
- [ ] Deploy Edge Function for `suggested_order` updates
- [ ] Configure Cron Job schedule (nightly)
- [ ] Update Dashboard to show dynamic reorder alerts
- [ ] Replace hardcoded `min_stock_level` checks with view queries

---

## ⚡ Edge Function Architecture (Offloaded Replenishment)

> [!IMPORTANT]
> **Performance Optimization:** Replenishment calculations are offloaded to an **Edge Function/Cron Job** to prevent taxing the primary database during user sessions.

### Why Offload?

| Problem | Solution |
|---------|----------|
| Complex JOINs on `v_smart_reorder_points` slow down user queries | Pre-compute and cache results |
| Real-time velocity calculation is expensive | Run nightly batch job |
| User sessions compete with analytics queries | Isolate workloads |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER SESSION (Real-time)                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Dashboard  │ ←→ │  products   │ ←→ │ suggested_  │     │
│  │  (Fast!)    │    │  (cached)   │    │ order_qty   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              ↑
                    (Pre-computed overnight)
                              ↑
┌─────────────────────────────────────────────────────────────┐
│              EDGE FUNCTION (Nightly Cron Job)              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ v_sales_    │ → │ v_smart_    │ → │ UPDATE      │     │
│  │ velocity    │    │ reorder_pts │    │ products    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Add `suggested_order_qty` Column

```sql
-- Add column to cache the pre-computed suggested order quantity
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS suggested_order_qty INTEGER DEFAULT 0;

-- Add last calculation timestamp
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS replenishment_calculated_at TIMESTAMPTZ;
```

### Edge Function: `update-replenishment`

```typescript
// supabase/functions/update-replenishment/index.ts
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 1. Fetch all products with their smart reorder points
  const { data: products, error } = await supabaseAdmin
    .from('v_smart_reorder_points')
    .select('product_id, current_stock, dynamic_min_stock, reorder_status');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // 2. Calculate suggested order quantities
  const updates = products
    .filter(p => ['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NOW'].includes(p.reorder_status))
    .map(p => ({
      id: p.product_id,
      suggested_order_qty: Math.max(0, p.dynamic_min_stock * 2 - p.current_stock),
      replenishment_calculated_at: new Date().toISOString()
    }));

  // 3. Batch update products table
  for (const update of updates) {
    await supabaseAdmin
      .from('products')
      .update({
        suggested_order_qty: update.suggested_order_qty,
        replenishment_calculated_at: update.replenishment_calculated_at
      })
      .eq('id', update.id);
  }

  // 4. Reset products that are now OK
  const okProducts = products
    .filter(p => p.reorder_status === 'OK')
    .map(p => p.product_id);

  if (okProducts.length > 0) {
    await supabaseAdmin
      .from('products')
      .update({ suggested_order_qty: 0 })
      .in('id', okProducts);
  }

  return new Response(
    JSON.stringify({ 
      updated: updates.length, 
      cleared: okProducts.length,
      timestamp: new Date().toISOString()
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

### Cron Job Configuration

```sql
-- Supabase pg_cron extension (run nightly at 3:00 AM)
SELECT cron.schedule(
  'nightly-replenishment-update',
  '0 3 * * *',  -- Every day at 3:00 AM
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/update-replenishment',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  );
  $$
);
```

### Dashboard Query (Fast!)

```typescript
// Now reads from cached column - no expensive JOINs!
const { data: alerts } = await supabase
  .from('products')
  .select('id, name, sku, current_stock, suggested_order_qty')
  .gt('suggested_order_qty', 0)
  .order('suggested_order_qty', { ascending: false });

// Display: "Necesitas ordenar X unidades de [Producto]"
```

---

## 🔄 Execution Schedule

| Job | Frequency | Purpose |
|-----|-----------|---------|
| `update-replenishment` | Daily @ 3:00 AM | Update `suggested_order_qty` |
| Manual trigger | On-demand | After large restocks |

> [!TIP]
> Add a manual "Recalcular Reabastecimiento" button in the admin panel that triggers the Edge Function for immediate updates after large inventory changes.

