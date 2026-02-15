# Nominal Accounts Architecture

## 1. Sequence Diagram: Mirror Logic
This diagram details the flow of transactions and how the "Mirror" logic is applied via the PostgreSQL Trigger.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as Next.js UI
    participant API as Supabase Client
    participant DB as PostgreSQL (Transactions)
    participant Trigger as fn_reconcile_account_balance
    participant RealAcc as Real Account (Assets)
    participant NomAcc as Nominal Account (Income/Expense)

    %% EXPENSE SCENARIO
    Note over User, NomAcc: SCENARIO 1: EXPENSE (Pay Rent $50)
    User->>UI: Selects "Rent" (Nominal) & "Bank" (Real)
    UI->>API: createExpense(amount: 50, account_id: Bank, category_id: Rent)
    Note right of UI: Frontend must pass BOTH IDs? <br/>Currently 'createExpense' only takes 'account_id' (Source).<br/>We need to change RPC or Input to accept 'category_id' (Nominal).
    
    API->>DB: INSERT INTO transactions (amount: 50, type: 'EXPENSE', <br/>account_id: Bank, account_in_id: Rent?)
    Note right of API: We need to store the Nominal Account ID.<br/>Proposed: Use 'account_in_id' for Nominal Account in Expenses?
    
    activate DB
    DB->>Trigger: AFTER INSERT
    activate Trigger
    
    Note right of Trigger: EVALUATE ACCOUNTS
    Trigger->>RealAcc: UPDATE balance -= 50
    Trigger->>NomAcc: UPDATE balance += 50
    Note right of Trigger: LOGIC:<br/>Real (Assets) decrease on Expense.<br/>Nominal (Expense) increase on Expense.
    
    Trigger-->>DB: Success
    deactivate Trigger
    DB-->>UI: Transaction Created
    deactivate DB

    %% INCOME SCENARIO
    Note over User, NomAcc: SCENARIO 2: INCOME (Sales $100)
    User->>UI: Selects "Sales" (Nominal) & "Cash" (Real)
    UI->>API: createIncome(amount: 100, account_id: Cash, category_id: Sales)
    
    API->>DB: INSERT INTO transactions (amount: 100, type: 'INCOME', <br/>account_id: Cash, account_out_id: Sales?)
    
    activate DB
    DB->>Trigger: AFTER INSERT
    activate Trigger
    
    Note right of Trigger: EVALUATE ACCOUNTS
    Trigger->>RealAcc: UPDATE balance += 100
    Trigger->>NomAcc: UPDATE balance -= 100
    Note right of Trigger: LOGIC:<br/>Real (Assets) increase on Income.<br/>Nominal (Revenue) decrease on Income.
    
    Trigger-->>DB: Success
    deactivate Trigger
    DB-->>UI: Transaction Created
    deactivate DB
```

## 2. BPMN Diagram: Nominal Category Management
This process map shows how Nominal Accounts are managed and filtered in the UI.

```mermaid
flowchart TD
    Start((Start)) --> Login
    Login --> Dashboard
    
    subgraph Configuration
        CreateAccount[Create Account]
        SelectType{Account Type?}
        
        CreateAccount --> SelectType
        SelectType -- "Bank / Cash / Wallet" --> MarkReal[is_nominal = FALSE]
        SelectType -- "Income / Expense" --> MarkNom[is_nominal = TRUE]
        
        MarkReal --> SaveAcc
        MarkNom --> SaveAcc
    end

    subgraph Transaction_UI [Transaction UI]
        UserAction{User Action}
        
        UserAction -- "New Expense" --> LoadExpenseUI
        UserAction -- "New Income" --> LoadIncomeUI
        
        %% EXPENSE FLOW
        LoadExpenseUI --> FetchAccsExp[Fetch Accounts]
        FetchAccsExp --> FilterRealExp[Source: Filter Real]
        FetchAccsExp --> FilterNomExp[Dest: Filter Nominal]
        
        FilterRealExp -- "is_nominal = FALSE" --> DropdownSourceExp[Payment Source]
        FilterNomExp -- "is_nominal = TRUE" --> DropdownCatExp[Expense Category]
        
        DropdownSourceExp --> InputAmountExp[Input Amount]
        DropdownCatExp --> InputAmountExp
        InputAmountExp --> SubmitExpense
        
        %% INCOME FLOW
        LoadIncomeUI --> FetchAccsInc[Fetch Accounts]
        FetchAccsInc --> FilterRealInc[Dest: Filter Real]
        FetchAccsInc --> FilterNomInc[Source: Filter Nominal]
        
        FilterRealInc -- "is_nominal = FALSE" --> DropdownDestInc[Deposit Account]
        FilterNomInc -- "is_nominal = TRUE" --> DropdownSourceInc[Income Category]
        
        DropdownDestInc --> InputAmountInc[Input Amount]
        DropdownSourceInc --> InputAmountInc
        InputAmountInc --> SubmitIncome
    end
    
    Dashboard --> Configuration
    Dashboard --> Transaction_UI
```

## 3. Updated System Map
Visualizing the relationship between Real and Nominal accounts.

```mermaid
classDiagram
    class Account {
        uuid id
        string name
        decimal balance
        boolean is_nominal
        string type
    }
    
    class RealAccount {
        type: CASH, BANK, WALLET
        is_nominal: false
        Behavior: Positive Balance = Asset
    }
    
    class NominalAccount {
        type: INCOME, EXPENSE
        is_nominal: true
        Behavior: Mirror of Real Assets
    }
    
    class Transaction {
        uuid id
        decimal amount
        string type
        uuid account_id (Real)
        uuid account_in_id (Nominal/Dest)
        uuid account_out_id (Nominal/Source)
    }
    
    Account <|-- RealAccount
    Account <|-- NominalAccount
    Transaction --> RealAccount : "Affects Balance"
    Transaction --> NominalAccount : "Mirrors Balance"
```
