-- Migration: Smart Restock & Autopilot Pricing
-- Description: Adds target_margin to products and creates process_restock RPC for atomic updates.

-- 1. Add target_margin column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS target_margin NUMERIC(5,4) CHECK (target_margin < 1.0);

COMMENT ON COLUMN products.target_margin IS 'Target profit margin (0.00 to 0.99) for autopilot pricing';

-- 2. Create RPC function for Atomic Restock
CREATE OR REPLACE FUNCTION process_restock(
  p_product_id UUID,
  p_quantity INTEGER,
  p_unit_cost NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_margin NUMERIC;
  v_new_price NUMERIC;
  v_movement_id UUID;
  v_product_exists BOOLEAN;
BEGIN
  -- Check if product exists
  SELECT EXISTS(SELECT 1 FROM products WHERE id = p_product_id) INTO v_product_exists;
  IF NOT v_product_exists THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- 1. Insert into inventory_movements (Trigger will update current_stock)
  INSERT INTO inventory_movements (
    product_id,
    type,
    reason,
    quantity_change,
    unit_price, -- Recording the COST as the unit_price for 'IN' movements of type PURCHASE
    movement_date
  ) VALUES (
    p_product_id,
    'IN',
    'PURCHASE',
    p_quantity,
    p_unit_cost,
    NOW()
  ) RETURNING id INTO v_movement_id;

  -- 2. Get the target_margin for the product
  SELECT target_margin INTO v_current_margin FROM products WHERE id = p_product_id;

  -- 3. Update Product Cost
  -- IF target_margin is set, Recalculate Selling Price
  IF v_current_margin IS NOT NULL THEN
    -- Formula: Price = Cost / (1 - Margin)
    -- Example: 100 / (1 - 0.3) = 100 / 0.7 = 142.85
    v_new_price := ROUND((p_unit_cost / (1 - v_current_margin)), 2);
    
    UPDATE products
    SET 
      cost_price = p_unit_cost,
      selling_price = v_new_price,
      updated_at = NOW()
    WHERE id = p_product_id;
  ELSE
    -- Just update cost, keep existing price
    UPDATE products
    SET 
      cost_price = p_unit_cost,
      updated_at = NOW()
    WHERE id = p_product_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Restock processed successfully',
    'new_cost', p_unit_cost,
    'new_price', v_new_price, -- Might be null if margin wasn't set
    'movement_id', v_movement_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', SQLERRM
  );
END;
$$;
