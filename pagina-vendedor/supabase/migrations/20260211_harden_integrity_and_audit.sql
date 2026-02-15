-- Migration: Harden Integrity and Audit Trails
-- Date: 2026-02-11
-- Description: Enforces FKs for audit trails, hard-links sales to transactions, and prevents orphan inventory movements.

BEGIN;

-- ============================================
-- 1. ENFORCE USER AUDIT TRAILS (Task 1.2)
-- ============================================

-- inventory_movements.created_by
DO $$ 
BEGIN
    -- Check if it's already a foreign key to avoid errors
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'inventory_movements_created_by_fkey'
    ) THEN
        ALTER TABLE public.inventory_movements 
        ADD CONSTRAINT inventory_movements_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- transactions.created_by
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'transactions_created_by_fkey'
    ) THEN
        ALTER TABLE public.transactions 
        ADD CONSTRAINT transactions_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- sales.created_by
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'sales_created_by_fkey'
    ) THEN
        ALTER TABLE public.sales 
        ADD CONSTRAINT sales_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- price_proposals.applied_by
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'price_proposals_applied_by_fkey'
    ) THEN
        ALTER TABLE public.price_proposals 
        ADD CONSTRAINT price_proposals_applied_by_fkey 
        FOREIGN KEY (applied_by) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- 2. HARD-LINK SALES AND TRANSACTIONS (Task 1.1)
-- ============================================

-- Add transaction_id column to sales
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_transaction_id ON public.sales(transaction_id);

-- Backfill existing sales
-- We use a strict match between sale_number and transactions.reference_number
-- (Only for INCOME transactions with amount > 0 to match the main entry)
UPDATE public.sales s
SET transaction_id = t.id
FROM public.transactions t
WHERE s.sale_number = t.reference_number
  AND t.type = 'INCOME'
  AND t.amount > 0
  AND s.transaction_id IS NULL;

-- ============================================
-- 3. FIX ORPHAN INVENTORY MOVEMENTS (Task 1.3)
-- ============================================

-- We change inventory_movements.transaction_id constraint to prevent accidental 
-- deletion of history if a transaction is removed. 
-- However, since we want to prevent orphans, we'll enforce that movements 
-- stay even if the transaction is gone (SET NULL is already default), 
-- OR we use RESTRICT to prevent deleting the financial record if stock 
-- was already moved. 

DO $$ 
BEGIN
    -- Drop existing FK if any to re-apply with RESTRICT or stay with current logic 
    -- but we'll choose RESTRICT to favor audit integrity.
    ALTER TABLE public.inventory_movements 
    DROP CONSTRAINT IF EXISTS inventory_movements_transaction_id_fkey;
    
    ALTER TABLE public.inventory_movements 
    ADD CONSTRAINT inventory_movements_transaction_id_fkey 
    FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE RESTRICT;
END $$;

COMMIT;
