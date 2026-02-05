---
type: part
status: active
impact: high
tags: [finance, logic, workflows]
---

# Transaction Workflows

## Description
The **Transaction Workflows** detail the specific step-by-step logic for processing financial events. It serves as the specification for the backend RPCs.

> [!NOTE]
> **BPMN Reference**: These workflows are formally modeled in [[Financial_Management_Process.bpmn]].

## Hierarchy
- **Parent**: [[Financial_Management]]
- **Children**: None

## Workflows

### 1. Process Sale (Double Entry)
**RPC**: `process_sale_transaction()`
**BPMN**: Sales_Process.bpmn → SubProcess_SaleExecution
- **Trigger**: User completes a sale at POS.
- **Steps**:
    1.  **Generate Group ID**: A unique `group_id` is generated to bind all entries.
    2.  **Entry A (Asset/Debit)**: Create `INCOME` transaction for the `Total Amount`.
        -   *Account*: Selected Cash/Bank Account (Reference: `account_id`).
    3.  **Entry B (Revenue/Credit)**: Create `INCOME` offsetting transaction.
        -   *Account*: `Ingresos por Ventas` (Nominal Revenue Account).
        -   *Amount*: Negative Value (Sign-based ledger).
    4.  **Inventory**: Create `inventory_movements` (Type: OUT, Reason: SALE).
    5.  **Link**: Associate Inventory Movement with Transaction ID via `group_id` context.

### 2. Reverse Transaction (Safe Reversal)
**RPC**: `rpc_reverse_transaction(original_transaction_id)`
**BPMN**: Financial_Management_Process.bpmn → Reversal Flow
- **Trigger**: User clicks "Refund/Reverse" on a past transaction.
- **Principles**: NEVER DELETE. GROUP MIRRORING.
- **Steps**:
    1.  **Validate Group** (Activity_ReverseTransactionRPC): Fetch `group_id` of the target transaction.
    2.  **Check is_reversed**: Ensure `is_reversed` is FALSE for the group.
    3.  **Create Mirror Group** (Activity_MirrorGroup):
        -   Generate new `reversal_group_id`.
        -   Iterate through EVERY transaction in the original `group_id`.
        -   **Clone & Invert**: Create new `REFUND` transaction with `-1 * Original Amount`.
        -   **Link**: Set `group_id` to `reversal_group_id` and `related_transaction_id` to original ID.
    4.  **Update Original**: Set `is_reversed = TRUE` for the *original* group.
    5.  **Restore Inventory** (Activity_RestoreInventory): If original was a Sale, create `IN` movements.
    6.  **Update Sale Header** (Activity_UpdateSaleHeader): Set `payment_status = 'REVERSED'`.
    7.  **Result**: Net Sum of (Original Group + Reversal Group) is 0.

### 3. Transfer Between Accounts (Saga Pattern)
**RPC**: `transfer_funds(source, destination, amount)`
**BPMN**: Financial_Management_Process.bpmn → Transfer Flow (Full Saga)
- **Trigger**: User initiates a transfer between accounts.
- **Pattern**: Full Saga with Compensation
- **Steps**:
    1.  **Initiate Transfer** (Activity_InitiateTransfer): User enters amount and accounts.
    2.  **Debit Source** (Activity_TransferSourceDebit): Subtract amount from source account.
    3.  **Credit Destination** (Activity_TransferDestCredit): Add amount to destination account.
    4.  **Error Handling**:
        -   *If Credit Fails* (BoundaryEvent_TransferFail): Trigger compensation.
        -   **Compensate** (Activity_CompensateTransfer): Reverse the source debit.
        -   *If Compensation Fails* (BoundaryEvent_CompensateFail): Escalate to manual intervention.
    5.  **Manual Intervention** (Activity_ManualIntervention): Admin must reconcile accounts manually.

> [!IMPORTANT]
> PostgreSQL's ACID transactions ensure atomicity at the database level. Both debit and credit occur in a single transaction, effectively providing saga compensation automatically. Manual intervention is only needed for external system failures.

## Error Codes
| Code | Name | Description |
|------|------|-------------|
| ERR_TRANSFER_001 | Transfer Failed | Credit leg of transfer failed |
| ERR_COMPENSATE_001 | Compensation Failed | Rollback of debit failed |

