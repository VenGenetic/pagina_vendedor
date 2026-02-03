---
type: part
status: active
impact: high
tags: [inventory, logic, audit]
---

# Inventory Integrity Laws

## Description
The **Inventory Integrity Laws** define how stock levels are maintained and tracked. The system treats inventory as a ledger of "movements" rather than a simple counter.

## Governing Laws

### 1. The Law of the Ledger (Immutable Movements)
The `current_stock` of a product is a derived value, but it is cached in the `products` table for performance. However, the **Source of Truth** is the `inventory_movements` table.
- **Rule**: NEVER update `products.current_stock` directly via SQL `UPDATE` unless recalibrating.
- **Requirement**: Every change in stock MUST have a corresponding entry in `inventory_movements`.

### 2. The Law of Direct Attribution
Every stock change must have a reason and, where applicable, a financial link.
- **Reasons**: `SALE`, `PURCHASE`, `RETURN`, `DAMAGE`, `THEFT`, `COUNT_ADJUSTMENT`.
- **Linkage**: Sales and Purchases must link to a `transaction_id` to ensure physical stock matches financial reality.

### 3. The Law of Automated Synchronization
Stock levels are synchronized automatically across all tables.
- **Mechanism**: The `trigger_update_product_stock` fires after any `INSERT` into `inventory_movements`.
- **Logic**: `products.current_stock = products.current_stock + NEW.quantity_change`.

## Logic Loop: Stock Change
1. **Activity**: A user processes a sale or a restock.
2. **Action**: The system inserts a record into `inventory_movements`.
3. **Internal Trigger**: 
    - `update_product_stock()` is called.
    - `products.current_stock` is updated.
    - `products.updated_at` is refreshed.
4. **Visibility**: The UI reflects the new stock level immediately via Supabase Realtime or cache invalidation.

## Implementations in UI
- [[Inventory_Management_View]]: Handles restocks, stock adjustments, and product master data.

## Dependencies
- **Products**: Relies on the `products` table for master data.
- **WAC Governance**: Stock changes trigger cost recalculations (WAC) during restocks.
