---
type: assembly
status: active
impact: medium
tags: [inventory, logic]
---

# Stock Controller

## Description
The **Stock Controller** is the logical assembly of triggers and functions that enforces stock integrity. It ensures that stock cannot be negative unless explicitly allowed and that every movement is logged.

## Hierarchy
- **Parent**: [[Inventory_Management]]
- **Children**:
    - [[Inventory_Movements]] (Implicit Component)

## Logic
1.  **Atomic Updates**: Stock is **NEVER** updated directly. It is a derivative of `inventory_movements`.
2.  **Trigger Mechanism**: The database trigger `trigger_update_product_stock` executes `update_product_stock()` after every insert.
3.  **Constraints**: `current_stock` >= 0 is enforced by database constraint `positive_stock`.
    -   *Exception*: The `allow_negative_balance.sql` script explicitly drops this constraint (`DROP CONSTRAINT positive_balance`) to allow overdrafts if cost exceeds balance or for temporary adjustments.
4.  **Synchronization**: `SUM(inventory_movements.quantity_change) == products.current_stock`.
