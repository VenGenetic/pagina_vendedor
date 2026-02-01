-- ==========================================
-- SETUP USERS & ROLES TABLE
-- Run this in Supabase SQL Editor to fix "relation public.users does not exist"
-- ==========================================

-- 1. Create public.users table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT DEFAULT 'user', -- 'admin', 'user', 'manager', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS (Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. Policies (Allow users to read their own data)
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
CREATE POLICY "Users can view their own data" ON public.users
FOR SELECT USING (auth.uid() = id);

-- Allow Admins to view all (Optional, useful for management)
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users" ON public.users
FOR ALL USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

-- 4. Backfill from auth.users (Sync existing users)
INSERT INTO public.users (id, email, role)
SELECT id, email, 'user'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 5. PROMOTE ADMIN (maxprinton)
UPDATE public.users 
SET role = 'admin' 
WHERE email = 'maxprinton@gmail.com';

-- 6. TRIGGER: Auto-create user entry on Sign Up
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (new.id, new.email, 'user');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger definition
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 7. Grant Permissions to authenticated users
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
