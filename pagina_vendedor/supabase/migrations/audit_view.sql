-- Vista de auditoría detallada
-- Une transacciones (income/expense), cuenta de origen, cuenta de destino y metadatos
CREATE OR REPLACE VIEW transaction_audit_log AS
SELECT
  t.id,
  t.created_at,
  t.type,
  t.amount,
  t.description,
  t.reference_number,
  t.payment_method,
  
  -- Cuenta principal (histórico/legacy)
  a.name AS account_name,
  
  -- Flujo de dinero explícito
  acc_in.name AS account_in_name,
  acc_out.name AS account_out_name,
  
  -- Detalles de autoría
  t.created_by_name AS user_name,
  
  -- Enlaces a operaciones
  s.sale_number AS sale_ref,
  s.shipping_cost AS shipping_data
  
FROM transactions t
LEFT JOIN accounts a ON t.account_id = a.id
LEFT JOIN accounts acc_in ON t.account_in_id = acc_in.id
LEFT JOIN accounts acc_out ON t.account_out_id = acc_out.id
LEFT JOIN sales s ON t.reference_number = s.sale_number -- Intento de link simple por referencia
ORDER BY t.created_at DESC;
