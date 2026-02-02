---
type: part
status: active
impact: high
tags: [inventory, algorithm, logic]
---

# Restock Algorithm Logic

## Description
The **Restock Algorithm Logic** determines the optimal purchasing quantities to maintain inventory health without overstocking. It has evolved from a static Min/Max model to a dynamic **Weighted Velocity** model.

## Hierarchy
- **Parent**: [[Smart_Restock_Module]]
- **Children**: None

## Core Principles

### 1. Weighted Velocity Model
Instead of simple averages, the system calculates a "Sales Velocity" that weighs recent sales more heavily than older ones.
- **Goal**: Detect trends (e.g., sudden spikes in demand) faster than a simple 30-day average.
- **Reference**: `view_smart_replenishment` in Database.

### 2. Time Constants
The algorithm relies on specific time-based constants to calculate needs:
- **Lead Time**: `2 Days` (Time from order to shelf).
- **Cycle Time**: `7 Days` (Frequency of restocking).

## The Formula

### Step 1: Calculate Reorder Point
When should we buy more?
> $$ ReorderPoint = (Velocity \times LeadTime) + SafetyStock $$

- **Velocity**: Daily sales rate.
- **Lead Time**: 2 days.
- **Safety Stock**: Dynamic buffer based on velocity variance (calculated in View).

### Step 2: Determine Status
The system assigns a triage status to every product:

| Status | Condition | Meaning |
| :--- | :--- | :--- |
| **CRITICAL** | `Stock <= Velocity` | Less than 1 day of coverage. Stockout imminent. |
| **REORDER** | `Stock <= ReorderPoint` | Below safety threshold. Buy now to avoid breakdown. |
| **OVERSTOCK** | `Stock > MaxCap (20)` | Too much inventory on shelf. |
| **OK** | `Stock > ReorderPoint` | Healthy levels. |

### Step 3: Calculate Buy Quantity
How much should we buy?
- **Ideal Target**: `ReorderPoint + (Velocity * CycleTime)`
- **Raw Need**: `Ideal Target - Current Stock`

### Step 4: Logic Capping (The "Shelf Limit")
We enforce a hard physical limit to prevent shelf overcrowding and capital tie-up.
- **MAX_SHELF_CAP**: `20 Units`.
- **Space Available**: `20 - Current Stock`.
- **Final Buy**: `Math.min(Raw Need, Space Available)`.

> [!IMPORTANT]
> **Constraint**: We *never* suggest buying more than what fits on the shelf (20 units), regardless of high velocity. This forces frequent, smaller restocks.

## Pricing Logic (Autopilot)
If a `target_margin` is set for a product, the system automatically recalculates the selling price upon restock entry:
> $$ Price = \frac{Cost}{1 - Margin} $$

*Example: Cost $10, Margin 30% -> Price $14.28*
