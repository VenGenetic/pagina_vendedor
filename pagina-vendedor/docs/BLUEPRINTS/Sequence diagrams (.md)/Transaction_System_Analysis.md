# Transaction System Analysis: Data & Symbol Flow

This document details the flow of data and "symbols" (Positive/Negative financial effects) across the system's core transaction types.

## Core Financial Principles

The system uses a **Type-Based** logic for updating account balances, rather than relying solely on the sign of the input amount.

### Symbol Logic (Balance Updates)
The `update_account_balance` trigger (defined in `20260215_fix_balance_signs.sql`) enforces the following rules:

| Transaction Type | Effect on Balance | Formula | Logic |
| :--- | :--- | :--- | :--- |
| **INCOME** | **(+) Increase** | `Balance = Balance + ABS(Amount)` | Money entering an account (e.g., Sales). |
| **EXPENSE** | **(-) Decrease** | `Balance = Balance - ABS(Amount)` | Money leaving an account (e.g., Purchases, Costs). |
| **PURCHASE** | **(-) Decrease** | `Balance = Balance - ABS(Amount)` | Treated same as Expense (Inventory buying). |
| **TRANSFER** | **(+/-) Move** | *Source*: `Balance - ABS(Amount)`<br>*Dest*: `Balance + ABS(Amount)` | Money moving between internal accounts. |

---

## 1. Sale Transaction Flow
**Focus**: Revenue Generation, Inventory Reduction, and Optional Costs.

This flow is orchestrated by the `process_sale_with_reservation` RPC. It links the Financial Transaction directly to the Sale Header and Inventory Movements.

```mermaid
sequenceDiagram
    autonumber
    
    actor User
    participant FE as Frontend<br>(transactions.ts)
    participant RPC as DB RPC<br>(process_sale_with_reservation)
    participant T_Sale as Table: Sales
    participant T_Tx as Table: Transactions
    participant T_Inv as Table: Inventory_Movements
    participant T_Acc as Table: Accounts
    
    Note over User, FE: User completes a Sale (Total: $100)

    User->>FE: Click "Confirm Sale"
    FE->>RPC: Call process_sale_with_reservation(...)
    
    activate RPC
    
    Note right of RPC: 1. Create Sale Header
    RPC->>T_Sale: INSERT Sale Record
    
    Note right of RPC: 2. Create Financial Record (Income)
    RPC->>T_Tx: INSERT INTO transactions (Type='INCOME', Amount=100, Account=Bank)
    
    activate T_Tx
    T_Tx->>T_Acc: TRIGGER update_account_balance
    activate T_Acc
    Note right of T_Acc: Symbol: (+)<br>Balance += 100
    T_Acc-->>T_Tx: Updated
    deactivate T_Acc
    T_Tx-->>RPC: Returning Transaction ID (Tx1)
    deactivate T_Tx
    
    Note right of RPC: 3. Link Sale to Transaction
    RPC->>T_Sale: UPDATE Sale SET transaction_id = Tx1

    Note right of RPC: 4. Process Inventory Items
    loop For Each Item
        Note right of RPC: Create Inventory OUT (Negative Quantity)
        RPC->>T_Inv: INSERT INTO inventory_movements (Type='OUT', Qty=-1, Tx_ID=Tx1)
        activate T_Inv
        T_Inv->>T_Inv: Trigger updates Product Stock
        deactivate T_Inv
    end

    opt Has Shipping Cost ($10)
        Note right of RPC: Create Expense Record
        RPC->>T_Tx: INSERT INTO transactions (Type='EXPENSE', Amount=10, Account=Cash)
        activate T_Tx
        T_Tx->>T_Acc: TRIGGER update_account_balance
        activate T_Acc
        Note right of T_Acc: Symbol: (-)<br>Balance -= 10
        T_Acc-->>T_Tx: Updated
        deactivate T_Acc
        deactivate T_Tx
    end

    RPC-->>FE: Return Success
    deactivate RPC
    FE->>User: Show Receipt
```

---

## 2. Purchase (Restock) Flow
**Focus**: Money Out, Inventory In, WAC Calculation, and "Ley del Perdón".

Orchestrated by `process_purchase_transaction` (Atomic RPC).

