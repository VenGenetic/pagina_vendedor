-- Script to Inspect Active Triggers on Transactions Table
SELECT 
    trigger_name,
    event_manipulation,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'transactions'
ORDER BY trigger_name;

-- Check Account Types for the accounts involved in the screenshot
-- "Caja Chica" and "Caja Grande"
SELECT id, name, is_nominal, balance 
FROM accounts 
WHERE name ILIKE '%Caja%';
