# Restock Workflow (Supply Module)

## Overview
The **Restock Workflow**, internally known as the **Supply Module** (Modulo de Surtir), is the primary entry point for new inventory. It handles the transition from purchase to physical stock.

## Key Components

### 1. The CSV Batch Processor
The most efficient way to restock.
- **Function**: Parses vendor CSV files to map SKU, Quantity, and New Cost.
- **Preview**: Displays potential WAC changes before committing.

### 2. Manual Restock Interface
For quick additions or small batches.
- **Workflow**: Search Product -> Enter Quantity -> Enter Unit Cost -> Select Payment Account.

### 3. Price Proposal Quarantine
Crucial for margin protection.
- **Logic**: Any cost change triggers a `price_proposal`.
- **Approval**: New stock is physically added, but `selling_price` updates wait for admin approval (See [[WAC_Governance]]).

## Technical Implementation
- **RPC**: Uses `process_restock_v2`.
- **Ledger**: Creates `IN` movements in `inventory_movements`.
- **Accounting**: Creates `EXPENSE` (or `TRANSFER` if from internal stock) in `transactions`.

## Connections
- **Backend**: Governed by [[WAC_Governance]] and [[Inventory_Integrity_Laws]].
- **UI**: Accessed via the [[Inventory_Management_View]].

## User Scenarios
- **Price Hike**: Vendor increases cost. System flags a low margin and proposes a new selling price.
- **Corrections**: Adjusting stock after a physical count (See [[Inventory_Integrity_Laws]]).
