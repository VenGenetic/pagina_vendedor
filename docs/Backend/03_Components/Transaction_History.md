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
    - `group_id` (UUID) - Links related splits (e.g., Sale + Cost of Goods Sold + Revenue).
    - `type` (INCOME, EXPENSE)
    - `category` (SALE, RESTOCK, ADJUSTMENT, REFUND, OPERATIONAL_EXPENSE)
    - `amount` (Decimal, always positive)
    - `account_id` (FK -> Accounts)
    - `is_reversed` (Boolean) - Flags transactions that have been effectively cancelled by a reversal.
    - `related_transaction_id` (UUID) - Links a reversal entry to the specific original transaction line it reverses.
    - `is_manual_adjustment` (Boolean) - Flags entries created via specific adjustment RPCs.
    - `transaction_date` (Indexed DESC)
    - `payment_method` (Enum: 'CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER')
    - `inventory_movement_id` (Optional FK -> inventory_movements)
    - `account_in_id` / `account_out_id` (FK -> accounts, used for Transfers)
    - `created_by` (UUID -> auth.users)
    - `created_by_name` (Text, denormalized for audit)
