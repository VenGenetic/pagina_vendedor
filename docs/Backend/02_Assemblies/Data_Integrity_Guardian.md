---
type: assembly
status: active
impact: high
tags: [security, logic, database]
---

# Data Integrity Guardian

## Description
The **Data Integrity Guardian** assembly represents the collection of database-level triggers and RPCs that enforce the system's "Physical Laws." It ensures that no matter what the UI attempts, the data remains mathematically valid.

## Hierarchy
- **Parent**: [[Motorcycle_Parts_ERP]]
- **Children**: [[General_Ledger]]

## Core Logic & Laws

### 1. The Law of the Shadow (Auto-Balance)
The system enforces strict **Double-Entry** at the core.
- **Rule**: No transaction can exist alone.
- **Logic**: The `auto_balance_transaction_trigger` detects any single-entry `INCOME` or `EXPENSE`. It immediately spawns a "Mirror" transaction in a Nominal account (`DÉBITOS` or `CRÉDITOS`) with an inverted sign.
- **Result**: The Sum of the system is ALWAYS zero (`Assets + Expenses = Income + Equity`).

### 2. The Law of Signed Ledger (Add-Only)
The system avoids complex "subtract" logic in the database to prevent sign errors.
- **Rule**: `New_Balance = Current_Balance + Transaction_Amount`.
- **Implementation**: 
    -   `EXPENSE` / `TRANSFER (Source)` = **Negative Numbers**.
    -   `INCOME` / `TRANSFER (Dest)` = **Positive Numbers**.
- **Result**: The `update_account_balance` trigger is a simple two-line function that adds the `NEW.amount` on insert.

### 3. The Law of Tiered Oblivion (System Resets)
The system provides controlled ways to "Recalibrate" without breaking integrity.
- **Tier 1 (History Reset)**: Clears `transactions` but preserves `inventory_movements` as static adjustments.
- **Tier 3 (Factory Reset)**: `TRUNCATE CASCADE` - completely resets the universe.
- **Constraint**: During resets, triggers must be **DISABLED** to prevent "echoes" (auto-balancing deletions of deletions).

## Governing Rules
1.  **Immutability**: Once written, a record's amount should not be changed. Corrections must happen via **Reversals** (`REFUND` type transactions).
2.  **Referential Integrity**: A transaction cannot exist without an owner (`created_by`) or a valid `account_id`.

## Dependencies
- **RPC Functions**: Most critical logic is isolated in PL/pgSQL to avoid row conflicts.
- **nominal accounts**: The system will break if the accounts named `DÉBITOS` or `CRÉDITOS` are deleted or renamed.
