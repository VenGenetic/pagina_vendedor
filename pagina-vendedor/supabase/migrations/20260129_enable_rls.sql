-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;

-- Create policies (assuming internal tool usage where authenticated users can do everything)
-- In a real multi-tenant app, you'd filter by user_id or organization_id.
-- Here we just check if the user is authenticated.

-- Accounts
CREATE POLICY "Enable all for authenticated users" ON accounts
FOR ALL USING (auth.role() = 'authenticated');

-- Products
CREATE POLICY "Enable all for authenticated users" ON products
FOR ALL USING (auth.role() = 'authenticated');

-- Transactions
CREATE POLICY "Enable all for authenticated users" ON transactions
FOR ALL USING (auth.role() = 'authenticated');

-- Inventory Movements
CREATE POLICY "Enable all for authenticated users" ON inventory_movements
FOR ALL USING (auth.role() = 'authenticated');

-- Sales
CREATE POLICY "Enable all for authenticated users" ON sales
FOR ALL USING (auth.role() = 'authenticated');

-- Sale Items
CREATE POLICY "Enable all for authenticated users" ON sale_items
FOR ALL USING (auth.role() = 'authenticated');

-- Admins
CREATE POLICY "Enable read for authenticated users" ON "admins"
FOR SELECT USING (auth.role() = 'authenticated');

-- Also enable for public read if needed for login check, or keep strict?
-- Usually public shouldn't see admins.
