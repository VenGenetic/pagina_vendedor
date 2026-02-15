# Transfer Failure Analysis Diagrams

## 1. Sequence Diagram: The Failure Flow
This diagram shows the sequence of events when a user attempts a transfer, highlighting the conflict between the new RPC logic and the existing database constraints.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend (Transactions Service)
    participant RPC as DB Function (transfer_funds)
    participant T as Table: Transactions
    participant A as Table: Accounts
    participant TrgSeg as Trigger: Segregation (Before)
    participant TrgRec as Trigger: Reconciliation (After)
    participant TrgHard as Trigger: Zero-Sum (Deferred/Commit)

    User->>FE: Click "Transferir Dinero" ($14.27)
    FE->>RPC: Call transfer_funds(Src, Dest, 14.27)
    
    note over RPC: Validates inputs (Amount > 0)<br/>Generates NEW GroupID

    RPC->>T: INSERT INTO transactions <br/>(Type='TRANSFER', Amount=14.27, GroupID=XYZ)

    activate T
    
    rect rgb(200, 255, 200)
        note right of T: BEFORE INSERT Check
        T->>TrgSeg: check_transfer_account_segregation()
        TrgSeg-->>T: OK (Assuming Real Accounts)
    end

    T-->>RPC: Row Inserted (Pending Commit)
    
    rect rgb(200, 200, 255)
        note right of T: AFTER INSERT Update
        T->>TrgRec: fn_reconcile_account_balance()
        TrgRec->>A: Update Source Balance (-14.27)
        TrgRec->>A: Update Dest Balance (+14.27)
        TrgRec-->>T: OK
    end

    RPC-->>FE: Return Success JSON
    deactivate T

    note over RPC: Transaction Block Ends -> COMMIT

    rect rgb(255, 200, 200)
        note right of T: DEFERRED CONSTRAINT CHECK
        T->>TrgHard: check_transaction_group_balance(GroupID=XYZ)
        
        note right of TrgHard: Calculates SUM(Amount) for Group XYZ
        
        TrgHard->>TrgHard: SUM = 14.27 (FAIL condition: != 0)
        
        opt IF SUM != 0
            TrgHard--xUser: RAISE EXCEPTION "Ledger Integrity Violation"<br/>Transaction Group is Unbalanced
        end
    end

    note over FE: Catches 500 Error
    FE-->>User: Show "Ocurrió un error al procesar la transferencia"
```

## 2. Logic Conflict Analysis
This diagram breaks down the conflicting logic rules that exist in the database.

```mermaid
flowchart TD
    subgraph "Legacy Hardening (2026-02-12)"
        Rule1["Constraint: Ledger Zero-Sum"]
        Rule1Desc["All transactions with the same GroupID<br/>must sum to exactly 0.00"]
        Rule1 -->|Enforced by| Trg1[Trigger: enforce_zero_sum_final]
    end

    subgraph "New Transfer Logic (2026-02-15)"
        Logic1["Single Record Transfer"]
        Logic1Desc["Transfers are stored as ONE row<br/>Amount = 14.27 (Positive)<br/>Refers to In/Out Account IDs"]
        Logic1 -->|Implemented by| RPC1[RPC: transfer_funds]
    end

    Execution[User Executes Transfer] --> RPC1
    RPC1 -->|Creates| Rec[Transaction Record]
    Rec -->|Contains| Data["Amount: +14.27<br/>Type: TRANSFER"]
    
    Data -->|Checked by| Trg1
    
    Trg1 -->|Calculation| Calc["Sum = 14.27"]
    Calc -->|Check| Decision{Is Sum == 0?}
    
    Decision -- No --> Fail[EXCEPTION: Unbalanced Group]
    Decision -- Yes --> Success[COMMIT]
    
    Fail --> Result[Transaction Rolls Back]
    
    classDef conflict fill:#ffcccc,stroke:#ff0000,stroke-width:2px;
    class Fail,Decision,Rule1 conflict
```

## 3. Entity State vs Constraint
A visual representation of why the data doesn't fit the 'Box'.

```mermaid
classDiagram
    class TransactionGroup {
        UUID group_id
        Record[] records
    }
    
    class TransactionRecord {
        UUID id
        Decimal amount
        String type
    }
    
    class ZeroSumConstraint {
        <<Rule>>
        SUM(records.amount) MUST BE 0
    }
    
    TransactionGroup *-- TransactionRecord
    TransactionGroup ..> ZeroSumConstraint : Validate
    
    note for TransactionGroup "Current State for Transfer:<br/>1 Record<br/>Amount = 14.27<br/>Logic: Single-Record Transfer"
    note for ZeroSumConstraint "Old Rule: Expects Ledger Pairs<br/>Logic: Double Entry Accounting"
```
