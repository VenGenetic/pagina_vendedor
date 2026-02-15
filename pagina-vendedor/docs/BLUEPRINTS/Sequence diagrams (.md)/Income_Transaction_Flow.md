# Sequence Diagram: Income Transaction Flow (Corrected)

This diagram illustrates the flow of creating an Income transaction with associated costs (e.g. Sales with optional Cost of Goods and Shipping), from the Frontend UI down to the Database Triggers.

## Flow Overview

1.  **Frontend**: User inputs positive values for Sale, Cost, and Shipping.
2.  **Service**: Orchestrates calls. First creates the Income, then optionally creates Expenses for costs.
3.  **RPC**: `process_generic_transaction` handles the Double-Entry logic (creating a Mirror/Contra transaction).
4.  **Database**: Triggers update account balances based on **TYPE**, not Input Sign. 
    *   **INCOME**: `Balance = Balance + ABS(Amount)`
    *   **EXPENSE**: `Balance = Balance - ABS(Amount)`

```mermaid
sequenceDiagram

    autonumber

    actor User

    participant Page as NewIncomePage<br>(client)

    participant Service as transactions.ts<br>(Service)

    participant RPC as Postgres RPC<br>(process_generic_transaction)

    participant DB_Tx as DB: Transactions<br>(Table)

    participant DB_Acc as DB: Accounts<br>(Table + Trigger)

  

    Note over User, Page: User inputs Data

    User->>Page: Enters Sale: $1000<br>Enters Cost: $200<br>Enters Shipping: $50

    User->>Page: Clicks "Registrar"

    Page->>Page: Validates inputs

    %% MAIN INCOME

    Page->>Service: createIncome({monto: 1000, costo: 200, envio: 50...})

    activate Service

    Note right of Service: 1. Process Main INCOME

    Service->>RPC: process_generic_transaction(type='INCOME', amount=ABS(1000), ...)

    activate RPC

    RPC->>RPC: Generate group_id (UUID)

    RPC->>RPC: v_contra_amount = -1000 (Calculated by RPC)

    %% Primary Insert (Asset)

    RPC->>DB_Tx: INSERT INTO transactions (type='INCOME', amount=1000, account_id=Bank...)

    activate DB_Tx

    DB_Tx->>DB_Acc: TRIGGER update_account_balance(NEW)

    activate DB_Acc

    Note right of DB_Acc: Type=INCOME → Balance = Balance + 1000

    DB_Acc-->>DB_Tx: Updated

    deactivate DB_Acc

    DB_Tx-->>RPC: Returning ID (Tx1)

    deactivate DB_Tx

    %% Mirror Insert (Contra)

    RPC->>DB_Tx: INSERT INTO transactions (type='INCOME', amount=-1000, account_id='CRÉDITOS'...)

    activate DB_Tx

    DB_Tx->>DB_Acc: TRIGGER update_account_balance(NEW)

    activate DB_Acc

    Note right of DB_Acc: Type=INCOME → Balance = Balance + ABS(-1000)<br>(Wait: Revenue Account Logic might need Review if using INCOME type for Contra)<br>(Assuming Contra is NOT Asset, trigger affects it differently or same?)

    DB_Acc-->>DB_Tx: Updated (Revenue Increases)

    deactivate DB_Acc

    DB_Tx-->>RPC: Done

    deactivate DB_Tx

    RPC-->>Service: success: { transaction_id: Tx1 }

    deactivate RPC

  

    %% OPTIONAL COST (EXPENSE)

    opt If Costo Repuesto > 0 ($200)

        Note right of Service: 2. Process Cost EXPENSE

        Service->>Service: createExpense({monto: 200, type='EXPENSE'...})

        Service->>RPC: process_generic_transaction(type='EXPENSE', amount=ABS(200), ...)

        activate RPC

        RPC->>RPC: Generate new group_id

        RPC->>RPC: v_contra_amount = -200

        %% Primary Insert (Asset)

        RPC->>DB_Tx: INSERT INTO transactions (type='EXPENSE', amount=200, account_id=Bank...)

        activate DB_Tx

        DB_Tx->>DB_Acc: TRIGGER update_account_balance(NEW)

        activate DB_Acc

        Note right of DB_Acc: Type=EXPENSE → Balance = Balance - 200 (CORRECT)

        DB_Acc-->>DB_Tx: Updated

        deactivate DB_Acc

        DB_Tx-->>RPC: Returning ID (Tx2)

        deactivate DB_Tx

        %% Mirror Insert (Contra)

        RPC->>DB_Tx: INSERT INTO transactions (type='EXPENSE', amount=-200, account_id='DÉBITOS'...)

        activate DB_Tx

        DB_Tx->>DB_Acc: TRIGGER update_account_balance(NEW)

        activate DB_Acc

        Note right of DB_Acc: Type=EXPENSE → Balance = Balance - ABS(-200)<br>(Contra Account Logic)

        DB_Acc-->>DB_Tx: Updated

        deactivate DB_Acc

        DB_Tx-->>RPC: Done

        deactivate DB_Tx

        RPC-->>Service: success

        deactivate RPC

    end

  

    %% OPTIONAL SHIPPING (EXPENSE)

    opt If Costo Envio > 0 ($50)

        Note right of Service: 3. Process Shipping EXPENSE

        Service->>Service: createExpense({monto: 50, type='EXPENSE'...})

        Service->>RPC: process_generic_transaction(type='EXPENSE', amount=ABS(50), ...)

        activate RPC

        RPC->>RPC: Same generic flow as Cost...

        RPC->>DB_Tx: INSERT (Amount: 50)

        DB_Tx->>DB_Acc: TRIGGER Update Balance (Subtracts 50)

        RPC->>DB_Tx: INSERT Mirror (Amount: -50)

        RPC-->>Service: success

        deactivate RPC

    end

  

    Service-->>Page: Returns Success

    deactivate Service

    Page->>User: Shows "Transacción registrada"
```
