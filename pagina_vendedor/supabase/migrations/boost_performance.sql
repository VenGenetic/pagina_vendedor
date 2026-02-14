-- Habilitar extensión para búsquedas de texto eficientes (TRIGRAM)
-- Esto permite búsquedas LIKE '%texto%' mucho más rápidas
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==========================================
-- OPTIMIZACIÓN DE PRODUCTOS
-- ==========================================

-- Indices GIN para búsqueda rápida de productos por nombre y SKU (soporta ILIKE %...%)
DROP INDEX IF EXISTS idx_products_name_trgm;
DROP INDEX IF EXISTS idx_products_sku_trgm;

CREATE INDEX idx_products_search_name ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_search_sku ON products USING gin(sku gin_trgm_ops);

-- ==========================================
-- OPTIMIZACIÓN DE TRANSACCIONES / DASHBOARD
-- ==========================================

-- Indice simple por fecha para ordenamientos y rangos (Dashboard, Recent Activity)
CREATE INDEX IF NOT EXISTS idx_transactions_date_only ON transactions(transaction_date DESC);

-- Indice para filtrar por cuenta (para conciliaciones futuras o filtros)
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);

-- Indice para búsquedas de transacciones (si se implementa)
CREATE INDEX IF NOT EXISTS idx_transactions_description_trgm ON transactions USING gin(description gin_trgm_ops);

-- ==========================================
-- REFRESCAR ESTADÍSTICAS
-- ==========================================
ANALYZE products;
ANALYZE transactions;
ANALYZE accounts;
