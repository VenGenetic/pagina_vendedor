-- ============================================
-- ADMINS TABLE
-- Store admin user profiles
-- ============================================

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID NOT NULL UNIQUE, -- Links to auth.users
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(200) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
CREATE INDEX IF NOT EXISTS idx_admins_auth_id ON admins(auth_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_admins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
CREATE TRIGGER update_admins_updated_at 
BEFORE UPDATE ON admins
  FOR EACH ROW 
EXECUTE FUNCTION update_admins_updated_at();

-- Enable RLS
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Admins can insert their own profile" ON admins;
CREATE POLICY "Admins can insert their own profile" 
  ON admins 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS "Admins can read their own profile" ON admins;
CREATE POLICY "Admins can read their own profile" 
  ON admins 
  FOR SELECT 
  TO authenticated 
  USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update their own profile" ON admins;
CREATE POLICY "Admins can update their own profile" 
  ON admins 
  FOR UPDATE 
  TO authenticated 
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());
