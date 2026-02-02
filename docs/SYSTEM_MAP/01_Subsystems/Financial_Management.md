---
type: subsystem
status: active
impact: high
tags: [finance, money]
---

# Financial Management

## Description
The **Financial Management** subsystem governs the flow of money. It enforces the "Conservation of Money" principle, ensuring that every cent is accounted for through double-entry logging.

## Hierarchy
- **Parent**: [[Motorcycle_Parts_ERP]]
- **Children**:
    - [[General_Ledger]]
    - [[Transaction_History]]

## Core Responsibilities
1.  **Account Management**: Tracking balances for Cash, Bank, and Digital Wallets.
    -   *Seeding Rule*: Accounts are standardized via `fix_and_seed_accounts.sql`. Key accounts include 'Banco Pichincha Katiuska', 'Banco Guayaquil Katiuska', and 'Efectivo'.
    -   *Normalization*: Account names are forcefully renamed to match these standards if variations are detected.
2.  **Transaction Logging**: Immutable recording of 'INCOME' and 'EXPENSE' in `transactions`.
3.  **Auditability**: Providing a clear trail of where money came from and went.
4.  **Balance Automation**: The `trigger_update_account_balance` automatically updates `accounts.balance` on every insertion.

## Account Types & Nominal Operations
To strictly satisfy `Assets - Liabilities = Equity` (or `Assets + Expenses = Income + Equity` in 5-element accounting), we utilize specific account types:
1.  **Real Accounts (Assets)**: Cash, Bank, Digital Wallets. These represent actual liquid money.
2.  **Nominal Accounts (Contra)**: 'DÉBITOS' (Expense Offset) and 'CRÉDITOS' (Income Offset). These exist solely to balance the ledger.
    -   *Logic*: A $100 Expense decreases the Asset Account (-$100) and increases the Nominal Expense Account (+$100 implied, or -$100 contra). The sum of all accounts (Real + Nominal) is always 0.

### Dashboard Visibility (Net Balance)
The "Saldo en Cuentas" displayed on the Dashboard is a **Filtered View**:
-   **Equation**: `Sum(Balance) WHERE is_active=TRUE AND is_nominal=FALSE`.
-   **Purpose**: The user only cares about *Liquid Assets* (Money they can spend). Nominal account balances are hidden from the "Total Balance" card to prevent confusion.

## Sales Transaction Flow (Double Entry)
The sales process is an atomic operation orchestrated by the `process_sale_transaction` RPC. It enforces **Double-Entry Bookkeeping** to ensure financial reality.

### 1. The Accounting Equation
Every sale generates TWO financial records linked by a `group_id`:
1.  **Debit (Asset)**: The money entering the `account_id` (e.g., Cash, Bank). Positive (+) Amount.
2.  **Credit (Revenue)**: The record of *why* we have money. Recorded in the 'Ingresos por Ventas' account. Negative (-) Amount (Sign-based bookkeeping).
-   **Result**: The sum of the transaction group is 0.

### 2. Logistics & Inventory
-   **Atomicity**: Financials and Inventory are committed together. If one fails, both rollback.
-   **Stock Check**: Uses `FOR UPDATE` row locking to prevent selling out-of-stock items during high concurrency.
-   **Movement Log**: Records an `OUT` movement in `inventory_movements`, which triggers the stock deduction.

### 3. Safe Reversals (The "No-Delete" Rule)
Transactions are immutable. To undo a mistake or process a refund, we use **Safe Reversals** (`rpc_reverse_transaction`).
-   **Counter-Transaction**: Creating a new transaction (Type: `REFUND`) with the exact opposite values of the original.
-   **Linking**: The new transaction is linked to the original via `related_transaction_id`.
-   **Restoration**:
    -   Financial balances are automatically adjusted back.
    -   Inventory is automatically restored (`IN` movement created).
    -   The original Sale is marked as `CANCELLED`.


