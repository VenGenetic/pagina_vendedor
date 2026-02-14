DO $$
DECLARE
    trigger_list TEXT := '';
    r RECORD;
BEGIN
    FOR r IN SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'inventory_movements' LOOP
        trigger_list := trigger_list || r.trigger_name || ', ';
    END LOOP;
    RAISE EXCEPTION 'DEBUG INFO: Triggers on inventory_movements: %', trigger_list;
END $$;
