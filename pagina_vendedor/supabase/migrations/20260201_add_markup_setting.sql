-- 1. Add 'default_markup' to financial_config in system_settings
-- We use a DO block to safely update the JSONB value
DO $$
DECLARE
    v_current_val JSONB;
    v_new_val JSONB;
BEGIN
    -- unique key for financial config
    SELECT value INTO v_current_val FROM system_settings WHERE key = 'financial_config';
    
    -- If it exists, merge the new field if not present
    IF v_current_val IS NOT NULL THEN
        -- Default 0.60 (60%) if not exists
        IF NOT (v_current_val ? 'default_markup') THEN
            v_new_val := v_current_val || '{"default_markup": 0.60}'::jsonb;
            
            UPDATE system_settings 
            SET value = v_new_val, version = version + 1, updated_at = NOW()
            WHERE key = 'financial_config';
        END IF;
    ELSE
        -- Should have been seeded, but just in case
        INSERT INTO system_settings (key, value, description)
        VALUES ('financial_config', '{"tax_rate": 0.15, "currency": "USD", "currency_symbol": "$", "tax_enabled": true, "default_markup": 0.60}', 'Configuración fiscal y monetaria');
    END IF;
END $$;

-- 2. Create RPC to recalculate ALL product prices based on new markup
CREATE OR REPLACE FUNCTION recalculate_all_product_prices(
    p_markup numeric
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    -- Validate markup (e.g. prevent negative or crazy high?)
    IF p_markup < 0 THEN
       RAISE EXCEPTION 'Markup cannot be negative';
    END IF;

    -- Update all products
    -- Formula: selling_price = CEIL(cost_price * (1 + p_markup))
    -- We use CEIL to round up to nearest integer (common in retail) or keep decimals?
    -- User voice: "calculate that value". Usually prices like 15.23 are fine, but CEIL is safer for profit.
    -- Let's stick to standard math: cost * (1+markup). We can round to 2 decimal places.
    
    WITH updated_rows AS (
        UPDATE products
        SET selling_price = CEIL(cost_price * (1 + p_markup)) -- Round up to nearest integer as a safe default for "Margin"
        WHERE cost_price IS NOT NULL AND cost_price > 0
        RETURNING id
    )
    SELECT count(*) INTO v_updated_count FROM updated_rows;

    RETURN jsonb_build_object(
        'success', true, 
        'updated_count', v_updated_count,
        'message', format('Successfully updated %s products with markup %s%%', v_updated_count, p_markup * 100)
    );
END;
$$;
