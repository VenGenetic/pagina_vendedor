---
type: part
status: active
impact: high
tags: [finance, logic, ledger]
---

# Financial Laws (Double-Entry Bookkeeping)

## Description
The **Financial Laws** part governs all monetary movements within the system. It ensures that every cent is accounted for through strict double-entry principles and immutable ledger records.

## Governing Laws

### 1. The Law of Conservation (Zero-Sum Principle)
Every transaction must be balanced. The sum of all debits and credits in a transaction group must equal zero.
- **Rule**: No "orphaned" transactions. If money leaves one account, it must enter another or be categorized as an expense.
- **Implementation**: Enforced by the `trigger_check_transaction_balance` (and related logic) which validates that the sum of amounts in a `group_id` is zero.

### 2. The Law of Immutability (The Reversal Law)
Financial records are never deleted or edited to change their amounts.
- **Rule**: To correct a mistake, a **Reversal** (REFUND) transaction must be created.
- **Process**: 
    1. Identify the original transaction.
    2. Create a new transaction with the opposite sign.
    3. Both transactions remain in the history for audit purposes.

### 3. The Law of Atomic Transfers
Moving money between accounts is a single atomic operation handled by the system.
- **Process**:
    1. **Debit** the source account.
    2. **Credit** the destination account.
    3. Both entries share the same `group_id`.
- **Logic**: Handled via the `transfer_funds` RPC to ensure both sides of the transfer occur or neither does.

## Logic Loop: Account Balance Update
1. **Insert**: A new entry is added to the `transactions` table.
2. **Trigger**: `trigger_update_account_balance` fires.
3. **Logic**:
    - If `type = 'INCOME'`, `balance = balance + amount`.
    - If `type = 'EXPENSE'`, `balance = balance - amount`.
    - If `type = 'TRANSFER'`, the source/destination signs handle the balance naturally (assuming signed amounts in the ledger).

## Implementations in UI
- [[Financial_Management_View]]: Manages account balances, transaction history, and fund transfers.

## Dependencies
- **Accounts**: Relies on the `accounts` table for current balances.
- **Transaction Types**: Strictly checked against `INCOME`, `EXPENSE`, `TRANSFER`, `REFUND`.
