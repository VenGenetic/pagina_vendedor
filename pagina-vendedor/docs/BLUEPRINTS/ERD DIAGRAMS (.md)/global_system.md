# ERD: Global System Strategy

Este diagrama representa la visión macro del sistema ERP, conectando los módulos de inventario, finanzas, clientes y configuración.

## Estrategia Financiera

El sistema utiliza un **Ledger de Partida Doble** con validación estricta de suma cero. La lógica de actualización de saldos es **determinista** basada en el tipo de transacción (`INCOME` siempre suma, `EXPENSE` siempre resta), independientemente del signo del monto ingresado.

```mermaid
erDiagram
    %% Core Entities
    accounts ||--o{ transactions : "belongs to"
    accounts ||--o{ sales : "payment account"
    
    customers ||--o{ sales : "makes"
    
    products ||--o{ inventory_movements : "tracks"
    products ||--o{ sale_items : "contained in"
    products ||--o{ price_proposals : "subject to"
    products ||--o{ product_cost_history : "cost audit"
    
    sales ||--o| transactions : "transaction_id (Linked)"
    inventory_movements }|--|| transactions : "parent (RESTRICT)"
    
    system_settings ||--o{ settings_audit_logs : "audit"
    
    %% Relationships via App Logic (Dashed Lines)
    users ||--o{ transactions : "created_by (FK)"
    users ||--o{ sales : "created_by (FK)"
    users ||--o{ inventory_movements : "created_by (FK)"
    users ||--o| price_proposals : "applied_by (FK)"
    users ||--o{ settings_audit_logs : "changed_by (FK)"
    %% Financial Guardrails
    Ledger_Validator |o..o{ transactions : "Zero-Sum Constraint (Active)"
    Transfer_Guard |o..o{ accounts : "Nominal Segregation (Active)"
    
    %% Phase 3 Guardrails
    Stock_Firewall |o..o| products : "Negative Stock Prev (Active)"
    WAC_Synchronizer |o..o| products : "Cost Sync (Active)"
    
    %% Phase 4 Guardrails
    Commission_Engine |o..o{ sales : "Ledger Recording (Active)"
    Log_Sanitizer |o..o| settings_audit_logs : "Redaction (Active)"
    Payment_Master |o..o| transactions : "Dynamic Methods (Active)"
    Sign_Contract |o..o| transactions : "Deterministic Updates (Active)"
```
