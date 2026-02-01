---
type: part
status: active
impact: high
tags: [finance, logic, workflows]
---

# Transaction Workflows

## Description
This file translates the complex creation logic for Income, Expense, and Purchase transactions found in the frontend application layer.

## Hierarchy
- **Parent**: [[General_Ledger]]
- **Children**: None

## 1. Income Creation (`income/page.tsx`)
### Logic
-   **Profit Calculation**: The system calculates "Real Profit" for the user interface:
    > $$ Profit = SaleValue - CostValue - ShippingValue $$
-   **Auto-Account Selection**: 
    -   If the selected *Income Account* name contains **"Efectivo"**, the Payment Method is automatically set to `'EFECTIVO'`.
    -   Otherwise, it defaults to `'TRANSFERENCIA'`.
-   **Validation**:
    -   If `CostValue > 0`, a `CostAccount` MUST be selected.
    -   If `ShippingValue > 0`, a `ShippingAccount` MUST be selected.

## 2. Expense Creation (`expense/page.tsx`)
### Logic
-   **Mapping**: The frontend maps English UI values to Spanish Backend Enums:
    -   'CASH' -> 'EFECTIVO'
    -   'CARD' -> 'TARJETA'
    -   'TRANSFER' -> 'TRANSFERENCIA'
    -   'CHECK' -> 'CHEQUE'
    -   'OTHER' -> 'OTRO'
-   **Destructive Action**: Deleting an expense triggers a reverse flow: The amount is *credited back* to the account balance.

## 3. Purchase Creation & CSV Import (`purchase/page.tsx`)
### Pricing Logic
-   **Selling Price Calculation**:
    > $$ SellingPrice = Cost \times (1 + \frac{IVA}{100}) \times (1 + \frac{Margin}{100}) $$
    -   *Defaults*: IVA = 15%, Margin = 65%.

### CSV Import Workflow
1.  **Parsing**: Reads CSV with columns `SKU, Description, Quantity, Cost`.
    -   *Heuristic*: Skips header if first line contains "sku".
    -   *Separator*: Auto-detects `,` or `;`.
2.  **Conflict Detection**:
    -   Checks if imported SKU already exists in the *current cart* (not database).
    -   **Resolution Strategies**:
        -   `Merge`: Sum quantities, use NEW unit cost.
        -   `Replace`: Discard old item, use new item.
        -   `Keep`: Keep existing item, discard new.
3.  **New Product Creation**:
    -   If imported SKU does not exist in DB, prompts to create.
    -   *Logic Error/Note*: If description is empty in CSV, falls back to `Nuevo Producto {SKU}`.

### Free Entry Logic
-   **Flag**: `isFreeEntry` (Ingreso sin costo).
-   **Effect**:
    -   If `true`, `account_id` is NOT required.
    -   Total cost to business is $0.00.
    -   Inventory Value increases, but Cash Balance remains unchanged.