```mermaid
sequenceDiagram
    autonumber
    
    actor User
    participant FE as Frontend
    participant RPC as DB RPC<br>(process_purchase_transaction)
    participant T_Prod as Table: Products
    participant T_Inv as Table: Inventory_Movements
    participant T_Tx as Table: Transactions
    participant T_Acc as Table: Accounts

    User->>FE: Restock 10 Units @ $50 (Total $500)
    FE->>RPC: Call process_purchase_transaction(...)
    
    activate RPC
    
    loop For Each Product
        RPC->>T_Prod: Lock Row & Get Current Stock
        
        opt Stock is Negative (e.g. -2) ("Ley del Perdón")
            Note right of RPC: RESET Negative Stock to 0
            RPC->>RPC: Call process_stock_adjustment(-2 -> 0)
            activate RPC
            RPC->>T_Inv: Insert Adjustment (IN +2)
            RPC->>T_Tx: Insert Adjustment Expense/Income
            deactivate RPC
        end

        RPC->>RPC: Calculate Weighted Average Cost (WAC)
        
        Note right of RPC: Update Product Cost
        RPC->>T_Prod: UPDATE products SET cost = New_WAC
        
        Note right of RPC: Create Inventory IN
        RPC->>T_Inv: INSERT INTO inventory_movements (Type='IN', Qty=+10, Reason='PURCHASE')
    end

    Note right of RPC: Create Financial Record (Expense)
    RPC->>T_Tx: INSERT INTO transactions (Type='EXPENSE', Amount=500)
    
    activate T_Tx
    T_Tx->>T_Acc: TRIGGER update_account_balance
    activate T_Acc
    Note right of T_Acc: Symbol: (-)<br>Balance -= 500
    T_Acc-->>T_Tx: Updated
    deactivate T_Acc
    deactivate T_Tx

    RPC-->>FE: Return Success
    deactivate RPC
```

---

## 3. Transfer Flow (Dual Entry)
**Focus**: Moving money between accounts with strict separation.

Implements a **Dual-Entry** pattern where two transaction rows are created to represent the flow, ensuring auditability of both sides.

```mermaid
sequenceDiagram
    autonumber
    
    actor User
    participant FE as Frontend
    participant RPC as DB RPC<br>(transfer_funds)
    participant T_Tx as Table: Transactions
    participant T_Acc as Table: Accounts

    Note over User, FE: Transfer $200 from Safe to Bank

    User->>FE: Submit Transfer
    FE->>RPC: Call transfer_funds(Src=Safe, Dest=Bank, Amt=200)
    
    activate RPC
    RPC->>RPC: Generate Group ID
    
    par Parallel Inserts (Logical)
        Note right of RPC: 1. Debit Source (Out)
        RPC->>T_Tx: INSERT (Type='EXPENSE', Acct=Safe, Amt=200)
        activate T_Tx
        T_Tx->>T_Acc: Trigger: Balance -= 200
        deactivate T_Tx

        Note right of RPC: 2. Credit Destination (In)
        RPC->>T_Tx: INSERT (Type='INCOME', Acct=Bank, Amt=200)
        activate T_Tx
        T_Tx->>T_Acc: Trigger: Balance += 200
        deactivate T_Tx
    end
    
    RPC-->>FE: Return Success
    deactivate RPC
```

---

## 4. Inventory Adjustment (Shrinkage) Flow
**Focus**: Correcting stock discrepancies and recording the financial loss.

```mermaid
sequenceDiagram
    autonumber
    
    actor User
    participant FE as Frontend
    participant RPC as DB RPC<br>(process_stock_adjustment)
    participant T_Inv as Table: Inventory_Movements
    participant T_Tx as Table: Transactions
    participant T_Acc as Table: Accounts

    Note over User, FE: Found 2 missing items (Stock: 10 -> 8)

    User->>FE: Adjust Stock to 8
    FE->>RPC: Call process_stock_adjustment(Target=8)
    
    activate RPC
    RPC->>RPC: Calculate Delta = -2
    
    Note right of RPC: 1. Create Inventory Movement
    RPC->>T_Inv: INSERT (Type='OUT', Qty=-2, Reason='SHRINKAGE')
    
    Note right of RPC: 2. Create Financial Impact
    RPC->>T_Tx: INSERT (Type='EXPENSE', Amount=Value_of_Loss, Account='Gasto por Merma')
    
    activate T_Tx
    T_Tx->>T_Acc: TRIGGER update_account_balance
    activate T_Acc
    Note right of T_Acc: Symbol: (-)<br>Reduces 'Gasto por Merma' Balance*<br>(*Note: Nominal Accounts track Total Expenses via balance)
    T_Acc-->>T_Tx: Updated
    deactivate T_Acc
    deactivate T_Tx

    RPC-->>FE: Return New Stock
    deactivate RPC
```
