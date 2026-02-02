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

## Sales Transaction Flow
The sales process is an atomic operation orchestrated by the `process_sale_transaction` RPC. It ensures integrity across Inventory, Sales, and Financial ledgers.

1.  **Orchestration (RPC)**:
    -   **Atomicity**: All steps occur within a single transaction. If any fail, the entire sale is rolled back.
    -   **Validation**: Stock levels are checked (`products.current_stock` >= `requested_quantity`) with row locking (`FOR UPDATE`) to prevent race conditions.

2.  **Customer Snapshot**:
    -   Customer data is upserted (created or updated) in the `customers` table.
    -   Critical customer details (Name, ID) are also snapshotted into the `sales` table to preserve historical accuracy even if the customer record changes later.

3.  **Inventory Impact**:
    -   **Movement Log**: `inventory_movements` records are created for each item (Type: `OUT`, Reason: `SALE`).
    -   **Stock Update Trigger**: `trigger_update_product_stock` fires on insertion to `inventory_movements`, automatically deducting the quantity from `products.current_stock`.

4.  **Financial Impact**:
    -   **Income**: A `transactions` record is created (Type: `INCOME`) for the sale total.
    -   **Balance Update Trigger**: `trigger_update_account_balance` fires on insertion to `transactions`, automatically increasing the `accounts.balance`.
    -   **Shipping**: If applicable, a separate `transactions` record (Type: `EXPENSE`) is created for shipping costs, decreasing the relevant account balance.

4.  **Reversibility (Safe Reversal)**:
    -   **Ledger Integrity**: Transactions are never hard-deleted. Instead, we use `rpc_reverse_transaction` to create an offsetting "Counter-Transaction".
    -   **Auto-Restoration**: This RPC automatically handles the financial refund AND the inventory restoration (logic detailed in [[Transaction_Workflows]]), ensuring the "Conservation of Money" and "Conservation of Matter" principles are preserved.

