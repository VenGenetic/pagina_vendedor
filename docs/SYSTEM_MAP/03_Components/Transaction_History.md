---
type: component
status: active
impact: financial
tags: [finance, data]
---

# Transaction History

## Description
The **Transaction History** is the chronological ledger of all financial movements. It is the raw data used to construct the General Ledger's state.

## Hierarchy
- **Parent**: [[General_Ledger]]
- **Children**: None

## Data Structure
- **Entity**: `transactions` table.
- **Key Fields**:
    - `type` (Enum: 'INCOME', 'EXPENSE')
    - `amount` (Decimal 12,2, constraint > 0)
    - `account_id` (FK -> accounts)
    - `transaction_date` (Indexed DESC)
    - `payment_method` (Enum: 'CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER')
    - `inventory_movement_id` (Optional FK -> inventory_movements)
    - `account_in_id` / `account_out_id` (FK -> accounts, used for Transfers)
    - `created_by` (UUID -> auth.users)
    - `created_by_name` (Text, denormalized for audit)
