---
type: subsystem
status: active
impact: high
tags: [sales, customers, crm]
---

# Sales and Customers

## Description
The **Sales and Customers** subsystem manages the point-of-sale interactions and the customer database. It acts as the bridge between the physical inventory and the financial ledger, ensuring that every sale is recorded with full context (who, what, when, how much).

## Hierarchy
- **Parent**: [[Motorcycle_Parts_ERP]]
- **Children**:
    - [[Point_of_Sale]]
    - [[Customer_Directory]]

## Core Responsibilities
1.  **Customer Profiles**: Managing unique identities via `identity_document` (Cédula/RUC).
2.  **Sales Processing**: Orchestrating the sale via the `process_sale_transaction` RPC.
3.  **Historical Preservation**: Enforcing the "Snapshot Rule" to preserve data integrity over time.

## Data Logic

### 1. Customer Management (Upsert)
The system treats customer data as "living". When a sale occurs:
-   **If the customer is new**: A new record is created in `customers`.
-   **If the customer exists**: The record is updated (upserted) with the latest details provided at the point of sale.
-   **Key Constraint**: `identity_document` is the unique key.

### 2. The Snapshot Rule
To prevent historical data corruption (e.g., if a customer changes their name or address years later), the system creates a **Snapshot** at the moment of sale.
-   **Living Data**: The `customers` table holds the *current* contact info.
-   **Historical Data**: The `sales` table stores a hard copy of `customer_name`, `customer_phone`, etc., as they were *at the time of the transaction*.
-   **Why**: This ensures that invoices and purchase history remain historically accurate even if the underlying profile changes.

### 3. Sales Lifecycle
-   **Draft**: (Frontend only) The cart being built.
-   **Paid**: Validated and committed to the database.
-   **Cancelled**: Reverted via `rpc_reverse_transaction` (Safe Reversal). A sale is never deleted; it is flagged as cancelled and reversed.
