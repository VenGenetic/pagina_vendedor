-- Permitir saldos negativos en las cuentas
-- Esto permite que una cuenta quede en rojo si el costo del repuesto supera el saldo.

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS positive_balance;
