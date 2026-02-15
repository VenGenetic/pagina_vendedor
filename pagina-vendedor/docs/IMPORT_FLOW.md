# Product Import Flow (Ledger-First)

## Overview
The product import process has been refactored to ensure strict adherence to the "Ledger-First" architecture. This means that **stock levels are never set directly on the product record**. instead, all stock changes are recorded as `inventory_movements`.

## How It Works

### 1. File Parsing (CSV & XLSX)
- The system accepts files with headers: `SKU`, `Nombre`, `Costo`, `Precio`, `Stock` (or `Cantidad`/`Existencia`).
- **Formats Supported:** `.csv`, `.xlsx`, `.xls`
- Currency values are cleaned (removing `$`, handling `,` vs `.`).
- Stock is parsed into a temporary `initial_stock` field.

### 2. Staging Area
- Users can review the data in the grid.
- `initial_stock` is editable before commit.
- Prices are compared against existing database values (if SKU exists).

### 3. Commit Process (Ledger-First)
For each item in the staging area:
1.  **Product Upsert**: The product details (Name, Category, Prices, etc.) are upserted into the `products` table. Use strict `upsert` on `sku`.
    -   *Crucial*: `current_stock` is explicitely EXCLUDED from this operation to prevent overwriting the calculated stock.
2.  **Stock Movement**: If `initial_stock > 0`, a new record is inserted into `inventory_movements`:
    -   `type`: 'IN'
    -   `reason`: 'COUNT_ADJUSTMENT' (or 'OTHER')
    -   `quantity_change`: `initial_stock`
    -   `unit_price`: `cost_price`
3.  **Result**: The database trigger (`trigger_update_product_stock`) fires on the movement insertion, automatically updating the `products.current_stock` value in a transactional and auditable way.

## Error Handling
- The import process runs item-by-item.
- If an item fails (e.g., negative price, database constraint), it is logged.
- A summary report is shown at the end with success/failure counts.
