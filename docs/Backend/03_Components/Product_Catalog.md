---
type: component
status: active
impact: medium
tags: [inventory, data]
---

# Product Catalog

## Description
The **Product Catalog** is the database of all distinct items available for sale or purchase. It is the "Master Data" for the inventory system.

## Hierarchy
- **Parent**: [[Motorcycle_Parts_ERP]]
- **Children**: None

## Data Structure
- **Entity**: `products` table.
- **Key Fields**:
    - `sku` (Unique ID)
    - `name`
    - `cost_price` (Decimal 12,2)
    - `selling_price` (Decimal 12,2)
    - `current_stock` (Integer, default 0, constraint >= 0)
    - `target_margin` (Numeric 5,4, check < 1.0) - Desired profit margin (e.g., 0.30 for 30%).
    - `margin_strategy` (Enum) - 'FIXED', 'DYNAMIC'.
    - `min_stock_level` (Default 5)
    - `max_stock_level` (Default 100)
    - `is_active` (Boolean)
