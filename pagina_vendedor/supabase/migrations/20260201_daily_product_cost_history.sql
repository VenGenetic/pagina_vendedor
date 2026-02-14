-- Migration: support product cost history with automatic tax calculation
-- Description: Adds product_cost_history table and triggers to log changes and calculate post-tax cost.

-- 1. Create product_cost_history table
CREATE TABLE IF NOT EXISTS product_cost_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    cost_before_tax NUMERIC(10, 2) NOT NULL,
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0, -- Stored as decimal (e.g., 0.15 for 15%)
    cost_after_tax NUMERIC(10, 2) NOT NULL,
    active_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    active_until TIMESTAMP WITH TIME ZONE, -- Null means it is the current cost
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups by product
CREATE INDEX IF NOT EXISTS idx_product_cost_history_product_id ON product_cost_history(product_id);
CREATE INDEX IF NOT EXISTS idx_product_cost_history_active_range ON product_cost_history(product_id, active_from, active_until);

-- Enable RLS
ALTER TABLE product_cost_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cost history"
    ON product_cost_history FOR SELECT
    TO authenticated
    USING (true);

-- 2. Function to automatically log cost changes and calculate tax
CREATE OR REPLACE FUNCTION log_product_cost_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tax_rate NUMERIC;
    v_system_settings JSONB;
BEGIN
    -- Only proceed if cost_price has changed or it's a new insert
    IF (TG_OP = 'UPDATE' AND OLD.cost_price = NEW.cost_price) THEN
        RETURN NEW;
    END IF;

    -- Fetch current tax rate from system_settings
    -- Assuming key 'financial_config' has structure {"tax_rate": 0.15}
    BEGIN
        SELECT value INTO v_system_settings
        FROM system_settings
        WHERE key = 'financial_config';
        
        IF v_system_settings IS NULL THEN
            v_tax_rate := 0; -- Default to 0 if not set
        ELSE
            v_tax_rate := COALESCE((v_system_settings->>'tax_rate')::NUMERIC, 0);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_tax_rate := 0; -- Fallback
    END;

    -- Close the previous history record if it exists (for UPDATE)
    IF TG_OP = 'UPDATE' THEN
        UPDATE product_cost_history
        SET active_until = NOW()
        WHERE product_id = NEW.id 
          AND active_until IS NULL;
    END IF;

    -- Insert new history record
    INSERT INTO product_cost_history (
        product_id,
        cost_before_tax,
        tax_rate,
        cost_after_tax,
        created_by
    ) VALUES (
        NEW.id,
        NEW.cost_price,
        v_tax_rate,
        ROUND((NEW.cost_price * (1 + v_tax_rate)), 2), -- Calculate and round
        auth.uid() -- Attempt to capture user if available
    );

    RETURN NEW;
END;
$$;

-- 3. Trigger on products table
DROP TRIGGER IF EXISTS trigger_log_product_cost_change ON products;

CREATE TRIGGER trigger_log_product_cost_change
AFTER INSERT OR UPDATE OF cost_price
ON products
FOR EACH ROW
EXECUTE FUNCTION log_product_cost_change();

-- 4. Backfill existing products (Optional but good for consistency)
DO $$
DECLARE
    r RECORD;
    v_tax_rate NUMERIC;
    v_cnt INTEGER;
BEGIN
    -- Get tax rate once for the backfill
    SELECT COALESCE((value->>'tax_rate')::NUMERIC, 0) INTO v_tax_rate
    FROM system_settings
    WHERE key = 'financial_config';
    
    IF v_tax_rate IS NULL THEN v_tax_rate := 0; END IF;

    -- Check if history is empty to avoid double-filling
    SELECT COUNT(*) INTO v_cnt FROM product_cost_history;
    
    IF v_cnt = 0 THEN
        INSERT INTO product_cost_history (
            product_id,
            cost_before_tax,
            tax_rate,
            cost_after_tax,
            created_by
        )
        SELECT 
            id,
            cost_price,
            v_tax_rate,
            ROUND((cost_price * (1 + v_tax_rate)), 2),
            NULL -- System backfill
        FROM products;
    END IF;
END $$;
