---
type: part
status: active
impact: high
tags: [inventory, algorithm, logic]
---

# Restock Algorithm Logic

## Description
The **Restock Algorithm Logic** is the mathematical engine behind inventory recommendations. It moves beyond simple static thresholds to a dynamic model based on "Sales Velocity."

## Hierarchy
- **Parent**: [[Smart_Restock_Module]]
- **Children**: None

## The Formula
### 1. Weighted Velocity
Instead of a simple average, we weight recent sales more heavily to detect trends.
- **Periods**:
    - `Velocity_7_Day` (Weight: 0.5)
    - `Velocity_30_Day` (Weight: 0.3)
    - `Velocity_90_Day` (Weight: 0.2)
- **Calculation**:
    `Daily_Velocity = (Avg_7 * 0.5) + (Avg_30 * 0.3) + (Avg_90 * 0.2)`

### 2. Reorder Point (Dynamic Min)
When should we order?
- `Reorder_Point = (Daily_Velocity * Lead Time) + Safety_Stock`
- *Note*: If this calculated value is lower than the product's hard-coded `min_stock_level`, the system respects the higher of the two.

### 3. Reorder Quantity (Dynamic Max)
How much should we order?
- `Target_Stock = Daily_Velocity * Days_To_Cover` (e.g., 45 days)
- `Order_Quantity = Target_Stock - Current_Stock`

## Logic Flow (SQL RPC)
1.  **Scope**: `process_restock()` function.
2.  **Input**: User confirms accepted restock list.
3.  **Action**:
    -   Creates `inventory_movements` (Type: IN, Reason: PURCHASE).
    -   Creates `transactions` (Type: EXPENSE, Category: RESTOCK).
    -   Auto-updates `selling_price` if `target_margin` logic is enabled.
