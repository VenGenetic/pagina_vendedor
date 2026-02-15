-- ============================================
-- RPC: get_daily_gross_profit
-- Returns a table of daily gross profit within a date range
-- Logic: Sumo(subtotal) - Sumo(cantidad * costo_unitario)
-- ============================================

CREATE OR REPLACE FUNCTION get_daily_gross_profit(p_start_date date, p_end_date date)
RETURNS TABLE (
  date date,
  gross_profit numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_series AS (
    SELECT generate_series(p_start_date::timestamp, p_end_date::timestamp, '1 day')::date AS day
  ),
  daily_profit AS (
    SELECT 
      s.sale_date::date AS day,
      SUM(si.subtotal) - SUM(si.quantity * p.cost_price) as profit
    FROM sales s
    JOIN sale_items si ON s.id = si.sale_id
    JOIN products p ON si.product_id = p.id
    WHERE s.sale_date::date >= p_start_date AND s.sale_date::date <= p_end_date
      AND s.payment_status NOT IN ('CANCELLED', 'REVERSED')
    GROUP BY s.sale_date::date
  )
  SELECT 
    ds.day as date,
    COALESCE(dp.profit, 0)::numeric as gross_profit
  FROM daily_series ds
  LEFT JOIN daily_profit dp ON ds.day = dp.day
  ORDER BY ds.day ASC;
END;
$$ LANGUAGE plpgsql;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS get_daily_gross_profit(date, date);
