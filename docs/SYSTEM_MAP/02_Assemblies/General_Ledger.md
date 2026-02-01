---
type: assembly
status: active
impact: financial
tags: [finance, logic]
---

# General Ledger

## Description
The **General Ledger** is the assembly that manages the core accounting logic. It is responsible for the integrity of account balances and the accurate recording of every financial event.

## Hierarchy
- **Parent**: [[Financial_Management]]
- **Children**:
    - [[Transaction_History]]

## Logic
1.  **Immutability**: `transactions` table is the source of truth. Rows cannot be deleted, only offset by a counter-transaction.
2.  **Balance Calculation**: `Account.balance` is physically stored but logically derived.
3.  **Automation**: 
    -   Trigger: `trigger_update_account_balance`
    -   Action: Updates `accounts.balance` (+ for INCOME, - for EXPENSE).
4.  **Chronology**: All specific queries use `transaction_date DESC` index for performance.
5.  **Negative Balances**:
    -   *Context*: Business requires handling overdrafts or costs exceeding current cash (e.g., waiting for reimbursement).
    -   *Logic*: The `allow_negative_balance.sql` script explicitly drops the `positive_balance` constraint from the `accounts` table, allowing `balance` to be < 0.
