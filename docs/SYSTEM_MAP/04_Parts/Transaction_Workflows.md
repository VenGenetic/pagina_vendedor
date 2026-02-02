---
type: part
status: active
impact: high
tags: [finance, logic, workflows]
---

# Transaction Workflows

## Description
The **Transaction Workflows** detail the specific step-by-step logic for processing financial events. It serves as the specification for the backend RPCs.

## Hierarchy
- **Parent**: [[Transaction_History]]
- **Children**: None

## Workflows

### 1. Process Sale (Double Entry)
**RPC**: `process_sale_transaction()`
- **Trigger**: User completes a sale at POS.
- **Steps**:
    1.  Generate a unique `group_id`.
    2.  **Entry A (Debit)**: Create `INCOME` transaction for the `Total Amount`.
        -   *Account*: Selected Cash/Bank Account.
    3.  **Entry B (Credit - Optional)**: (Future) Create an offset entry if strictly following accounting rules, but for now, we track the Income.
    4.  **Inventory**: Create `inventory_movements` (Type: OUT, Reason: SALE).
    5.  **Link**: Associate Inventory Movement with Transaction ID.

### 2. Reverse Transaction (Safe Reversal)
**RPC**: `reverse_transaction(original_transaction_id)`
- **Trigger**: User clicks "Refund/Reverse" on a past transaction.
- **Principles**: NEVER DELETE. ALWAYS OFFSET.
- **Steps**:
    1.  Fetch original transaction details.
    2.  Validate it hasn't already been reversed.
    3.  Create **Reversal Transaction**:
        -   `Type`: Opposite of Original (INCOME -> EXPENSE).
        -   `Amount`: Same as Original.
        -   `Account`: Same as Original.
        -   `is_reversal`: true.
        -   `reversal_of_id`: Original ID.
    4.  If Original was linked to Inventory (e.g., Sale):
        -   Create "Return to Stock" movement (Type: IN, Reason: RETURN).
    5.  Update Balances (handled automatically by Triggers).
