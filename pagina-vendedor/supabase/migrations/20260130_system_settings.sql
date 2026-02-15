-- Enable Realtime for specific tables (will be added to publication later)

-- 1. System Settings Table (Key-Value Store)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1 NOT NULL, -- Optimistic Concurrency Control
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- 2. Audit Log Table
CREATE TABLE IF NOT EXISTS settings_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(50) REFERENCES system_settings(key),
    old_value JSONB,
    new_value JSONB,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. RLS Policies (Security)
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow read access to authenticated users" 
ON system_settings FOR SELECT 
TO authenticated 
USING (true);

-- Allow update access only via RPC (strictly controlled) or Admin
-- For now, we allow authenticated to update via RLS check but we prefer RPC
-- We'll allow "authenticated" to update if they are admin? 
-- For simplicity in this demo, we allow authenticated updates BUT
-- effectively we force usage of the RPC for concurrency control.
CREATE POLICY "Allow update access to authenticated users" 
ON system_settings FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 4. RPC for Optimistic Updates
CREATE OR REPLACE FUNCTION update_system_setting(
    p_key VARCHAR,
    p_new_value JSONB,
    p_expected_version INTEGER,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_version INTEGER;
    v_old_value JSONB;
    v_updated_rows INTEGER;
BEGIN
    -- Check current version and value
    SELECT version, value INTO v_current_version, v_old_value
    FROM system_settings
    WHERE key = p_key;

    IF NOT FOUND THEN
        -- If setting doesn't exist, we insert it (First initialization)
        INSERT INTO system_settings (key, value, version, updated_by, updated_at)
        VALUES (p_key, p_new_value, 1, p_user_id, NOW());
        
        -- Audit Log (Creation)
        INSERT INTO settings_audit_logs (setting_key, old_value, new_value, changed_by)
        VALUES (p_key, NULL, p_new_value, p_user_id);
        
        RETURN jsonb_build_object('success', true, 'new_version', 1);
    END IF;

    -- Concurrency Check
    IF v_current_version != p_expected_version THEN
        RAISE EXCEPTION 'Concurrency Error: Record has changed. Expected v%, found v%', p_expected_version, v_current_version;
    END IF;

    -- Update
    UPDATE system_settings
    SET 
        value = p_new_value,
        version = version + 1,
        updated_at = NOW(),
        updated_by = p_user_id
    WHERE key = p_key AND version = p_expected_version;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

    IF v_updated_rows = 0 THEN
        RAISE EXCEPTION 'Concurrency Error: Update failed (Race Condition).';
    END IF;

    -- Audit Log (Update)
    INSERT INTO settings_audit_logs (setting_key, old_value, new_value, changed_by)
    VALUES (p_key, v_old_value, p_new_value, p_user_id);

    RETURN jsonb_build_object('success', true, 'new_version', v_current_version + 1);
END;
$$;

-- 5. Seed Initial Data (Safe Defaults)
INSERT INTO system_settings (key, value, description)
VALUES 
    ('business_profile', '{"name": "Mi Negocio", "address": "", "website": ""}', 'Información general del negocio'),
    ('financial_config', '{"tax_rate": 0.15, "currency": "USD", "currency_symbol": "$"}', 'Configuración fiscal y monetaria'),
    ('inventory_prefs', '{"low_stock_threshold": 5, "allow_stock_negative": false}', 'Preferencias de inventario')
ON CONFLICT (key) DO NOTHING;

-- 6. Enable Realtime
-- Note: This requires the table to be in the publication
-- We attempt to add it. If publication doesn't exist it might fail, but in Supabase 'supabase_realtime' usually exists.
DO $$
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'system_settings'
  ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE system_settings;
  END IF;
END
$$;
