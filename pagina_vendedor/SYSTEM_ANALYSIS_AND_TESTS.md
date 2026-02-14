# Análisis del Sistema y Plan de Pruebas Lógicas

## 🏗️ Análisis de la Estructura del Sistema

El sistema es una aplicación monolítica moderna construida con **Next.js 14** y **Supabase (PostgreSQL)**.

### Componentes Principales:
1.  **Frontend (App Router)**:
    *   Usa rutas protegidas en `app/(protected)` para asegurar que todo el dashboard y las transacciones requieran autenticación.
    *   Gestión de estado servidor con **React Query** (`hooks/use-queries.ts`).
    *   UI basada en **Shadcn/ui** y Tailwind CSS.

2.  **Lógica de Negocio (`lib/services/transactions.ts`)**:
    *   Centraliza las operaciones críticas.
    *   Usa **RPC (Remote Procedure Calls)** de Supabase para transacciones atómicas (ej. `process_sale_transaction`), asegurando que la venta, el movimiento de inventario y el ingreso financiero ocurran todos o ninguno.

3.  **Base de Datos (Supabase)**:
    *   **Single Source of Truth**: El stock en `products` y el saldo en `accounts` se mantienen sincronizados mediante **Triggers** de base de datos (`update_product_stock`, `update_account_balance`). Esto es robusto pero requiere pruebas cuidadosas de integridad.
    *   **Integridad**: Scripts como `verify_integrity.sql` demuestran un enfoque en la consistencia de datos mediante pruebas automatizadas en SQL.

---

## 🧪 5 Pruebas Lógicas por Feature

A continuación, se detallan 5 pruebas lógicas críticas para cada módulo principal del sistema.

### 1. Ventas (Sales)
*Ubicación: `app/(protected)/transactions/sale` & `processSale()`*

1.  **Deducción de Stock Exacta**: Crear una venta de `N` unidades. Verificar que `products.current_stock` disminuya exactamente en `N` inmediatamente después (vía trigger).
2.  **Impacto Financiero (Ingreso)**: Verificar que el `Total` de la venta se sume al saldo de la `account_id` seleccionada.
3.  **Atomicidad Multi-Item**: Intentar una venta con 3 productos donde el 3º falle (ej. error forzado de DB). Verificar que **no** se descuente stock de los productos 1 y 2, ni se registre el ingreso monetario (Rollback completo).
4.  **Validación de Stock Insuficiente**: Intentar vender una cantidad `X` mayor al `current_stock`. El sistema debe bloquear la transacción (Validación UI o Constraint DB).
5.  **Reversión Completa (Delete)**: Eliminar una venta histórica. Verificar que el stock se "devuelva" al inventario (movimiento inverso) y el dinero se reste de la cuenta.

### 2. Inventario y Compras (Inventory & Purchases)
*Ubicación: `app/(protected)/transactions/purchase` & `inventory_movements`*

1.  **Incremento de Stock**: Registrar una compra de 10 unidades. Confirmar que el stock visual y en DB aumenta en 10.
2.  **Actualización de Costos**: Comprar un producto con un `costo_unitario` diferente al actual. Verificar si el sistema actualiza el costo promedio o el último costo en la ficha del producto.
3.  **Generación de Gasto**: Si la compra NO es "ingreso gratuito", verificar que se cree automáticamente una transacción de tipo `EXPENSE` que reste dinero de la cuenta seleccionada.
4.  **Alerta de Stock Bajo**: Realizar un movimiento que deje el stock por debajo del `min_stock_level`. Verificar que el producto aparezca en la vista de "Smart Restock" o tenga la alerta visual.
5.  **Integridad Referencial**: Intentar eliminar un producto que ya tiene movimientos históricos. La base de datos debe impedirlo (Error de Constraint) para no romper el historial.

### 3. Finanzas y Cuentas (Accounts & Finance)
*Ubicación: `app/(protected)/accounts`, `transfer_funds`*

1.  **Transferencia de Fondos**: Ejecutar una transferencia de \$500 de Cuenta A a Cuenta B. Verificar simultáneamente: Cuenta A -500 y Cuenta B +500.
2.  **Edición de Transacción (Delta)**: Editar un gasto pasado, cambiando el monto de \$100 a \$150. Verificar que el saldo de la cuenta baje solo \$50 adicionales (la diferencia), y no \$150.
3.  **Saldo Inicial**: Crear una cuenta nueva con Saldo Inicial \$1000. Verificar que el saldo calculado sea \$1000 antes de realizar cualquier transacción.
4.  **Eliminación de Gasto**: Borrar un gasto. Verificar que el monto se acredite nuevamente al saldo de la cuenta (deshacer la resta).
5.  **Vinculación de Costos**: Crear un ingreso con "Costo de Envío" asociado. Verificar que se creen dos registros: uno de `INCOME` y otro de `EXPENSE` (envío), y que ambos afecten los saldos correctamente.

### 4. Autenticación y Seguridad
*Ubicación: `middleware`, `supabase auth`*

1.  **Protección de Rutas**: Intentar acceder a `/dashboard` en una ventana de incógnito sin loguearse. Debe redirigir a `/login`.
2.  **Persistencia de Sesión**: Recargar la página (F5) estando logueado. El usuario no debe perder la sesión.
3.  **Logout Seguro**: Hacer Logout y presionar el botón "Atrás" del navegador. No se debe poder ver información protegida.
4.  **Atribución de Usuario**: Verificar en la base de datos que la columna `created_by` en una venta nueva coincida con el ID del usuario logueado.
5.  **Restricción de Edición**: (Si aplica roles) Verificar que un usuario sin permisos administrativos no pueda ver o editar la configuración global o borrar cuentas bancarias.

### 5. Integridad del Sistema (System Integrity)
*Ubicación: `verify_integrity.sql`, triggers*

1.  **Prueba de Recálculo de Stock**: Ejecutar un script (o función de admin) que sume todos los `inventory_movements` de un producto. El resultado DEBE ser igual al campo `current_stock`.
2.  **Prueba de Recálculo de Saldos**: Sumar (Ingresos - Gastos + Saldo Inicial) de una cuenta. El resultado DEBE ser igual al campo `balance`.
3.  **Prevención de Huérfanos**: Verificar que no existan `sale_items` sin una `sale_id` válida (integridad referencial `ON DELETE CASCADE`).
4.  **Tipos de Datos**: Intentar ingresarTexto en campos numéricos de precios o cantidades (vía API o manipulación de form). El backend debe rechazarlo.
5.  **Consistencia de Triggers**: Deshabilitar triggers, hacer un insert manual (simulando error), rehabilitar y correr el script `recalculate_totals.sql`. Verificar que el sistema detecte y corrija la discrepancia.
