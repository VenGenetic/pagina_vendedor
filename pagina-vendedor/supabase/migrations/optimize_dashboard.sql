-- Vista optimizada para el Dashboard
-- Esta vista calcula todos los totales en la base de datos para que la carga sea instantánea
CREATE OR REPLACE VIEW dashboard_summary AS
WITH 
  account_totals AS (
    SELECT COALESCE(SUM(balance), 0) as total_balance FROM accounts WHERE is_active = true
  ),
  inventory_totals AS (
    SELECT 
      COALESCE(SUM(current_stock * selling_price), 0) as total_inventory_value,
      COALESCE(SUM(current_stock * cost_price), 0) as total_inventory_cost,
      COUNT(*) FILTER (WHERE current_stock <= min_stock_level) as low_stock_count,
      COUNT(*) as total_products
    FROM products 
    WHERE is_active = true
  ),
  today_transactions AS (
    SELECT 
      COALESCE(SUM(amount) FILTER (WHERE type = 'INCOME'), 0) as today_sales,
      COALESCE(SUM(amount) FILTER (WHERE type = 'EXPENSE'), 0) as today_expenses
    FROM transactions 
    -- Comparamos con el inicio del día local (ajustar zona horaria si es necesario, aquí usa UTC por defecto)
    WHERE transaction_date >= CURRENT_DATE::timestamp
  )
SELECT 
  a.total_balance,
  i.total_inventory_value,
  i.total_inventory_cost,
  i.low_stock_count,
  i.total_products,
  t.today_sales,
  t.today_expenses
FROM account_totals a, inventory_totals i, today_transactions t;

-- Permisos
GRANT SELECT ON dashboard_summary TO authenticated;
GRANT SELECT ON dashboard_summary TO service_role;
