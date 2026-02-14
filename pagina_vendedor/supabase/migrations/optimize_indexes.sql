-- Indices para optimizar búsqueda de productos
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING btree (name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON products USING btree (sku text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- Indices para optimizar dashboard (filtrado por fecha y tipo)
CREATE INDEX IF NOT EXISTS idx_transactions_dashboard ON transactions(type, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_dashboard ON sales(sale_date DESC);

-- Indices para claves foráneas que faltan (si las hay)
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON sales(created_by);

-- Vacuum analyze para actualizar estadísticas del planificador
ANALYZE products;
ANALYZE transactions;
ANALYZE sales;
ANALYZE inventory_movements;
