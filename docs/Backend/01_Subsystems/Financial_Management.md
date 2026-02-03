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
    - [[Data_Integrity_Guardian]]

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

### Dashboard Visibility (Net Liquid Assets)
The "Saldo en Cuentas" displayed on the Dashboard is a **Filtered View**:
-   **Equation**: `Sum(Balance) WHERE is_active=TRUE AND is_nominal=FALSE`.
-   **Purpose**: The user only cares about *Liquid Assets* (Money they can spend). Nominal account balances (Revenue/Expense Offsets) are strictly hidden from the "Total Balance" card and Account Lists to prevent confusion.

## Transaction Operations
The subsystem orchestrates complex financial events through specialized workflows.
1.  **Sales Transaction Flow**: Managed by the Point of Sale and the [[Transaction_Workflows]]. It enforces atomic double-entry commitments.
2.  **Safe Reversals**: Enforces the "No-Delete" rule via [[Transaction_Workflows]]. Errors are corrected through counter-transactions to preserve audit integrity.

---


