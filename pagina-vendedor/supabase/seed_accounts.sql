-- Insertar cuentas predeterminadas si no existen
INSERT INTO public.accounts (name, type, balance, currency, is_active)
SELECT 'Banco Pichincha Katiuska', 'BANK', 0.00, 'USD', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts WHERE name = 'Banco Pichincha Katiuska'
);

INSERT INTO public.accounts (name, type, balance, currency, is_active)
SELECT 'Banco Guayaquil Katiuska', 'BANK', 0.00, 'USD', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts WHERE name = 'Banco Guayaquil Katiuska'
);

INSERT INTO public.accounts (name, type, balance, currency, is_active)
SELECT 'Efectivo', 'CASH', 0.00, 'USD', true
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts WHERE name = 'Efectivo'
);
