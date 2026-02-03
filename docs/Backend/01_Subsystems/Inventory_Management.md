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
3.  **Valuation**: Calculating the total value of assets held (Computed metrics via `inventory_valuation` queries).
4.  **Ledger Law**: Stock levels are derivative; they are the sum of all movements.
5.  **Synchronization**: The `trigger_update_product_stock` ensures `products.current_stock` matches the ledger.

## Management Logic
The subsystem delegates specialized tasks to its children:
1.  **Smart Restock**: Recommendations and autopilot pricing are governed by the [[Smart_Restock_Module]].
2.  **Inventory Integrity**: The physical-logical link and movement logging are enforced by the [[Stock_Controller]].

---

