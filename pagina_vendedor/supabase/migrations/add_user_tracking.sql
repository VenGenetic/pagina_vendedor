
-- Add user tracking columns to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- Add user tracking columns to sales table (just in case)
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- Update existing records if possible (optional, might not have data)
-- This assumes there is an admins table linked to auth.users
-- UPDATE public.transactions t
-- SET created_by_name = a.full_name
-- FROM public.admins a
-- WHERE t.created_by = a.auth_id;
