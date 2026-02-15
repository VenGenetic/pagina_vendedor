# Double-Entry Bookkeeping Setup Walkthrough

## Status
**Implementation Complete. Migration Pending.**

The code for Double-Entry Bookkeeping (Sales) has been written and configurations updated. The database schema changes must be applied manually to proceed.

## Changes Implemented
1.  **Backend Migration** (`supabase/migrations/20260202_double_entry_sales.sql`)
    *   Adds `group_id` to `transactions`.
    *   Adds `is_nominal` to `accounts`.
    *   Updates `process_sale_transaction` RPC to create Debit/Credit pairs.
2.  **Frontend Logic** (`app/(protected)/transactions/sale/page.tsx`)
    *   Filters out "Nominal" accounts (like "Ingresos por Ventas") so users don't select them manually for payments.
3.  **Type Definitions** (`types/database.types.ts`)
    *   Updated to include new columns.

## Verification Steps (Required)
Since the agent cannot access the production database console directly, you must:

1.  **Apply Migration**:
    *   Open your Supabase Dashboard -> SQL Editor.
    *   Copy the content of `supabase/migrations/20260202_double_entry_sales.sql`.
    *   Run the script.

2.  **Run Verification Script**:
    *   Open a terminal in the project root.
    *   Run: `npx -y tsx scripts/test-double-entry.ts`
    *   Expected Output: `✅ Zero-Sum Check Passed.`

## Next Steps
*   Once verified for Sales, repeat the pattern for **Expenses** and **Purchases** (Part 2).
