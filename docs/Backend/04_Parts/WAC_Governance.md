---
type: part
status: active
impact: high
tags: [inventory, logic, finance]
---

# WAC Governance

## Description
The **WAC Governance** part defines the strict mathematical laws that dictate how product costs and selling prices are calculated and approved. It ensures price stability and profit margin integrity.

## Hierarchy
- **Parent**: None
- **Children**: None

## Governing Laws

### 1. The Law of Smoothing (Weighted Average Cost)
The system does not follow a FIFO or LIFO model. It uses **Weighted Average Cost (WAC)** to ensure that the value of existing stock and new arrivals is blended into a single representative cost.
- **Goal**: Prevent profit margin "shocks" when a single batch is bought at a higher price.
- **Equation**: `((Old_Stock * Old_Cost) + (New_Stock * New_Cost)) / (Total_Stock)`

### 2. The Negative Reset Business Law (The Forgiveness Law)
A critical "Hidden Rule" in the system handles the mathematical anomaly of selling stock before it is registered (Negative Stock).
- **Rule**: If `Current_Stock < 0` at the time of a restock, the system assumes the previous cost data is irrelevant or corrupted.
- **Implementation**: The cost debt is forgiven, and the new WAC becomes exactly the **New Unit Cost** of the incoming batch.

### 3. The Law of Verification (Price Proposals)
Cost changes are never automatic. They are **Quarantined** for review.
- **Process**: 
    1.  `process_restock_v2` calculates the "Potential WAC".
    2.  A `price_proposal` is created in a `PENDING` state.
    3.  The Admin must explicitly `APPROVE` or `REJECT` the change.
- **Audit Context**: Approved proposals are linked to the `product_cost_history` via the `app.current_proposal_id` session setting, creating a surgically precise audit trail.

## Logic Loop
1.  **Restock**: User uploads CSV or enters items manually.
2.  **Calculation**: `process_restock_v2` executes WAC math + Margin + IVA.
3.  **Proposal**: The system writes a snapshot to `price_proposals`.
4.  **Approval**: Admin accepts the cost -> `products.cost_price` is updated -> `product_cost_history` creates an entry linked to the Proposal ID.

## Implementations in UI
- [[Inventory_Management_View]]: Facilitates the restock process and the primary price proposal review interface.

## Dependencies
- **System Settings**: Relies on `tax_rate` and `markup_margin` stored in `system_settings`.
- **Inventory Movements**: Every restock must create a movement ID to link the proposal to physical reality.
