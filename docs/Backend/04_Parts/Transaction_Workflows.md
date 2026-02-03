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
- **Parent**: None
- **Children**: None

## Workflows


### 1. Process Sale (Double Entry)
**RPC**: `process_sale_transaction()`
- **Trigger**: User completes a sale at POS.
- **Steps**:
    1.  **Generate Group ID**: A unique `group_id` is generated to bind all checks.
    2.  **Entry A (Asset/Debit)**: Create `INCOME` transaction for the `Total Amount`.
        -   *Account*: Selected Cash/Bank Account (Reference: `account_id`).
    3.  **Entry B (Revenue/Credit)**: Create `INCOME` offsetting transaction.
        -   *Account*: `Ingresos por Ventas` (Nominal Revenue Account).
        -   *Amount*: Negative Value (Sign-based ledger).
    4.  **Inventory**: Create `inventory_movements` (Type: OUT, Reason: SALE).
    5.  **Link**: Associate Inventory Movement with Transaction ID via `group_id` context.

### 2. Reverse Transaction (Safe Reversal)
**RPC**: `rpc_reverse_transaction(original_transaction_id)`
- **Trigger**: User clicks "Refund/Reverse" on a past transaction.
- **Principles**: NEVER DELETE. GROUP MIRRORING.
- **Steps**:
    1.  Fetch `group_id` of the target transaction.
    2.  **Validation**: Ensure group exists and `is_reversed` is FALSE.
    3.  **Create Mirror Group**:
        -   Generate new `reversal_group_id`.
        -   Iterate through EVERY transaction in the original `group_id`.
        -   **Clone & Invert**: Create new `REFUND` transaction with `-1 * Original Amount`.
        -   **Link**: Set `group_id` to `reversal_group_id` and `related_transaction_id` to original ID.
    4.  **Update Original**: Set `is_reversed = TRUE` for the *original* group.
    5.  **Inventory**: Call `restore_inventory_for_reversal` to create standard `IN` movements if original was a Sale.
    6.  **Result**: Net Sum of (Original Group + Reversal Group) is 0.
