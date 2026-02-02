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
    2.  **Entry A (Real)**: Create `INCOME` transaction for the `Total Amount`.
        -   *Account*: Selected Cash/Bank Account.
    3.  **Entry B (Nominal)**: Create `INCOME` offset (Credit) to balance the ledger.
        -   *Account*: `CRÉDITOS` (Revenue).
        -   *Constraint*: Sum of A + B MUST be 0.
    4.  **Inventory**: Create `inventory_movements` (Type: OUT, Reason: SALE).
    5.  **Link**: Associate Inventory Movement with Transaction ID.

### 2. Reverse Transaction (Safe Reversal)
**RPC**: `reverse_transaction(original_transaction_id)`
- **Trigger**: User clicks "Refund/Reverse" on a past transaction.
- **Principles**: NEVER DELETE. GROUP MIRRORING.
- **Steps**:
    1.  Fetch `group_id` of the target transaction.
    2.  Validate entire group is balanced and not already reversed.
    3.  **create Mirror Group**:
        -   Generate new `reversal_group_id`.
        -   For EACH transaction in the original group:
            -   Create new transaction.
            -   Type: `REFUND`.
            -   Amount: Inverted ( -1 * Original ).
            -   Group ID: `reversal_group_id`.
    4.  **Inventory**: Restore items if linked to a Sale.
    5.  **Validation**: Commit only if Reversal Group Sum = 0.
