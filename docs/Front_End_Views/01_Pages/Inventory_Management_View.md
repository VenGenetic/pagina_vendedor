# Inventory Management View

## Overview
The Inventory Management view is where users manage the master product list and handle stock replenishment. It is designed for high-volume data entry and accurate pricing control.

## Key Components

### 1. Product Master List
- **Table/Grid**: Displays SKU, Name, Category, Stock, and Prices.
- **Search & Filter**: Real-time filtering by SKU, Name, or Brand.
- **Status Badges**: Visual indicators for `Low Stock`, `Out of Stock`, or `Inactive`.

### 2. Restock Workflow (The Supply Module)
- **CSV Upload**: Bulk import functionality for new inventory batches.
- **Manual Entry**: Modal for adding single items with cost and quantity.
- **WAC Calculation**: Real-time preview of the new Weighted Average Cost before submission.

### 3. Price Proposal Review
- **Quarantine UI**: A side-panel or dedicated tab for items awaiting cost approval.
- **Comparison**: Shows "Current Cost" vs. "Proposed WAC".
- **Action Buttons**: `Approve` (triggers price update) or `Reject` (keeps old price).

## Technical Implementation
- **Logic**: Calls `process_restock_v2` RPC for backend processing, governed by [[WAC_Governance]].
- **Integrity**: Every stock change follows the [[Inventory_Integrity_Laws]] regarding immutable movements.
- **State**: Manages complex form state for multi-item restocks using `react-hook-form` or equivalent.

## User Interactions
- **Edit Product**: Inline editing of non-inventory fields (Description, Brand).
- **View History**: Modal showing the audit trail of movements for a specific SKU.
