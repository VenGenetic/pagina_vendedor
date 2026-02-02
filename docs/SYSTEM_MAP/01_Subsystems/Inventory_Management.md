---
type: subsystem
status: active
impact: high
tags: [inventory, logical]
---

# Inventory Management

## Description
The **Inventory Management** subsystem is responsible for the physical and logical representation of stock. It ensures that the digital count matches the physical reality of the warehouse.

## Hierarchy
- **Parent**: [[Motorcycle_Parts_ERP]]
- **Children**:
    - [[Stock_Controller]]
    - [[Product_Catalog]]
    - [[Smart_Restock_Module]]


## Core Responsibilities
1.  **Product Definition**: Defining what an item is (SKU, Price, Cost).
2.  **Stock Movements**: Recording IN/OUT flows via the `inventory_movements` Ledger.
3.  **Valuation**: Calculating the total value of assets held.
4.  **Ledger Law**: Stock levels are derivative; they are the sum of all movements.
5.  **Synchronization**: The `trigger_update_product_stock` ensures `products.current_stock` matches the ledger.

## Smart Restock & Pricing Logic
The system implements an "Autopilot" pricing model to protect margins during restock.

1.  **Atomic Restock**:
    -   Restocks are processed via `process_restock` RPC.
    -   This guarantees that Cost Updates and Stock Increases happen simultaneously.

2.  **Dynamic Pricing Formula**:
    -   Products have a `target_margin` (0.00 to 0.99).
    -   When new stock arrives with a new Cost, the system automatically recalculates the Selling Price to maintain the margin.
    -   **Formula**: `Selling Price = Unit Cost / (1 - Target Margin)`
    -   *Example*: Cost $100 / (1 - 0.30) = $142.85.

3.  **Inventory Integrity**:
    -   **IN (Purchase)**: Increases stock, updates cost (weighted or replacement depending on config), triggers price update.
    -   **OUT (Sale)**: Decreases stock, records revenue.
    -   **IN (Return)**: Restores stock via Reversal transactions.

