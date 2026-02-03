# Dashboard View

## Overview
The Dashboard is the central cockpit of the VenGenetic system, providing a real-time snapshot of the business's health. It aggregates data from accounts, inventory, and transactions to present actionable KPIs.

## Key Components

### 1. Financial KPIs (Top Row)
- **Total Balance**: Displays the sum of balances across all "Real" accounts (excluding nominal/system accounts used for bookkeeping).
- **Today's Revenue**: Daily summation of `INCOME` transactions.
- **Monthly Profit**: A calculated metric comparing sales revenue vs. product cost (WAC).

### 2. Inventory Indicators
- **Low Stock Alerts**: Displays products where `current_stock <= min_stock_level`.
- **Total Portfolio Value**: Total valuation of current stock based on `cost_price`.

### 3. Recent Activity Feed
- A real-time list of the last 10-20 transactions, showing the account, amount, and description.

## Data Sources
- **Views**: Primarily uses `low_stock_products`, `inventory_valuation`, and `recent_activity` database views for optimized reading (See [[Schema_Map]]).
- **Hooks**: Uses `useDashboardStats` (or similar) to fetch and subscribe to real-time updates via Supabase.

## Governing Logic
The Dashboard metrics are governed by:
- [[Financial_Laws]]: For balance calculations and revenue tracking.
- [[Inventory_Integrity_Laws]]: For low stock alerts and portfolio valuation.

## User Interactions
- **Quick Links**: Navigation to Sale, Restock, and Transfer modals.
- **Filtering**: Date range filters for the activity feed and revenue charts.
