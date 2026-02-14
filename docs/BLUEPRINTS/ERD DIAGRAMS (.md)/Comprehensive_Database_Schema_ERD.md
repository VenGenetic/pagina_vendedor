# Comprehensive Database Schema ERD

Este diagrama detalla todas las tablas y relaciones del sistema basadas en el esquema SQL actual, incluyendo los módulos de inventario, finanzas, ventas, proveedores y configuración.

```mermaid
erDiagram
    ACCOUNTS {
        uuid id PK
        string name
        string type
        numeric balance
        string currency
        boolean is_active
        boolean is_nominal
    }

    PRODUCTS {
        uuid id PK
        string sku
        string name
        numeric cost_price
        numeric selling_price
        integer current_stock
        integer reserved_stock
        numeric target_margin
        boolean needs_price_review
    }

    CUSTOMERS {
        uuid id PK
        string identity_document
        string name
        string phone
        string email
    }

    SALES {
        uuid id PK
        string sale_number
        uuid account_id FK
        uuid customer_id FK
        uuid transaction_id FK
        numeric total
        string payment_status
        string source
    }

    SALE_ITEMS {
        uuid id PK
        uuid sale_id FK
        uuid product_id FK
        uuid inventory_movement_id FK
        integer quantity
        numeric unit_price
        numeric subtotal
    }

    TRANSACTIONS {
        uuid id PK
        string type
        numeric amount
        uuid account_id FK
        uuid account_in_id FK
        uuid account_out_id FK
        uuid supplier_id FK
        uuid related_transaction_id FK
        uuid group_id
    }

    INVENTORY_MOVEMENTS {
        uuid id PK
        uuid product_id FK
        uuid transaction_id FK
        string type
        integer quantity_change
        string reason
    }

    SUPPLIERS {
        uuid id PK
        string name
        string contact_person
        boolean is_active
    }

    PRICE_PROPOSALS {
        uuid id PK
        uuid product_id FK
        uuid inventory_movement_id FK
        numeric proposed_cost
        numeric proposed_price
        string status
    }

    DROPSHIP_ORDERS {
        uuid id PK
        uuid sale_id FK
        uuid product_id FK
        integer quantity
        string status
        string provider_name
    }

    DEMAND_HITS {
        uuid id PK
        uuid product_id FK
        uuid sale_id FK
        string hit_type
        integer quantity
    }

    STOCK_RESERVATIONS {
        uuid id PK
        uuid product_id FK
        integer quantity
        string status
        timestamp expires_at
    }

    PRODUCT_COST_HISTORY {
        uuid id PK
        uuid product_id FK
        uuid related_proposal_id FK
        numeric cost_after_tax
    }

    SYSTEM_SETTINGS {
        string key PK
        jsonb value
        integer version
    }

    SETTINGS_AUDIT_LOGS {
        uuid id PK
        string setting_key FK
        jsonb old_value
        jsonb new_value
    }

    %% Relationships
    ACCOUNTS ||--o{ SALES : "pays_into"
    ACCOUNTS ||--o{ TRANSACTIONS : "source/destination"
    CUSTOMERS ||--o{ SALES : "buys"
    SALES ||--o{ SALE_ITEMS : "contains"
    SALES ||--o| TRANSACTIONS : "linked_finance"
    TRANSACTIONS ||--o{ INVENTORY_MOVEMENTS : "triggers"
    TRANSACTIONS }o--|| SUPPLIERS : "paid_to"
    TRANSACTIONS |o--o| TRANSACTIONS : "reverses/relates"
    PRODUCTS ||--o{ SALE_ITEMS : "sold_as"
    PRODUCTS ||--o{ INVENTORY_MOVEMENTS : "moves"
    PRODUCTS ||--o{ PRICE_PROPOSALS : "proposed_for"
    PRODUCTS ||--o{ DROPSHIP_ORDERS : "shipped_as"
    PRODUCTS ||--o{ DEMAND_HITS : "tracked_for"
    PRODUCTS ||--o{ STOCK_RESERVATIONS : "held_in"
    PRODUCTS ||--o{ PRODUCT_COST_HISTORY : "cost_log"
    INVENTORY_MOVEMENTS ||--o| SALE_ITEMS : "fulfills"
    INVENTORY_MOVEMENTS ||--o| PRICE_PROPOSALS : "triggers_review"
    SALES ||--o{ DROPSHIP_ORDERS : "requires"
    SALES ||--o{ DEMAND_HITS : "generates"
    PRICE_PROPOSALS ||--o| PRODUCT_COST_HISTORY : "applied_to"
    SYSTEM_SETTINGS ||--o{ SETTINGS_AUDIT_LOGS : "audits"
```

```mermaid
erDiagram
    %% Core Entities
    ACCOUNTS ||--o{ TRANSACTIONS : "fund flow triggers balance update"
    ACCOUNTS ||--o{ SALES : "payment destination"
    
    PRODUCTS ||--o{ INVENTORY_MOVEMENTS : "stock change triggers update"
    PRODUCTS ||--o{ SALE_ITEMS : "catalog ref"
    
    %% The Commercial Flow
    SALES ||--|{ SALE_ITEMS : "aggregates"
    
    %% The Physical Bridge (The Complex Link)
    SALE_ITEMS |o--|| INVENTORY_MOVEMENTS : "physical stock deduction"
    INVENTORY_MOVEMENTS }o--|| TRANSACTIONS : "financial implication"

    %% Table Definitions based on Schema
    ACCOUNTS {
        uuid id PK
        string type "CASH, BANK..."
        decimal balance "Updated by Trigger"
    }

    PRODUCTS {
        uuid id PK
        int current_stock "Updated by Trigger"
        decimal cost_price
        decimal selling_price
    }

    TRANSACTIONS {
        uuid id PK
        enum type "INCOME, EXPENSE"
        decimal amount
        string reference_number
    }

    INVENTORY_MOVEMENTS {
        uuid id PK
        uuid product_id FK
        enum type "IN, OUT"
        int quantity_change
        uuid transaction_id FK "Nullable"
    }

    SALES {
        uuid id PK
        string sale_number UK
        decimal total
        uuid account_id FK
    }

    SALE_ITEMS {
        uuid id PK
        uuid sale_id FK
        uuid product_id FK
        uuid inventory_movement_id FK "The Bridge"
    }
```

