---
type: part
status: active
impact: high
tags: [sales, finance, double-entry]
---

# Sales Workflow Laws

## Description
The **Sales Workflow Laws** define the accounting and inventory impact of every sale. It ensures that revenue, costs, and stock levels are synchronized in a single atomic transaction.

## Governing Laws

### 1. The Law of Double-Entry Sales
Every sale must generate at least one balanced debit/credit pair.
- **Entry 1 (Revenue)**:
    - **Debit**: `Account (Cash/Bank)` (+Amount)
    - **Credit**: `Income Account (Sales)` (-Amount)
- **Entry 2 (Inventory Value)**:
    - **Debit**: `Cost of Goods Sold (COGS)` (+Cost)
    - **Credit**: `Inventory Asset Account` (-Cost)
- **Implementation**: Handled by the `process_sale_transaction` RPC which assigns a unique `group_id` to these entries.

### 2. The Law of Stock Depletion
Sales are the primary "OUT" movement for inventory.
- **Action**: Every sale item creates an `OUT` record in `inventory_movements`.
- **Constraint**: Stock cannot typically go below zero unless overridden by specific system flags.

## Logic Loop: Sale Execution
1. **Frontend**: User selects products and payment account.
2. **RPC Call**: `process_sale_transaction(customer_id, items, account_id)`.
3. **Database Transaction**:
    - Creates `sale` record.
    - Creates `sale_items` linked to products.
    - Inserts `inventory_movements` (Triggers [[Inventory_Integrity_Laws]]).
    - Inserts Balanced `transactions` (Triggers [[Financial_Laws]]).
4. **Result**: Customer receives receipt, stock decreases, account balance increases.

## Implementations in UI
- [[Dashboard_View]]: Displays daily revenue and monthly profit.
- [[Financial_Management_View]]: Shows sale transactions in the ledger.

## Dependencies
- [[Financial_Laws]]
- [[Inventory_Integrity_Laws]]
- [[WAC_Governance]]
