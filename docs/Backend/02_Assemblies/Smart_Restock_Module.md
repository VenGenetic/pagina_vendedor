---
type: assembly
status: active
impact: medium
tags: [inventory, automation]
---

# Smart Restock Module

## Description
The **Smart Restock Module** is an intelligent assistant that analyzes sales velocity and margin targets to recommend restock quantities and pricing adjustments.

## Hierarchy
- **Parent**: [[Motorcycle_Parts_ERP]]
- **Children**:
    - [[Restock_Algorithm_Logic]]

## Features
1.  **Autopilot Pricing**: 
    -   Input: `target_margin` (0.00 - 0.99)
    -   Formula: `Selling Price = Cost / (1 - Margin)`
    
## Logic
1.  **Weighted Velocity**: Calculates sales velocity based on recent activity, giving more weight to recent days (e.g., last 7 days count more than last 30).
2.  **Dynamic Reorder Point**: `(Daily Velocity * Lead Time) + Safety Stock`.
3.  **Autopilot Pricing**: Suggests selling price based on `Cost Price * (1 + Target Margin)`.

## Inputs
- **Sales Velocity**: Derived from `Transactions` (INCOME types linked to products).
- **Current Stock**: From `Products` table.
- **Target Margin**: User-defined preference per product (0.0 - 1.0).
- **Lead Time**: Time (in days) to receive new stock from suppliers.
2.  **Restock Alerts**:
    -   Query: `current_stock <= min_stock_level`
    -   View: `low_stock_products`
3.  **Atomic Processing**:
    -   RPC: `process_restock` function handles Inventory Insert + Price Update + Cost Update in a single transaction.
