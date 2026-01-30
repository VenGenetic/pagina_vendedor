# Reabastecimiento Inteligente

## Descripción

El módulo de **Reabastecimiento Inteligente** calcula sugerencias de compra basadas en el comportamiento real de ventas de cada producto, considerando únicamente los días en que el producto tuvo stock disponible.

## Características Principales

### 1. Cálculo de Venta Diaria Real
- **NO** divide las ventas entre 365 días fijos
- **SÍ** divide entre los días que el producto tuvo stock > 0
- Evita castigar el promedio de productos que estuvieron agotados

### 2. Threshold de 30 Días para Productos Nuevos
- **Productos < 30 días**: Sugiere completar el Stock Mínimo manual
- **Productos >= 30 días**: Aplica el algoritmo de Venta Diaria automáticamente

### 3. Stock Sugerido Configurable
```
Stock Sugerido = Venta Diaria Real × Días de Cobertura
Cantidad a Pedir = Stock Sugerido - Stock Actual
```

### 4. Exportación Inteligente
- Organizado por categoría/proveedor
- Solo productos con sugerencia > 0
- Formato CSV compatible con Excel
- Columnas: SKU, Producto, Stock Actual, Venta Diaria, Días Stock, Cantidad a Pedir, Costo Estimado

## Uso

### Acceso
1. Ve a **Inventario**
2. Clic en botón **"Reabastecimiento"** (icono TrendingUp)

### Configuración
- **Días de Cobertura** (7-180): Define cuántos días de stock deseas mantener
  - Ejemplo: 30 días = 1 mes de cobertura
  - Ejemplo: 45 días = 1.5 meses de cobertura
  
- **Período de Análisis** (30-730): Historial de ventas a considerar
  - Por defecto: 365 días (1 año)
  - Mínimo recomendado: 90 días

### Interpretación de Resultados

#### Columnas
- **SKU**: Código del producto
- **Producto**: Nombre y categoría
- **Stock Actual**: Unidades disponibles ahora
- **Venta/Día**: Promedio de venta diaria real
- **Días Stock**: Días con stock en el período analizado
- **Sugerido**: Stock ideal según configuración
- **A Pedir**: Cantidad recomendada de compra
- **Costo Est.**: Inversión estimada

#### Etiquetas Especiales
- **🟡 Nuevo (Xd)**: Producto con menos de 30 días
  - Sugerencia basada en Stock Mínimo
  - NO usa algoritmo de venta diaria aún

- **🔴 Stock bajo límite**: Stock actual < Stock mínimo

### Exportar a CSV
1. Clic en botón **"Exportar CSV"**
2. Se descarga archivo: `reabastecimiento_YYYY-MM-DD.csv`
3. Abre con Excel o Google Sheets
4. Organizado por categoría para facilitar pedidos por proveedor

## Instalación en Base de Datos

### 1. Ejecutar SQL
En Supabase SQL Editor, ejecuta en orden:

```bash
supabase/migrations/add_smart_restock.sql
```

### 2. Verificar Instalación
```sql
-- Verifica que la función existe
SELECT * FROM pg_proc WHERE proname = 'calculate_smart_restock';

-- Prueba la función
SELECT * FROM calculate_smart_restock(30, 365) LIMIT 5;
```

## Ejemplo de Cálculo

### Producto Establecido (> 30 días)
```
Producto: Llanta Michelin 185/60R15
Período: Últimos 365 días
Ventas totales: 120 unidades
Días con stock > 0: 300 días (estuvo agotado 65 días)

Venta Diaria Real = 120 / 300 = 0.4 unidades/día

Configuración: 45 días de cobertura
Stock Sugerido = 0.4 × 45 = 18 unidades
Stock Actual = 5 unidades

Cantidad a Pedir = 18 - 5 = 13 unidades ✅
```

### Producto Nuevo (< 30 días)
```
Producto: Filtro de Aceite Nuevo
Días desde creación: 15 días
Stock Actual: 3 unidades
Stock Mínimo: 10 unidades

Cantidad a Pedir = 10 - 3 = 7 unidades ✅
(Sugerencia basada en stock mínimo, no en ventas)
```

## Ventajas vs. Método Tradicional

| Aspecto | Método Tradicional | Reabastecimiento Inteligente |
|---------|-------------------|----------------------------|
| Cálculo de promedio | Ventas ÷ 365 días | Ventas ÷ Días con stock |
| Productos agotados | Penaliza promedio | No afecta promedio |
| Productos nuevos | Cálculo erróneo | Usa stock mínimo |
| Días de cobertura | Fijo | Configurable |
| Exportación | Manual | Automática por proveedor |

## Recomendaciones

### Para Productos de Alta Rotación
- Días de cobertura: 15-30 días
- Evita exceso de capital inmovilizado
- Pedidos más frecuentes

### Para Productos de Baja Rotación
- Días de cobertura: 45-90 días
- Reduce frecuencia de pedidos
- Aprovecha descuentos por volumen

### Para Productos Nuevos
- Monitorea primeros 30 días
- Ajusta stock mínimo según ventas reales
- Después de 30 días, el sistema toma control automático

## Troubleshooting

### No aparecen sugerencias
- **Causa**: Todos los productos tienen stock suficiente
- **Solución**: Ajusta "Días de Cobertura" a un valor mayor

### Sugerencias muy altas
- **Causa**: Ventas muy concentradas en pocos días
- **Solución**: Aumenta "Período de Análisis" para suavizar picos

### Productos nuevos sin sugerencia
- **Causa**: Stock actual > Stock mínimo
- **Solución**: Normal. Solo sugiere si stock < mínimo

### Error al cargar datos
- **Causa**: Función SQL no instalada
- **Solución**: Ejecutar `add_smart_restock.sql` en Supabase

## Próximas Mejoras (Roadmap)

- [ ] Perfiles de cobertura por categoría
- [ ] Alertas automáticas por email
- [ ] Integración con proveedores para pedidos automáticos
- [ ] Machine Learning para predecir tendencias estacionales
- [ ] Sugerencias de combinación de productos (cross-selling)
