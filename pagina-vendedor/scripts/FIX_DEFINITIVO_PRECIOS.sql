-- ============================================
-- SCRIPT DE CORRECCIÓN DEFINITIVA: PRICE PROPOSALS
-- ============================================
-- Este script crea todas las tablas, columnas, vistas y funciones
-- necesarias para el flujo de reabastecimiento (Restock) y
-- control de precios (WAC Governance).
-- ============================================

BEGIN;

-- 1. EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. COLUMNAS ADICIONALES EN TABLAS EXISTENTES
ALTER TABLE products ADD COLUMN IF NOT EXISTS needs_price_review BOOLEAN DEFAULT false;

-- 3. TABLA DE PROPUESTAS DE PRECIO
CREATE TABLE IF NOT EXISTS price_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  inventory_movement_id UUID REFERENCES inventory_movements(id),
  current_cost DECIMAL(12,2) NOT NULL,
  current_stock INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  new_unit_cost DECIMAL(12,2) NOT NULL,
  proposed_cost DECIMAL(12,2) NOT NULL,
  proposed_price DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EDITED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_price_proposals_status ON price_proposals(status);
CREATE INDEX IF NOT EXISTS idx_price_proposals_product ON price_proposals(product_id);

-- 4. VINCULACIÓN CON AUDITORÍA (HISTORIAL DE COSTOS)
ALTER TABLE product_cost_history ADD COLUMN IF NOT EXISTS related_proposal_id UUID REFERENCES price_proposals(id);

-- 5. ACTUALIZACIÓN DEL TRIGGER DE HISTORIAL DE COSTOS
CREATE OR REPLACE FUNCTION log_product_cost_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tax_rate NUMERIC;
    v_system_settings JSONB;
    v_proposal_id UUID;
