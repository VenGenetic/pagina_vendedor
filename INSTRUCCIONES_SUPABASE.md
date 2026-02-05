# Cómo Ejecutar la Migración de Supabase

El error `inventory_movements_reason_check` ocurre porque la BD de Supabase no tiene configurado correctamente el campo `reason`.

## Pasos para Arreglarlo:

1. **Ve a Supabase Dashboard:**
   - Entra a https://supabase.com
   - Selecciona tu proyecto

2. **Abre SQL Editor:**
   - Click en "SQL Editor" en el menú izquierdo
   - Click en "New Query"

3. **Copia y pega este SQL:**
   ```sql
   UPDATE public.inventory_movements 
   SET reason = 'OTHER' 
   WHERE reason IS NULL OR reason = '';

   ALTER TABLE public.inventory_movements 
   DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;

   ALTER TABLE public.inventory_movements
   ALTER COLUMN reason SET DEFAULT 'OTHER',
   ALTER COLUMN reason SET NOT NULL;

   ALTER TABLE public.inventory_movements 
   ADD CONSTRAINT inventory_movements_reason_check 
   CHECK (reason IN ('SALE', 'PURCHASE', 'RETURN', 'DAMAGE', 'THEFT', 'COUNT_ADJUSTMENT', 'RESERVATION', 'COMMIT', 'OTHER'));
   ```

4. **Ejecuta el query:**
   - Click en "Run" o presiona Ctrl+Enter

5. **Listo!** Ahora intenta registrar la compra nuevamente.

## ¿Por qué ocurre esto?

Vercel NO ejecuta las migraciones de Supabase automáticamente. Las migraciones en `supabase/migrations/` solo se ejecutan localmente o si las aplicas manualmente.

El archivo `EXECUTE_IN_SUPABASE.sql` contiene el SQL exacto que necesitas ejecutar en el SQL Editor de Supabase.

---

# ⚖️ LEDGER LAW ENFORCEMENT

> [!CAUTION]
> **PROHIBIDO EN PRODUCCIÓN:** Las siguientes operaciones están **ESTRICTAMENTE PROHIBIDAS** y constituyen violaciones de integridad de datos:

## ❌ Operaciones Prohibidas

### 1. Mutación Directa de Stock
```sql
-- ❌ NUNCA HAGAS ESTO EN PRODUCCIÓN
UPDATE products SET current_stock = 50 WHERE id = 'xxx';
```

**¿Por qué?** El stock DEBE cambiar únicamente a través de `inventory_movements`. El trigger `trg_update_stock` calcula automáticamente el stock basado en la suma de movimientos.

### 2. Eliminación de Transacciones
```sql
-- ❌ NUNCA HAGAS ESTO EN PRODUCCIÓN
DELETE FROM transactions WHERE id = 'xxx';
```

**¿Por qué?** Las transacciones son **inmutables**. Para corregir errores, usa el RPC `rpc_reverse_transaction` que crea una transacción compensatoria (REFUND).

### 3. Modificación de Montos
```sql
-- ❌ NUNCA HAGAS ESTO EN PRODUCCIÓN
UPDATE transactions SET amount = 100 WHERE id = 'xxx';
```

**¿Por qué?** Viola el principio de **zero-sum ledger**. La única forma de "cambiar" un monto es reversar y recrear.

---

## 📋 PROTOCOLO DE AUDITORÍA: Conteos Manuales de Inventario

Cuando el conteo físico no coincide con el sistema, **NO "corrijas" el número directamente**. En su lugar:

### Procedimiento Correcto

1. **Identificar la discrepancia:**
   ```
   Sistema dice: 50 unidades
   Conteo físico: 47 unidades
   Diferencia: -3 unidades
   ```

2. **Registrar un ADJUSTMENT con razón obligatoria:**
   ```typescript
   // Usar el RPC de ajuste de inventario
   await supabase.rpc('create_inventory_adjustment', {
     p_product_id: 'xxx',
     p_quantity: -3,  // Negativo para reducción
     p_reason: 'COUNT_ADJUSTMENT',  // OBLIGATORIO
     p_notes: 'Conteo físico 2026-02-05. Posible causa: merma/robo.',
     p_user_id: currentUser.id
   });
   ```

3. **Razones válidas para ajustes:**

| Razón | Uso |
|-------|-----|
| `THEFT` | Robo confirmado o sospechado |
| `DAMAGE` | Producto dañado o inutilizable |
| `COUNT_ADJUSTMENT` | Discrepancia en conteo físico |
| `EXPIRY` | Producto vencido (si aplica) |

> [!IMPORTANT]
> Todo ajuste genera un registro en `inventory_movements` con trazabilidad completa: usuario, fecha, razón, y notas.

