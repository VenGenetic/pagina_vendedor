-- Create Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identity_document VARCHAR(50) UNIQUE NOT NULL, -- Cedula / RUC / Pasaporte
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(100),
  city VARCHAR(100),
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast search by identity document
CREATE INDEX IF NOT EXISTS idx_customers_identity ON customers(identity_document);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers USING gin(to_tsvector('spanish', name));

-- Add customer_id to sales table
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

-- Index for linking sales to customers
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);

-- Update updated_at trigger for customers
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
