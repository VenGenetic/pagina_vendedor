-- Smart Restock Function
-- Calculates intelligent restock suggestions based on real daily sales (only days with stock > 0)

CREATE OR REPLACE FUNCTION calculate_smart_restock(
  p_days_coverage INT DEFAULT 30,
  p_lookback_days INT DEFAULT 365
)
RETURNS TABLE (
  product_id UUID,
  sku VARCHAR,
  product_name VARCHAR,
  category VARCHAR,
  current_stock DECIMAL,
  min_stock_level DECIMAL,
  selling_price DECIMAL,
  cost_price DECIMAL,
  days_since_creation INT,
  total_sold DECIMAL,
  days_with_stock INT,
  avg_daily_sales DECIMAL,
  suggested_stock DECIMAL,
  quantity_to_order DECIMAL,
  estimated_cost DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH product_age AS (
    -- Calculate days since product creation
    SELECT 
      p.id,
      p.sku,
      p.name,
      p.category,
      p.current_stock,
      p.min_stock_level,
      p.selling_price,
      p.cost_price,
      p.created_at,
      EXTRACT(DAY FROM NOW() - p.created_at)::INT as days_alive
    FROM products p
    WHERE p.is_active = true
  ),
  sales_data AS (
    -- Get total sales in the lookback period
    SELECT 
      si.product_id,
      SUM(si.quantity) as total_quantity_sold
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.id
    WHERE s.created_at >= NOW() - (p_lookback_days || ' days')::INTERVAL
    GROUP BY si.product_id
  ),
  stock_days AS (
    -- Calculate days with stock > 0 using inventory movements
    -- This is an approximation: we count days between IN movements
    SELECT 
      im.product_id,
      COUNT(DISTINCT DATE(im.created_at)) as days_counted
    FROM inventory_movements im
    WHERE im.created_at >= NOW() - (p_lookback_days || ' days')::INTERVAL
      AND im.type = 'IN'
    GROUP BY im.product_id
  )
  SELECT 
    pa.id,
    pa.sku,
    pa.name,
    COALESCE(pa.category, 'Sin categoría'),
    pa.current_stock,
    pa.min_stock_level,
    pa.selling_price,
    pa.cost_price,
    pa.days_alive,
    COALESCE(sd.total_quantity_sold, 0),
    COALESCE(sd_calc.days_with_stock, GREATEST(pa.days_alive, 1)),
    CASE 
      -- New products (< 30 days): no daily average yet
      WHEN pa.days_alive < 30 THEN 0
      -- Products with sales: calculate real daily average
      WHEN COALESCE(sd.total_quantity_sold, 0) > 0 THEN 
        COALESCE(sd.total_quantity_sold, 0)::DECIMAL / 
        GREATEST(COALESCE(sd_calc.days_with_stock, pa.days_alive), 1)::DECIMAL
      ELSE 0
    END as avg_daily,
    CASE
      -- New products: suggest reaching min_stock_level
      WHEN pa.days_alive < 30 THEN pa.min_stock_level
      -- Established products: days_coverage × avg_daily_sales
      ELSE (p_days_coverage * 
        (COALESCE(sd.total_quantity_sold, 0)::DECIMAL / 
         GREATEST(COALESCE(sd_calc.days_with_stock, pa.days_alive), 1)::DECIMAL))
    END as suggested,
    GREATEST(
      CASE
        WHEN pa.days_alive < 30 THEN 
          GREATEST(pa.min_stock_level - pa.current_stock, 0)
        ELSE 
          GREATEST(
            (p_days_coverage * 
              (COALESCE(sd.total_quantity_sold, 0)::DECIMAL / 
               GREATEST(COALESCE(sd_calc.days_with_stock, pa.days_alive), 1)::DECIMAL)
            ) - pa.current_stock,
            0
          )
      END,
      0
    ) as qty_to_order,
    GREATEST(
      CASE
        WHEN pa.days_alive < 30 THEN 
          GREATEST(pa.min_stock_level - pa.current_stock, 0) * pa.cost_price
        ELSE 
          GREATEST(
            (p_days_coverage * 
              (COALESCE(sd.total_quantity_sold, 0)::DECIMAL / 
               GREATEST(COALESCE(sd_calc.days_with_stock, pa.days_alive), 1)::DECIMAL)
            ) - pa.current_stock,
            0
          ) * pa.cost_price
      END,
      0
    ) as est_cost
  FROM product_age pa
  LEFT JOIN sales_data sd ON pa.id = sd.product_id
  LEFT JOIN (
    -- Better approximation: assume stock was available for the lookback period if we had IN movements
    SELECT 
      product_id,
      LEAST(p_lookback_days, EXTRACT(DAY FROM NOW() - MIN(created_at))::INT) as days_with_stock
    FROM inventory_movements
    WHERE created_at >= NOW() - (p_lookback_days || ' days')::INTERVAL
    GROUP BY product_id
  ) sd_calc ON pa.id = sd_calc.product_id
  WHERE 
    -- Only return products that need restock
    GREATEST(
      CASE
        WHEN pa.days_alive < 30 THEN 
          GREATEST(pa.min_stock_level - pa.current_stock, 0)
        ELSE 
          GREATEST(
            (p_days_coverage * 
              (COALESCE(sd.total_quantity_sold, 0)::DECIMAL / 
               GREATEST(COALESCE(sd_calc.days_with_stock, pa.days_alive), 1)::DECIMAL)
            ) - pa.current_stock,
            0
          )
      END,
      0
    ) > 0
  ORDER BY 
    -- Prioritize: high daily sales first, then low stock
    (COALESCE(sd.total_quantity_sold, 0)::DECIMAL / 
     GREATEST(COALESCE(sd_calc.days_with_stock, pa.days_alive), 1)::DECIMAL) DESC,
    pa.current_stock ASC;
END;
$$ LANGUAGE plpgsql;

-- Grant access
GRANT EXECUTE ON FUNCTION calculate_smart_restock TO authenticated;
