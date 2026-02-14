-- ============================================
-- ERP/Inventory Management System - Database Schema
-- For Motorcycle Spare Parts Business
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ACCOUNTS TABLE
-- Represents different cash/bank accounts
-- ============================================
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('CASH', 'BANK', 'DIGITAL_WALLET')),
  balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT positive_balance CHECK (balance >= 0)
);

-- Index for faster lookups
CREATE INDEX idx_accounts_active ON accounts(is_active) WHERE is_active = true;

-- ============================================
-- CUSTOMERS TABLE
-- Master list of customers
-- ============================================
CREATE TABLE customers (
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

-- Indexes
CREATE INDEX idx_customers_identity ON customers(identity_document);
CREATE INDEX idx_customers_name ON customers USING gin(to_tsvector('spanish', name));

-- ============================================
-- PRODUCTS TABLE
-- Master inventory list for spare parts
-- ============================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  brand VARCHAR(100),
  
  -- Pricing
  cost_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  
  -- Stock management
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER DEFAULT 5,
  max_stock_level INTEGER DEFAULT 100,
  
  -- Media
  image_url TEXT,
  additional_images TEXT[], -- Array of image URLs
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT positive_stock CHECK (current_stock >= 0),
  CONSTRAINT positive_prices CHECK (cost_price >= 0 AND selling_price >= 0)
);

-- Indexes for performance
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('spanish', name));
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(is_active) WHERE is_active = true;
CREATE INDEX idx_products_low_stock ON products(current_stock) WHERE current_stock <= min_stock_level;

-- ============================================
-- TRANSACTIONS TABLE
-- Financial records for all money movements
-- ============================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Transaction details
  type VARCHAR(20) NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT NOT NULL,
  
  -- Account relationship
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  
  -- Optional: link to inventory movement if it's a sale
  inventory_movement_id UUID,
  
  -- Payment method (useful for reconciliation)
  payment_method VARCHAR(50) CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER')),
  
  -- Reference number (invoice, receipt, etc.)
  reference_number VARCHAR(100),
  
  -- Metadata
  transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,
  
  CONSTRAINT positive_amount CHECK (amount > 0)
);

-- Indexes
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX idx_transactions_inventory ON transactions(inventory_movement_id) WHERE inventory_movement_id IS NOT NULL;

-- ============================================
-- INVENTORY_MOVEMENTS TABLE
-- Ledger for ALL stock changes (NEVER update stock directly)
-- ============================================
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Product reference
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  
  -- Movement details
  type VARCHAR(20) NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
  quantity_change INTEGER NOT NULL,
  
  -- Price at time of movement (for valuation)
  unit_price DECIMAL(12, 2),
  total_value DECIMAL(12, 2),
  
  -- Transaction linkage (for sales/purchases)
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  
  -- Reason/description
  reason VARCHAR(50) NOT NULL DEFAULT 'OTHER' CHECK (reason IN ('SALE', 'PURCHASE', 'RETURN', 'DAMAGE', 'THEFT', 'COUNT_ADJUSTMENT', 'OTHER')),
  notes TEXT,
  
  -- Metadata
  movement_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID, -- Can link to auth.users if needed
  
  CONSTRAINT quantity_sign_matches_type CHECK (
    (type = 'IN' AND quantity_change > 0) OR 
    (type = 'OUT' AND quantity_change < 0) OR 
    (type = 'ADJUSTMENT')
  )
);

-- Indexes
CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_type ON inventory_movements(type);
CREATE INDEX idx_inventory_movements_date ON inventory_movements(movement_date DESC);
CREATE INDEX idx_inventory_movements_transaction ON inventory_movements(transaction_id) WHERE transaction_id IS NOT NULL;

-- ============================================
-- SALES TABLE
-- Aggregate sales records (optional, for detailed sales tracking)
-- ============================================
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Sale information
  sale_number VARCHAR(50) UNIQUE NOT NULL,
  
  -- Customer Link (Optional FK)
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Snapshot of customer data (for history)
  customer_name VARCHAR(200),
  customer_phone VARCHAR(20),
  customer_email VARCHAR(100),
  
  -- Totals
  subtotal DECIMAL(12, 2) NOT NULL,
  tax DECIMAL(12, 2) DEFAULT 0.00,
  discount DECIMAL(12, 2) DEFAULT 0.00,
  total DECIMAL(12, 2) NOT NULL,
  
  -- Payment
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  payment_status VARCHAR(20) DEFAULT 'PAID' CHECK (payment_status IN ('PAID', 'PENDING', 'PARTIAL', 'CANCELLED', 'REVERSED')),
  
  -- Metadata
  sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,
  
  CONSTRAINT positive_totals CHECK (subtotal >= 0 AND total >= 0)
);

-- Indexes
CREATE INDEX idx_sales_number ON sales(sale_number);
CREATE INDEX idx_sales_date ON sales(sale_date DESC);
CREATE INDEX idx_sales_account ON sales(account_id);
CREATE INDEX idx_sales_status ON sales(payment_status);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);

-- ============================================
-- SALE_ITEMS TABLE
-- Line items for each sale
-- ============================================
CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  
  -- Item details
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  discount DECIMAL(12, 2) DEFAULT 0.00,
  subtotal DECIMAL(12, 2) NOT NULL,
  
  -- Link to inventory movement
  inventory_movement_id UUID REFERENCES inventory_movements(id),
  
  CONSTRAINT positive_quantity CHECK (quantity > 0),
  CONSTRAINT positive_price CHECK (unit_price >= 0)
);

-- Indexes
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update product stock based on inventory movements
CREATE OR REPLACE FUNCTION update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products 
  SET current_stock = current_stock + NEW.quantity_change,
      updated_at = NOW()
  WHERE id = NEW.product_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update stock when inventory movement is created
CREATE TRIGGER trigger_update_product_stock
  AFTER INSERT ON inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION update_product_stock();

-- Function to update account balance based on transactions
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'INCOME' THEN
    UPDATE accounts 
    SET balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_id;
  ELSIF NEW.type = 'EXPENSE' THEN
    UPDATE accounts 
    SET balance = balance - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.account_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update account balance
CREATE TRIGGER trigger_update_account_balance
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_account_balance();

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View: Low stock products
CREATE OR REPLACE VIEW low_stock_products AS
SELECT 
  p.id,
  p.sku,
  p.name,
  p.current_stock,
  p.min_stock_level,
  p.selling_price,
  p.category,
  p.brand
FROM products p
WHERE p.current_stock <= p.min_stock_level
  AND p.is_active = true
ORDER BY p.current_stock ASC;

-- View: Inventory valuation
CREATE OR REPLACE VIEW inventory_valuation AS
SELECT 
  p.id,
  p.sku,
  p.name,
  p.current_stock,
  p.cost_price,
  p.selling_price,
  (p.current_stock * p.cost_price) AS total_cost_value,
  (p.current_stock * p.selling_price) AS total_selling_value,
  (p.current_stock * (p.selling_price - p.cost_price)) AS potential_profit
FROM products p
WHERE p.is_active = true;

-- View: Recent activity (last 50 transactions)
CREATE OR REPLACE VIEW recent_activity AS
SELECT 
  t.id,
  t.type,
  t.amount,
  t.description,
  t.transaction_date,
  a.name AS account_name,
  t.payment_method,
  t.reference_number
FROM transactions t
JOIN accounts a ON t.account_id = a.id
ORDER BY t.transaction_date DESC
LIMIT 50;
