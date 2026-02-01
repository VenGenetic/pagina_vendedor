---
type: part
status: active
impact: low
tags: [inventory, algorithm]
---

# Restock Algorithm Logic

## Description
The **Restock Algorithm Logic** is the specific mathematical formula used to determine when and how much to reorder.

## Hierarchy
- **Parent**: [[Smart_Restock_Module]]
- **Children**: None

## Logic

### 1. Autopilot Pricing Formula
When `target_margin` is set, the selling price is automatically recalculated upon restock:
> $$ Price = \frac{Cost}{1 - Margin} $$

*Example: Cost $100, Margin 30% (0.3) -> Price = 100 / 0.7 = $142.85*

### 2. Restock Process (RPC: `process_restock`)
```pseudocode
FUNCTION process_restock(product_id, quantity, unit_cost):
  1. INSERT into inventory_movements (type='IN', reason='PURCHASE', price=unit_cost)
  2. GET target_margin from products
  3. IF target_margin EXISTS:
       new_price = unit_cost / (1 - target_margin)
       UPDATE products SET cost_price=unit_cost, selling_price=new_price
     ELSE:
       UPDATE products SET cost_price=unit_cost
```

### 3. Restock Trigger
- **Condition**: `current_stock` <= `min_stock_level`
- **Recommended Order**: `max_stock_level` - `current_stock`
