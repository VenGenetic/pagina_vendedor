# ERD: Financial Flow (Ledger)

Diagrama sobre el movimiento de efectivo, cuentas nominales de ingreso/gasto y la arquitectura de partida doble.

## Contrato de Signos (Sign Logic Contract)

**Determinismo basado en Tipo (Type-Based Determinism):**
El sistema ignora el signo del `amount` ingresado y aplica la lógica según el tipo de transacción para las cuentas de Activo (Asset Accounts).

| Tipo Transacción | Lógica de Balance | Significado |
| :--- | :--- | :--- |
| **INCOME** | `Balance = Balance + ABS(amount)` | Entrada de Dinero (Aumenta Activo) |
| **EXPENSE** | `Balance = Balance - ABS(amount)` | Salida de Dinero (Disminuye Activo) |
| **TRANSFER** | `Out: Balance - ABS(amount)` <br> `In: Balance + ABS(amount)` | Movimiento entre Activos |

```mermaid
erDiagram
    accounts ||--o{ transactions : "holds"
    accounts ||--o{ sales : "receives payment"
    
    transactions }o--o{ transactions : "balanced via group_id"
    transactions |o--o| sales : "via reference_number"
    transactions |o--o| suppliers : "payment to"
    
    accounts {
        boolean is_nominal "Check: Transfers ONLY if false (Fixed)"
    }
    
    %% Constraints
    Ledger_Validator |o..o{ transactions : "SUM(amount) = 0 (Enforced)"
    Segregation_Policy |o..o{ accounts : "No Nominal Transfers (Enforced)"
    
    %% Double Entry visualization
    Ledger_Entry_1 {
        UUID account_id "Asset Account (Debit)"
        Decimal amount "+100"
    }
    Ledger_Entry_2 {
        UUID account_id "Revenue Account (Credit)"
        Decimal amount "-100"
    }
    Ledger_Entry_1 ||--|{ transactions : "record"
    Ledger_Entry_2 ||--|{ transactions : "record"
    
    %% Logic Contract
    Sign_Logic_Enforcer |o..o{ transactions : "INCOME (+) | EXPENSE (-)"
```
