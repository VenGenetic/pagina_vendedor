# Double-Entry Bookkeeping Upgrade Plan (Sales)

## Goal
Upgrade the Sales recording logic to use **Double-Entry Bookkeeping**.
Every sale will generate TWO transaction rows tied by a `group_id`:
1.  **Debit (Asset)**: The account receiving money (e.g., Bank/Cash). Positive Amount.
2.  **Credit (Revenue)**: The "Ingresos por Ventas" account. Negative Amount (as per prompt requirement, though conceptually Credit).

## 1. Schema Changes
We need to modify `transactions` and `accounts` tables.

### SQL Migration
```sql
-- 1. Add group_id to transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS group_id UUID;

-- 2. Add is_nominal to accounts
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS is_nominal BOOLEAN DEFAULT false;

-- 3. Seed "Ingresos por Ventas" Account
INSERT INTO accounts (name, type, balance, is_nominal, currency, is_active)
VALUES ('Ingresos por Ventas', 'CASH', 0.00, true, 'USD', true);
-- Note: 'type' must be one of the allowed check constraints. 'CASH' is a safe placeholder, 
-- or we might need to expand the enum if strictly necessary, but sticking to existing constraints is safer for now.
-- The prompt doesn't specify adding a new type, just is_nominal flag.

-- 4. Backfill legacy data
-- Assign a unique group_id to every existing transaction so strict typing doesn't break logic (optional but good practice)
UPDATE transactions 
SET group_id = uuid_generate_v4() 
WHERE group_id IS NULL;
```

## 2. RPC Update (`process_sale_transaction`)
We will replace the single `INSERT INTO transactions` with a Double Entry block.

### Logic Flow
1.  ... (Existing Stock & Customer Logic) ...
2.  **Generate `v_group_id`**.
3.  **Insert Asset Entry (Debit)**:
    *   `account_id`: User selected (p_account_id)
    *   `amount`: +p_total
    *   `group_id`: v_group_id
    *   `type`: 'INCOME'
4.  **Insert Revenue Entry (Credit)**:
    *   `account_id`: (Select ID of "Ingresos por Ventas")
    *   `amount`: -p_total
    *   `group_id`: v_group_id
    *   `type`: 'INCOME'
    *   *Note*: Using 'INCOME' effectively makes it a "Negative Income" transaction which is mathematically correct for 0-sum (Total + (-Total) = 0).

### Modified Code Snippet
```sql
  -- Generate Group ID
  v_group_id := uuid_generate_v4();

  -- 1. Asset Entry (Debit) -> Increases Bank/Cash
  INSERT INTO transactions (
    type, amount, description, account_id, payment_method, reference_number, notes, created_at, created_by, group_id
  ) VALUES (
    'INCOME', p_total, 'Venta ' || p_sale_number, p_account_id, v_payment_method_enum, p_sale_number, p_notes, NOW(), p_user_id, v_group_id
  );

  -- 2. Revenue Entry (Credit) -> Decreases "Ingresos por Ventas" (creating a credit balance)
  -- Find the Revenue Account ID
  SELECT id INTO v_revenue_account_id FROM accounts WHERE name = 'Ingresos por Ventas' LIMIT 1;
  
  INSERT INTO transactions (
    type, amount, description, account_id, payment_method, reference_number, notes, created_at, created_by, group_id
  ) VALUES (
    'INCOME', -p_total, 'Registro de Venta ' || p_sale_number, v_revenue_account_id, v_payment_method_enum, p_sale_number, p_notes, NOW(), p_user_id, v_group_id
  );
```

## 3. Frontend / UI Safety
*   Locate the account selector (likely fetching via Supabase client).
*   Update the query: `.select('*').eq('is_nominal', false)`

## 4. Verification Strategy
*   Script: `scripts/test-double-entry.ts`
*   Simulate a sale via `process_sale_transaction`.
*   Fetch `transactions` filtering by `reference_number`.
*   Verify 2 rows found.
*   Verify `group_id` matches.
*   Verify `sum(amount) == 0`.