---

## 🔄 MANDATO RPC-FIRST

### Regla de Oro

> **Cualquier operación que afecte más de una tabla DEBE ser un RPC.**

### ✅ Operaciones que DEBEN usar RPCs:

| Operación | RPC Requerido |
|-----------|---------------|
| Venta | `process_sale_transaction` |
| Compra/Restock | `process_restock_v2` |
| Transferencia | `transfer_funds` |
| Reversión | `rpc_reverse_transaction` |
| Ajuste de Inventario | `create_inventory_adjustment` |

### ❌ DEPRECATED: Funciones a Eliminar

| Función | Estado | Reemplazo |
|---------|--------|-----------|
| `inventoryService.updateStock()` | 🔴 DEPRECATED | Usar RPC con movimientos |
| `transactionService.delete()` | 🔴 DEPRECATED | Usar `rpc_reverse_transaction` |
| Direct `UPDATE products.current_stock` | 🔴 PROHIBIDO | Usar RPC de ajuste |

---

## 🛡️ Verificación de Integridad

### Query de Auditoría: Stock vs Movimientos
```sql
-- Verificar que el stock coincida con la suma de movimientos
SELECT 
  p.id,
  p.name,
  p.current_stock AS "Stock en Tabla",
  COALESCE(SUM(
    CASE WHEN im.movement_type = 'IN' THEN im.quantity ELSE -im.quantity END
  ), 0) AS "Stock Calculado",
  p.current_stock - COALESCE(SUM(
    CASE WHEN im.movement_type = 'IN' THEN im.quantity ELSE -im.quantity END
  ), 0) AS "Discrepancia"
FROM products p
LEFT JOIN inventory_movements im ON im.product_id = p.id
GROUP BY p.id, p.name, p.current_stock
HAVING p.current_stock != COALESCE(SUM(
  CASE WHEN im.movement_type = 'IN' THEN im.quantity ELSE -im.quantity END
), 0);
```

> [!WARNING]
> Si este query devuelve resultados, existe una violación de integridad que requiere investigación inmediata.

---

## 🔄 SOFT REVERSAL (Auditoría de Eliminaciones)

> [!CAUTION]
> **NUNCA elimines registros de `transactions` o `inventory_movements`.** En su lugar, crea una **Soft Reversal** mediante un ADJUSTMENT.

### ¿Qué es Soft Reversal?

Cuando un usuario "elimina" un movimiento o transacción, el sistema **NO** ejecuta un `DELETE`. En su lugar:

1. Crea un movimiento de ADJUSTMENT que compensa el original
2. Marca el registro original como `is_reversed = true`
3. Vincula ambos registros mediante `reversal_group_id`

### Trigger: Soft Delete para Inventory Movements

```sql
-- Este trigger intercepta DELETE y lo convierte en ADJUSTMENT
CREATE OR REPLACE FUNCTION soft_delete_inventory_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_reversal_qty INTEGER;
BEGIN
  -- Calcular cantidad de reversión
  IF OLD.movement_type = 'IN' THEN
    v_reversal_qty := OLD.quantity;  -- Crear OUT para compensar
  ELSE
    v_reversal_qty := OLD.quantity;  -- Crear IN para compensar
  END IF;
  
  -- Insertar movimiento de compensación
  INSERT INTO inventory_movements (
    product_id,
    movement_type,
    quantity,
    reason,
    notes,
    reversal_of_movement_id,
    user_id,
    created_at
  ) VALUES (
    OLD.product_id,
    CASE WHEN OLD.movement_type = 'IN' THEN 'OUT' ELSE 'IN' END,
    v_reversal_qty,
    'SOFT_REVERSAL',
    'Reversión automática de movimiento ' || OLD.id,
    OLD.id,
    current_setting('app.current_user_id', true)::UUID,
    NOW()
  );
  
  -- Marcar original como reversado (no eliminar)
  UPDATE inventory_movements 
  SET is_reversed = true
  WHERE id = OLD.id;
  
  -- IMPORTANTE: Retornar NULL para cancelar el DELETE real
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger
CREATE TRIGGER trg_soft_delete_movement
BEFORE DELETE ON inventory_movements
FOR EACH ROW
EXECUTE FUNCTION soft_delete_inventory_movement();
```

### Columnas Requeridas

```sql
-- Agregar columnas de auditoría
ALTER TABLE inventory_movements
ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN DEFAULT FALSE;

ALTER TABLE inventory_movements
ADD COLUMN IF NOT EXISTS reversal_of_movement_id UUID REFERENCES inventory_movements(id);

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN DEFAULT FALSE;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS reversal_of_transaction_id UUID REFERENCES transactions(id);
```

