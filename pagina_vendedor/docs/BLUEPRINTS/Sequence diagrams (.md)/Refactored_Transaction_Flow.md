# Proposed Unified Transaction Architecture

This document outlines the **Future State** of the transaction system, designed to eliminate "Double Counting" and simplify the Transfer model.

## Key Architectural Changes

1.  **Single Source of Truth (Trigger)**: All balance updates are handled by **ONE** trigger (`trg_singleton_account_reconciliation`).
2.  **Single-Record Transfer**: Transfers are now recorded as a single row in `transactions` with both `account_out_id` and `account_in_id` set. The logic does NOT create two separate rows.
3.  **Strict Reconciliation**: The trigger enforces logic based strictly on `type` and `account_..._id` fields.

---

## 1. Unified Trigger Logic (`trg_singleton_account_reconciliation`)
**Logic**: Auto-reconcile balances based on Transaction Type.

```mermaid
flowchart TD
    A[Insert Transaction] --> B{Check Type}
    
    B -- INCOME --> C[Update Account: Balance + Amount]
    B -- EXPENSE --> D[Update Account: Balance - Amount]
    
    B -- TRANSFER --> E{Check IDs}
    E -- Missing IDs --> F[RAISE EXCEPTION]
    E -- Valid --> G[Update Source: Balance - Amount]
    G --> H[Update Dest: Balance + Amount]
```

---

## 2. Refactored Transfer Flow
**Focus**: Efficiency and Atomic Consistency.

Instead of creating two rows (Debit + Credit), we create **one row** that represents the movement. The Trigger handles the accounting on both sides.

```mermaid
sequenceDiagram
    autonumber
    
    actor User
    participant FE as Frontend
    participant RPC as DB RPC<br>(transfer_funds)
    participant T_Tx as Table: Transactions
    participant T_Acc as Table: Accounts
    participant Trg as Trigger<br>(trg_singleton_account_reconciliation)

    Note over User, FE: Transfer $200 from Safe to Bank

    User->>FE: Submit Transfer
    FE->>RPC: Call transfer_funds(Src=Safe, Dest=Bank, Amt=200)
    
    activate RPC
    
    Note right of RPC: Insert SINGLE Record
    RPC->>T_Tx: INSERT INTO transactions (Type='TRANSFER', Amt=200, Out=Safe, In=Bank)
    
    activate T_Tx
    T_Tx->>Trg: Fire After Insert
    activate Trg
    
    Note right of Trg: 1. Debit Source
    Trg->>T_Acc: UPDATE accounts SET balance -= 200 WHERE id = Safe
    
    Note right of Trg: 2. Credit Destination
    Trg->>T_Acc: UPDATE accounts SET balance += 200 WHERE id = Bank
    
    Trg-->>T_Tx: Done
    deactivate Trg
    
    T_Tx-->>RPC: Auto-Commit
    deactivate T_Tx
    
    RPC-->>FE: Return Success
    deactivate RPC
```

---

## 3. Standard Income Flow (Simplified)
**Focus**: No more duplicate/mirror rows for simple Income.

```mermaid
sequenceDiagram
    autonumber
    
    actor User
    participant RPC as DB RPC
    participant T_Tx as Table: Transactions
    participant T_Acc as Table: Accounts
    participant Trg as Trigger

    Note over User, RPC: Sale Income $100

    RPC->>T_Tx: INSERT (Type='INCOME', Amt=100, Account=Bank)
    activate T_Tx
    
    T_Tx->>Trg: Fire After Insert
    activate Trg
    
    Note right of Trg: Update Account
    Trg->>T_Acc: UPDATE accounts SET balance += 100 WHERE id = Bank
    
    Trg-->>T_Tx: Done
    deactivate Trg
    deactivate T_Tx
```

## 4. Standard Expense Flow (Simplified)
**Focus**: Direct dependency on Account ID.

```mermaid
sequenceDiagram
    autonumber
    
    actor User
    participant RPC as DB RPC
    participant T_Tx as Table: Transactions
    participant T_Acc as Table: Accounts
    participant Trg as Trigger

    Note over User, RPC: Expense $50

    RPC->>T_Tx: INSERT (Type='EXPENSE', Amt=50, Account=Cash)
    activate T_Tx
    
    T_Tx->>Trg: Fire After Insert
    activate Trg
    
    Note right of Trg: Update Account
    Trg->>T_Acc: UPDATE accounts SET balance -= 50 WHERE id = Cash
    
    Trg-->>T_Tx: Done
    deactivate Trg
    deactivate T_Tx
```
