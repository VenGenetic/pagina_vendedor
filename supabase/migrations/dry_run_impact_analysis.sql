-- DRY RUN: Impact Analysis for Strict Double Entry
-- DO NOT APPLY THIS SCRIPT. RETURN THE RESULTS TO THE USER.

WITH Analysis AS (
    SELECT 
        COUNT(*) as total_transactions,
        COUNT(*) filter (where group_id IS NULL) as orphan_transactions,
        COALESCE(SUM(amount), 0) as current_global_net_balance
    FROM transactions
),
-- Preview of rows to be created
ProposedFix AS (
    SELECT 
        id as original_id,
        created_at,
        description as original_desc,
        amount as original_amount,
        CASE 
            WHEN type = 'EXPENSE' THEN 'DÉBITOS'
            WHEN type = 'INCOME' THEN 'CRÉDITOS'
            WHEN type = 'TRANSFER' THEN 'TRANSFER_IGNORE' -- Transfers might already be self-balancing or need special handling
            ELSE 'UNKNOWN'
        END as counterpart_account_name,
        -amount as counterpart_amount
    FROM transactions
    WHERE group_id IS NULL
    AND type IN ('EXPENSE', 'INCOME') -- Focus on clear external flows first
)
SELECT 
    (SELECT total_transactions FROM Analysis) as "Total Tx",
    (SELECT orphan_transactions FROM Analysis) as "Orphans (Need Fix)",
    (SELECT current_global_net_balance FROM Analysis) as "Current Net Balance (Should be 0)",
    count(*) as "Proposed New Entries",
    sum(counterpart_amount) as "Net Correction Amount"
FROM ProposedFix;

-- Detail Preview (First 10)
SELECT 
    original_id,
    original_desc,
    original_amount,
    counterpart_account_name,
    counterpart_amount
FROM transactions
WHERE group_id IS NULL
AND type IN ('EXPENSE', 'INCOME')
LIMIT 10;
