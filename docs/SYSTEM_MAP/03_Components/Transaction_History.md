---
type: component
status: active
impact: financial
tags: [finance, data]
---

# Transaction History

## Description
The **Transaction History** component is the immutable record of all financial movements. It is the "Journal" in accounting terms. It now supports **Double-Entry** grouping, ensuring that every debit has a credit.

## Hierarchy
- **Parent**: [[General_Ledger]]
- **Children**: None

## Data Structure
- **Entity**: `transactions` table.
- **Key Fields**:
    - `id` (UUID)
    - `group_id` (UUID) - **New**: Links related splits (e.g., Sale + Cost of Goods Sold).
    - `type` (INCOME, EXPENSE)
    - `category` (SALE, RESTOCK, ADJUSTMENT, REFUND, OPERATIONAL_EXPENSE)
    - `amount` (Decimal, always positive)
    - `account_id` (FK -> Accounts)
    - `is_reversal` (Boolean) - **New**: Flags corrective entries.
    - `reversal_of_id` (UUID) - **New**: Links to the original transaction ID being reversed.
    - `transaction_date` (Indexed DESC)
    - `payment_method` (Enum: 'CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER')
    - `inventory_movement_id` (Optional FK -> inventory_movements)
    - `account_in_id` / `account_out_id` (FK -> accounts, used for Transfers)
    - `created_by` (UUID -> auth.users)
    - `created_by_name` (Text, denormalized for audit)