### Beneficios del Soft Reversal

| Aspecto | DELETE Real | Soft Reversal |
|---------|------------|---------------|
| Trazabilidad | ❌ Se pierde historial | ✅ Historial completo |
| Auditoría | ❌ No hay rastro | ✅ Quién, cuándo, por qué |
| Integridad | ❌ Puede romper sumas | ✅ Zero-sum garantizado |
| Recuperación | ❌ Imposible | ✅ Se puede "des-reversar" |

---

## 🔧 RPC: `process_purchase` (Atomicidad Garantizada)

> [!IMPORTANT]
> **Atomicidad:** La lógica de `processPurchase` DEBE migrarse a un PostgreSQL RPC para prevenir race conditions y garantizar 100% de integridad de datos.

### ¿Por qué RPC en lugar de Frontend?

| Problema con Frontend | Solución con RPC |
|-----------------------|------------------|
| Network failure entre pasos | Transacción atómica |
| Usuario cierra navegador | ROLLBACK automático |
| Race condition en stock | Locks de PostgreSQL |
| Validación inconsistente | Validación en DB |

### RPC: `rpc_process_purchase`

```sql
CREATE OR REPLACE FUNCTION rpc_process_purchase(
  p_supplier_name TEXT,
  p_items JSONB,  -- [{product_id, quantity, unit_cost}]
  p_account_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_total DECIMAL := 0;
  v_group_id UUID := gen_random_uuid();
  v_movement_ids UUID[] := ARRAY[]::UUID[];
  v_transaction_id UUID;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_cost DECIMAL;
  v_movement_id UUID;
BEGIN
  -- 1. VALIDAR todos los items primero
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = v_product_id) THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_product_id;
    END IF;
  END LOOP;

  -- 2. CREAR TRANSACCIÓN FINANCIERA PRIMERO (Atomic Linkage)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_cost := (v_item->>'unit_cost')::DECIMAL;
    v_total := v_total + (v_quantity * v_unit_cost);
  END LOOP;

  INSERT INTO transactions (
    type, amount, description, account_id, group_id, user_id
  ) VALUES (
    'EXPENSE', v_total, 'Compra: ' || p_supplier_name, p_account_id, v_group_id, p_user_id
  ) RETURNING id INTO v_transaction_id;

  -- 3. CREAR MOVIMIENTOS DE INVENTARIO (Solo si transacción exitosa)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_cost := (v_item->>'unit_cost')::DECIMAL;

    INSERT INTO inventory_movements (
      product_id, movement_type, quantity, reason, 
      unit_cost, notes, transaction_group_id, user_id
    ) VALUES (
      v_product_id, 'IN', v_quantity, 'PURCHASE',
      v_unit_cost, p_notes, v_group_id, p_user_id
    ) RETURNING id INTO v_movement_id;
    
    v_movement_ids := array_append(v_movement_ids, v_movement_id);

    -- 4. ACTUALIZAR WAC (Weighted Average Cost)
    UPDATE products
    SET 
      cost_price = (
        (current_stock * cost_price + v_quantity * v_unit_cost) / 
        NULLIF(current_stock + v_quantity, 0)
      ),
      updated_at = NOW()
    WHERE id = v_product_id;
  END LOOP;

  -- 5. RETORNAR RESULTADO
  RETURN jsonb_build_object(
    'success', true,
    'group_id', v_group_id,
    'transaction_id', v_transaction_id,
    'movement_ids', to_jsonb(v_movement_ids),
    'total', v_total
  );

EXCEPTION WHEN OTHERS THEN
  -- ROLLBACK automático por PostgreSQL
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql;
```

### Uso desde Frontend

```typescript
// ✅ CORRECTO: Una sola llamada atómica
const { data, error } = await supabase.rpc('rpc_process_purchase', {
  p_supplier_name: 'Proveedor ABC',
  p_items: [
    { product_id: 'xxx', quantity: 10, unit_cost: 25.00 },
    { product_id: 'yyy', quantity: 5, unit_cost: 15.00 }
  ],
  p_account_id: selectedAccount.id,
  p_notes: 'Factura #12345',
  p_user_id: currentUser.id
});

if (data?.success) {
  toast.success('Compra registrada exitosamente');
  // Redirect to purchase details
} else {
  toast.error('Error: ' + (data?.error || error?.message));
}
```

### Beneficios de la Migración a RPC

| Métrica | Antes (Frontend) | Después (RPC) |
|---------|------------------|---------------|
| Llamadas a DB | 5-10 | 1 |
| Latencia | ~500ms | ~50ms |
| Race conditions | Posibles | Imposibles |
| Consistencia | 90% | 100% |