BEGIN
    -- Solo proceder si el costo cambió o es inserción
    IF (TG_OP = 'UPDATE' AND OLD.cost_price = NEW.cost_price) THEN
        RETURN NEW;
    END IF;

    -- Capturar el ID de propuesta desde la sesión de PostgreSQL
    BEGIN
        v_proposal_id := NULLIF(current_setting('app.current_proposal_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_proposal_id := NULL;
    END;

    -- Obtener tasa de impuesto actual (por defecto 0.15 o 15%)
    BEGIN
        SELECT value INTO v_system_settings FROM system_settings WHERE key = 'financial_config';
        v_tax_rate := COALESCE((v_system_settings->>'tax_rate')::NUMERIC, 0.15);
    EXCEPTION WHEN OTHERS THEN
        v_tax_rate := 0.15; 
    END;

    -- Cerrar registro anterior
    IF TG_OP = 'UPDATE' THEN
        UPDATE product_cost_history SET active_until = NOW() WHERE product_id = NEW.id AND active_until IS NULL;
    END IF;

    -- Insertar nuevo registro con link a la propuesta si existe
    INSERT INTO product_cost_history (
        product_id, cost_before_tax, tax_rate, cost_after_tax, created_by, related_proposal_id
    ) VALUES (
        NEW.id, NEW.cost_price, v_tax_rate, ROUND((NEW.cost_price * (1 + v_tax_rate)), 2), auth.uid(), v_proposal_id
    );

    RETURN NEW;
END;
$$;

-- 6. VISTA DE VALUACIÓN POTENCIAL
CREATE OR REPLACE VIEW view_potential_inventory_valuation AS
SELECT 
  p.id as product_id,
  p.sku,
  p.name as product_name,
  p.current_stock,
  p.cost_price as current_unit_cost,
  (p.current_stock * p.cost_price) as current_total_value,
  pp.id as proposal_id,
  pp.proposed_cost as potential_unit_cost,
  pp.proposed_price as potential_selling_price,
  (p.current_stock * pp.proposed_cost) as potential_total_value,
  ((p.current_stock * pp.proposed_cost) - (p.current_stock * p.cost_price)) as value_diff,
  pp.created_at as proposal_date
FROM products p
JOIN price_proposals pp ON p.id = pp.product_id 
WHERE pp.status = 'PENDING';

-- 7. RPC: PROCESAR REABASTECIMIENTO V3 (BPMN ALIGNMENT)
CREATE OR REPLACE FUNCTION process_restock_v3(
    p_account_id UUID,
    p_provider_name TEXT,
    p_payment_method TEXT,
    p_total_amount DECIMAL,
    p_reference_number TEXT,
    p_notes TEXT,
    p_user_id UUID,
    p_items JSONB,
    p_tax_percent DECIMAL DEFAULT 15,    
    p_margin_percent DECIMAL DEFAULT 65, 
    p_discount_percent DECIMAL DEFAULT 0 
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_group_id UUID := uuid_generate_v4();
    v_transaction_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_unit_cost DECIMAL;
    v_product_cost DECIMAL;
    v_current_stock INTEGER;
    v_movement_id UUID;
    v_baseline_stock INTEGER;
    v_baseline_cost DECIMAL;
    v_final_wac DECIMAL;
    v_selling_price DECIMAL;
BEGIN
    -- Registro Financiero Primero
    IF p_total_amount > 0 AND p_account_id IS NOT NULL THEN
        INSERT INTO transactions (
            type, amount, description, account_id, payment_method, 
            reference_number, notes, transaction_date, group_id, created_by
        ) VALUES (
            'EXPENSE', p_total_amount,
            CONCAT('Compra de inventario', CASE WHEN p_provider_name IS NOT NULL AND p_provider_name <> '' THEN ' - ' || p_provider_name ELSE '' END),
            p_account_id, p_payment_method, p_reference_number, p_notes, NOW(), v_group_id, p_user_id
        ) RETURNING id INTO v_transaction_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'cost_unit')::DECIMAL;

        -- Registrar Movimiento de Inventario
        INSERT INTO inventory_movements (
            product_id, type, quantity_change, unit_price, total_value, 
            transaction_id, reason, created_by, movement_date
        ) VALUES (v_product_id, 'IN', v_quantity, v_unit_cost, v_quantity * v_unit_cost, v_transaction_id, 'PURCHASE', p_user_id, NOW())
        RETURNING id INTO v_movement_id;

        SELECT current_stock, cost_price INTO v_current_stock, v_product_cost FROM products WHERE id = v_product_id;

        -- Cálculos de WAC y Propuesta
        IF v_current_stock < 0 THEN
            v_baseline_stock := 0; v_baseline_cost := v_unit_cost;
        ELSE
            v_baseline_stock := v_current_stock - v_quantity;
            v_baseline_cost := v_product_cost;
            IF v_baseline_stock < 0 THEN v_baseline_stock := 0; v_baseline_cost := v_unit_cost; END IF;
        END IF;

        IF (v_baseline_stock + v_quantity) > 0 THEN
            v_final_wac := ((v_baseline_stock * v_baseline_cost) + (v_quantity * v_unit_cost)) / (v_baseline_stock + v_quantity);
        ELSE
            v_final_wac := v_unit_cost;
        END IF;

        -- Fórmula de precio sugerido (NUEVA REGLA: Costo * 1.65)
        v_selling_price := v_final_wac * 1.65;

        -- Crear Propuesta (limpiar pendientes anteriores)
        DELETE FROM price_proposals WHERE product_id = v_product_id AND status = 'PENDING';
        INSERT INTO price_proposals (
            product_id, inventory_movement_id, current_cost, current_stock,
            new_quantity, new_unit_cost, proposed_cost, proposed_price, status
        ) VALUES (
            v_product_id, v_movement_id, v_product_cost, v_current_stock - v_quantity,
            v_quantity, v_unit_cost, ROUND(v_final_wac, 2), ROUND(v_selling_price, 2), 'PENDING'
        );
        
        UPDATE products SET needs_price_review = false WHERE id = v_product_id;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'group_id', v_group_id);
END;
$$;

-- 8. RPC: APROBAR PROPUESTA
CREATE OR REPLACE FUNCTION approve_price_proposal(
    p_proposal_id UUID,
    p_user_id UUID,
    p_final_price DECIMAL DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_proposal RECORD;
    v_final_cost DECIMAL;
    v_final_selling_price DECIMAL;
BEGIN
    SELECT * INTO v_proposal FROM price_proposals WHERE id = p_proposal_id AND status = 'PENDING';
    IF v_proposal IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Proposal not found'); END IF;
    
    v_final_cost := v_proposal.proposed_cost;
    v_final_selling_price := COALESCE(p_final_price, v_proposal.proposed_price);

    PERFORM set_config('app.current_proposal_id', p_proposal_id::TEXT, true);

    UPDATE products SET cost_price = v_final_cost, selling_price = v_final_selling_price, updated_at = NOW() WHERE id = v_proposal.product_id;
    UPDATE price_proposals SET status = 'APPROVED', applied_at = NOW(), applied_by = p_user_id, proposed_price = v_final_selling_price WHERE id = p_proposal_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 9. RPC: RECHAZAR PROPUESTA
CREATE OR REPLACE FUNCTION reject_price_proposal(
    p_proposal_id UUID,
    p_user_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE price_proposals SET status = 'REJECTED', applied_at = NOW(), applied_by = p_user_id WHERE id = p_proposal_id AND status = 'PENDING';
    UPDATE products p SET needs_price_review = true FROM price_proposals pp WHERE p.id = pp.product_id AND pp.id = p_proposal_id;
    RETURN jsonb_build_object('success', true);
END;
$$;

-- 10. TRIGGER DE PRECIO AUTOMÁTICO (ENFORCED 65%)
-- Garantiza que selling_price siempre sea 65% mayor a cost_price.

CREATE OR REPLACE FUNCTION fn_auto_calculate_selling_price()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.cost_price IS NOT NULL THEN
        NEW.selling_price := ROUND((NEW.cost_price * 1.65), 2);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_auto_calculate_selling_price ON products;
CREATE TRIGGER tr_auto_calculate_selling_price
BEFORE INSERT OR UPDATE OF cost_price, selling_price ON products
FOR EACH ROW
EXECUTE FUNCTION fn_auto_calculate_selling_price();

-- Actualización inicial
UPDATE products SET selling_price = ROUND((cost_price * 1.65), 2) WHERE cost_price IS NOT NULL;

COMMIT;
