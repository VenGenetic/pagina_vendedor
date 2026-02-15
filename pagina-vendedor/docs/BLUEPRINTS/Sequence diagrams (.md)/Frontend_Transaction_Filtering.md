# Frontend Transaction Filtering Logic

## Overview
This diagram illustrates how the frontend fetches transactions and filters out the system-generated "Contrapartida" (Double Entry) records to show a clean history to the user, while maintaining the accounting integrity in the backend.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Page as ExpensePage (Frontend)
    participant Hook as useRecentExpenses (Hook)
    participant DB as Supabase DB

    User->>Page: Views "New Expense" Page
    Page->>Hook: Call useRecentExpenses()
    
    Hook->>DB: SELECT * FROM transactions <br/>WHERE type='EXPENSE'
    
    activate DB
    Note right of DB: Database contains PAIRS:<br/>1. Actual Expense (+Amount)<br/>2. Contrapartida (-Amount, "Auto-Generated...")
    DB-->>Hook: Return ALL Expense Records (Pairs)
    deactivate DB

    activate Hook
    Note over Hook: FILTERING LOGIC
    Hook->>Hook: Filter records:
    Hook->>Hook: Exclude if description contains "(Contrapartida)"
    Hook->>Hook: Exclude if notes contains "Double Entry"
    
    Hook-->>Page: Return Clean List (User's Expenses Only)
    deactivate Hook

    Page->>User: Display Sanitized History
    
    Note over User: User sees only "Real" expenses<br/>(No duplicate negative/positive entries)
```
