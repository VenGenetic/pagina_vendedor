-- ============================================
-- METADATA ALIGNMENT SAFEGUARD RPC
-- ============================================
-- Use this function for Batch Imports / Staging Area commits.
-- STRICTLY PREVENTS overwrite of 'current_stock'.

CREATE OR REPLACE FUNCTION process_metadata_alignment(
    p_products JSONB,  -- Array of {sku, name, category, brand, cost_price, selling_price, image_url, description}
    p_user_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_item JSONB;
    v_sku TEXT;
    v_product_id UUID;
    v_updated_count INTEGER := 0;
    v_inserted_count INTEGER := 0;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_products) LOOP
        v_sku := v_item->>'sku';
        
        -- Try to find existing product
        SELECT id INTO v_product_id FROM products WHERE sku = v_sku;
        
        IF v_product_id IS NOT NULL THEN
            -- UPDATE: Only Metadata fields. NEVER current_stock.
            UPDATE products SET
                name = COALESCE(v_item->>'name', name),
                category = COALESCE(v_item->>'category', category),
                brand = COALESCE(v_item->>'brand', brand),
                cost_price = COALESCE((v_item->>'cost_price')::DECIMAL, cost_price),
                selling_price = COALESCE((v_item->>'selling_price')::DECIMAL, selling_price),
                image_url = COALESCE(v_item->>'image_url', image_url),
                description = COALESCE(v_item->>'description', description),
                updated_at = NOW()
            WHERE id = v_product_id;
            
            v_updated_count := v_updated_count + 1;
        ELSE
            -- INSERT: New Product. 
            -- current_stock MUST be 0.
            INSERT INTO products (
                sku, name, category, brand, 
                cost_price, selling_price, 
                image_url, description,
                current_stock, min_stock, max_stock, target_margin, is_active
            ) VALUES (
                v_sku,
                v_item->>'name',
                COALESCE(v_item->>'category', 'General'),
                COALESCE(v_item->>'brand', ''),
                COALESCE((v_item->>'cost_price')::DECIMAL, 0),
                COALESCE((v_item->>'selling_price')::DECIMAL, 0),
                COALESCE(v_item->>'image_url', ''),
                COALESCE(v_item->>'description', ''),
                0, -- FORCE STOCK 0
                5, 100, 65, true
            );
            
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'updated', v_updated_count, 
        'inserted', v_inserted_count
    );
END;
$$;
