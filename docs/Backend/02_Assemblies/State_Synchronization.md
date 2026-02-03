---
type: assembly
status: active
impact: medium
tags: [frontend, logic, sync]
---

# State Synchronization

## Description
The **State Synchronization** assembly governs the bridge between the **Database Reality** (Supabase) and the **User Perception** (React components). It uses React Query to ensure that the UI is "eventually consistent" and highly responsive.

## Hierarchy
- **Parent**: [[Motorcycle_Parts_ERP]]
- **Children**: None

## The Logic Loop (Mutation -> Invalidation -> Sync)

The fundamental logic of the frontend is the **Invalidation Loop**:
1.  **Action**: User performs an action (e.g., `useCreateSale`).
2.  **Commit**: The `Mutation` executes the RPC in the database.
3.  **Success Invalidation**: Upon success, `onSuccess` triggers a wide `queryClient.invalidateQueries`.
4.  **Re-Sync**: Every active hook (e.g., `useAccounts`, `useDashboardStats`) notices its key is stale and fetches the new data from the DB.

## Governing Rules

### 1. The Rule of Stale-Time
Data is categorized by its "Volatility":
-   **Critical Volatility (Balances)**: `staleTime` is low (30s) or even 0. We need to know where the money is *now*.
-   **High Volatility (Stock)**: `staleTime` is 5 minutes. High enough for performance, low enough to avoid selling the same part twice.
-   **Low Volatility (Products)**: Long cache times.

### 2. The Rule of Nominal Segregation
The UI must filter the database.
-   **Filter**: All hooks fetching accounts MUST append `.eq('is_nominal', false)`.
-   **Intent**: Nominal accounts (accounting shadows) are never shown to the end-user to keep the interface simple and human-centric.

### 3. The Centralized Mutation Principle
Workflows (Sales, Purchases, Restocks) should never happen via direct `insert` in components.
-   **Rule**: Always use the dedicated hooks in `hooks/use-queries.ts`, which wrap the services in `lib/services/`.
-   **Intent**: To ensure the Invalidation Loop is never accidentally bypassed.

## Dependencies
- **React Query**: The engine of the sync.
- **Supabase Client**: The communication channel.
- **queryKeys**: The naming convention in `use-queries.ts` is the wiring that connects the mutations to the views.
