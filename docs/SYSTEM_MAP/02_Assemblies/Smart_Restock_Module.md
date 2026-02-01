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
- **Parent**: [[Inventory_Management]]
- **Children**:
    - [[Restock_Algorithm_Logic]]

## Features
1.  **Autopilot Pricing**: 
    -   Input: `target_margin` (0.00 - 0.99)
    -   Formula: `Selling Price = Cost / (1 - Margin)`
    -   Logic: Automatically updates `selling_price` when a `PURCHASE` movement occurs.
2.  **Restock Alerts**:
    -   Query: `current_stock <= min_stock_level`
    -   View: `low_stock_products`
3.  **Atomic Processing**:
    -   RPC: `process_restock` function handles Inventory Insert + Price Update + Cost Update in a single transaction.
