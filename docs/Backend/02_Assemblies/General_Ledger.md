---
type: assembly
status: active
impact: financial
tags: [finance, logic]
---

# General Ledger

## Description
The **General Ledger** is the financial heart of the ERP. It ensures data integrity by enforcing **Double-Entry Bookkeeping**, meaning every transaction has a corresponding entry that balances the equation. Uniquely, it implements a **Safe Reversal** policy: transactions are never deleted, only reversed by equal and opposite counter-transactions.

## Hierarchy
- **Parent**: [[Motorcycle_Parts_ERP]]
- **Children**:
    - [[Transaction_History]]
    - [[Accounts_Payable]] (Future)
    - [[Accounts_Receivable]] (Future)

## Architected Rules
1.  **Immutable Ledger**: `DELETE` operations are strictly blocked by database triggers on the `transactions` table. Errors are corrected ONLY via "Reversal Transactions".
2.  **Double Entry**: Every financial movement writes at least two records (e.g., Credit Cash, Debit Inventory Cost).
3.  **Group Atomic**: Related transactions share a `group_id` to ensure they are processed or reversed as a single unit.
4.  **Automation**: 
    -   Trigger: `trigger_update_account_balance`
    -   Action: Updates `accounts.balance` (+ for INCOME, - for EXPENSE).
5.  **Chronology**: All specific queries use `transaction_date DESC` index for performance.
6.  **Negative Balances**:
    -   *Context*: Business requires handling overdrafts or costs exceeding current cash (e.g., waiting for reimbursement).
    -   *Logic*: The `allow_negative_balance.sql` script explicitly drops the `positive_balance` constraint from the `accounts` table, allowing `balance` to be < 0.
