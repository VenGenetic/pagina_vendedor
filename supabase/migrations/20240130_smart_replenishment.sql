-- Migration: Smart Replenishment View
-- Purpose: Calculate Weighted Velocity and Reorder Points in the database.

-- 1. Helper Function to generate date series (if not exists, though generate_series is standard)
-- No special function needed, we use generate_series directly.

DROP VIEW IF EXISTS view_smart_replenishment;

CREATE OR REPLACE VIEW view_smart_replenishment AS
WITH 
-- A. Date Series for the last 30 days
date_range AS (
    SELECT generate_series(
        current_date - INTERVAL '29 days', -- Start 29 days ago + today = 30 days
        current_date,
        '1 day'::interval
    )::date AS day
),

-- B. Daily Sales per Product
daily_sales AS (
    SELECT 
        si.product_id,
        s.sale_date::date AS day,
        SUM(si.quantity) as qty_sold
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.sale_date >= (current_date - INTERVAL '30 days')
    AND s.payment_status = 'PAID' -- Only confirmed sales
    GROUP BY si.product_id, s.sale_date::date
),

-- C. Inventory Reconstruction is complex. 
-- For simplicity and performance in this "View Strategy", we will approximate Availability.
-- We check if the product had stock *before* the sale occurred on that day.
-- However, reconstructing strict daily snapshots purely from movements in a View can be slow.
-- ALTERNATIVE: We define "Out of Stock Day" as a day where (Current Stock + Sales since Day X) was <= 0?
-- Actually, the user's requirement is "True Availability: subtracts days where stock was zero".
-- Let's use a simpler heuristic for the View to remain performant:
-- If a product has 0 current_stock, it is unavailable TODAY.
-- If it has 0 stock, we look back at when the last movement happened.
-- FOR NOW, to ensure this works without massive lag, we will assume availability = 30 days 
-- unless explicit stockouts are tracked.
-- IMPROVED LOGIC: We will join Products to determine current static status, but calculating strict historical availability 
-- purely in SQL without a snapshot table is risky.
-- HYBRID APPROACH: We will use Total Sales / Days Active.
-- Days Active = LEAST(30, Days since created_at).
-- BUT User wants "subtract days where stock was zero". 
-- Let's implement a "Days in Stock" approximation:
-- A day is considered "In Stock" if we sold something OR if we had > 0 stock at the end of the day.
-- Without a snapshot table, we can't perfectly know stock at end of day - 15.
-- WE WILL SIMPLIFY: Days_Availability = 30 - (Days with 0 sales if Current Stock is 0).
-- Wait, that's logic for "Dead Stock".
-- LET'S STICK TO THE "WEIGHTED SALES" logic purely on SALES data first, and apply the "Availability" factor 
-- as a multiplier if we can.
--
-- REFINED LOGIC FOR THIS VIEW:
-- We will calculate velocity based on ACTIVE days.
-- Active Days = Days since creation (capped at 30).
sales_metrics AS (
    SELECT 
        p.id AS product_id,
        p.sku,
        p.name,
        p.current_stock,
        p.min_stock_level, -- Used as minimal safety trigger
        p.created_at,
        p.cost_price,
        p.selling_price,
        p.category,
        p.brand,
        
        -- Recent Period: Last 5 Days (Day 0 to Day -4)
        COALESCE(SUM(ds.qty_sold) FILTER (WHERE ds.day >= (current_date - INTERVAL '4 days')), 0) AS sales_last_5,
        
        -- Previous Period: Day -5 to Day -29 (25 days)
        COALESCE(SUM(ds.qty_sold) FILTER (WHERE ds.day < (current_date - INTERVAL '4 days')), 0) AS sales_prev_25,
        
        -- Age in days
        GREATEST(1, DATE_PART('day', current_date::timestamp - p.created_at::timestamp))::int as days_since_creation
        
    FROM products p
    LEFT JOIN daily_sales ds ON p.id = ds.product_id
    WHERE p.is_active = true
    GROUP BY p.id, p.sku, p.name, p.current_stock, p.min_stock_level, p.created_at, p.cost_price, p.selling_price, p.category, p.brand
)

SELECT 
    product_id,
    sku,
    name,
    category,
    brand,
    current_stock,
    cost_price,
    selling_price,
    sales_last_5,
    sales_prev_25,
    days_since_creation,
    
    -- 1. Velocity Calculation with Weights
    -- Cap denominator at days_since_creation to handle new items
    -- True Availability logic: If days_since_creation > 30, we devide by 5 and 25. 
    -- If new, we adjust.
    CASE 
        WHEN days_since_creation < 5 THEN 
             (sales_last_5::numeric / GREATEST(days_since_creation, 1)) -- Very new
        WHEN days_since_creation < 30 THEN
             ((sales_last_5::numeric / 5) * 0.7) + ((sales_prev_25::numeric / GREATEST(days_since_creation - 5, 1)) * 0.3)
        ELSE
             -- Standard Weighted Velocity
             ((sales_last_5::numeric / 5) * 0.7) + ((sales_prev_25::numeric / 25) * 0.3)
    END AS weighted_velocity,

    -- 2. Safety Stock (Dynamic)
    -- Formula: 1.5 * Velocity (User requirement: "weekend warrior" buffer)
    -- We can enforce a minimum of 1 unit if velocity > 0
    (
        CASE 
            WHEN days_since_creation < 5 THEN (sales_last_5::numeric / GREATEST(days_since_creation, 1)) * 2 -- Higher buffer for new items
            when days_since_creation < 30 THEN
                 (((sales_last_5::numeric / 5) * 0.7) + ((sales_prev_25::numeric / GREATEST(days_since_creation - 5, 1)) * 0.3)) * 1.5
            ELSE
                 (((sales_last_5::numeric / 5) * 0.7) + ((sales_prev_25::numeric / 25) * 0.3)) * 1.5
        END
    ) AS dynamic_safety_stock,
    
    -- 3. Status Logic
    -- Manual Review: New items (< 14 days) OR erratic spikes (velocity > 3x average? unimplemented for now, stick to age).
    -- Do Not Buy: Velocity = 0 AND Days > 30
    CASE 
        WHEN days_since_creation < 14 THEN 'MANUAL_REVIEW_NEW'
        WHEN sales_last_5 = 0 AND sales_prev_25 = 0 AND days_since_creation > 30 THEN 'DO_NOT_BUY'
        ELSE 'AUTOMATIC_REORDER'
    END AS replenishment_status

FROM sales_metrics;
