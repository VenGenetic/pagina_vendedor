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
