# Financial Management View

## Overview
The Financial Management view provides a deep dive into the company's ledger. It is focused on accountability, reconciliation, and fund movements.

## Key Components

### 1. Account Cards
- **Visual Balance**: Individual cards for each cash, bank, or digital wallet account.
- **Quick Actions**: Transfer funds, record external expense, or view specific ledger.

### 2. Transaction Ledger
- **Master List**: All financial movements with source account, amount, and reference number.
- **Type Isolation**: Tabs to view only `INCOME`, `EXPENSE`, or `TRANSFER`.
- **Reference Attachments**: Display linked invoice numbers or sale IDs.

### 3. Fund Transfer Modal
- **Source/Target Selection**: Dropdowns for selecting accounts.
## Technical Implementation
- **RPC Linkage**: Uses `transfer_funds` for inter-account movements, strictly following the [[Financial_Laws]].
- **Data Structure**: Transaction history records map to the `transactions` table defined in the [[Schema_Map]].
- **Security**: Restricted viewing based on user role (Admin vs. Sales).

## User Interactions
- **Transaction Reversal**: A button to trigger a `REFUND` transaction for an existing entry.
- **Export**: Generate CSV/PDF reports of the transaction history for accounting.
