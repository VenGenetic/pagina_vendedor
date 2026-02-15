-- Create Suppliers Table and Functions
-- This allows storing and managing supplier information

-- 1. Create suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  contact_person VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  tax_id VARCHAR(50), -- RUC o identificación fiscal
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create index for faster searches
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);

-- 3. Add supplier_id to transactions table (optional reference)
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);

-- 4. Create function to add or get supplier
CREATE OR REPLACE FUNCTION add_or_get_supplier(
  p_name VARCHAR(255),
  p_contact_person VARCHAR(255) DEFAULT NULL,
  p_phone VARCHAR(50) DEFAULT NULL,
  p_email VARCHAR(255) DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_tax_id VARCHAR(50) DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_supplier_id UUID;
BEGIN
  -- Check if supplier exists
  SELECT id INTO v_supplier_id 
  FROM suppliers 
  WHERE LOWER(name) = LOWER(p_name);
  
  -- If exists, return the ID
  IF v_supplier_id IS NOT NULL THEN
    RETURN v_supplier_id;
  END IF;
  
  -- If not exists, create new supplier
  INSERT INTO suppliers (
    name,
    contact_person,
    phone,
    email,
    address,
    tax_id,
    notes,
    is_active
  ) VALUES (
    p_name,
    p_contact_person,
    p_phone,
    p_email,
    p_address,
    p_tax_id,
    p_notes,
    true
  ) RETURNING id INTO v_supplier_id;
  
  RETURN v_supplier_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Create function to update supplier
CREATE OR REPLACE FUNCTION update_supplier(
  p_id UUID,
  p_name VARCHAR(255) DEFAULT NULL,
  p_contact_person VARCHAR(255) DEFAULT NULL,
  p_phone VARCHAR(50) DEFAULT NULL,
  p_email VARCHAR(255) DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_tax_id VARCHAR(50) DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  UPDATE suppliers
  SET
    name = COALESCE(p_name, name),
    contact_person = COALESCE(p_contact_person, contact_person),
    phone = COALESCE(p_phone, phone),
    email = COALESCE(p_email, email),
    address = COALESCE(p_address, address),
    tax_id = COALESCE(p_tax_id, tax_id),
    notes = COALESCE(p_notes, notes),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = NOW()
  WHERE id = p_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Proveedor actualizado exitosamente'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- 6. Enable RLS (Row Level Security) - Optional
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- 7. Create policy to allow authenticated users to read suppliers
CREATE POLICY "Allow authenticated users to read suppliers"
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (true);

-- 8. Create policy to allow authenticated users to insert suppliers
CREATE POLICY "Allow authenticated users to insert suppliers"
  ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 9. Create policy to allow authenticated users to update suppliers
CREATE POLICY "Allow authenticated users to update suppliers"
  ON public.suppliers
  FOR UPDATE
  TO authenticated
  USING (true);

-- 10. Create view for supplier statistics (optional)
CREATE OR REPLACE VIEW supplier_stats AS
SELECT 
  s.id,
  s.name,
  s.is_active,
  COUNT(DISTINCT t.id) as total_transactions,
  COALESCE(SUM(t.amount), 0) as total_spent,
  MAX(t.created_at) as last_transaction_date
FROM suppliers s
LEFT JOIN transactions t ON s.id = t.supplier_id
GROUP BY s.id, s.name, s.is_active;

-- Grant access to the view
GRANT SELECT ON supplier_stats TO authenticated;
