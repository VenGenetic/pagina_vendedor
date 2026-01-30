# Funcionalidad de Importación de Productos

## Resumen

Se ha implementado una funcionalidad completa para importar productos desde archivos CSV al inventario.

## Cambios Realizados

### 1. Servicio de Inventario (`lib/services/inventory.ts`)

- **Nueva función `createProducts()`**: Permite insertar/actualizar múltiples productos en lote
- Utiliza `upsert` con `onConflict: 'sku'` para evitar duplicados y actualizar productos existentes
- Soporta procesamiento en chunks para manejar grandes volúmenes de datos

### 2. Componente de Importación (`components/inventory/import-products-dialog.tsx`)

#### Características:
- **Parser CSV**: Utiliza `papaparse` para lectura confiable de archivos CSV
- **Vista previa**: Muestra las primeras 2 filas del archivo cargado
- **Validación de datos**: 
  - Limpia valores de moneda (ej: "$5.47" → 5.47)
  - Convierte correctamente stocks a enteros
  - Filtra productos sin SKU o nombre
  - Deduplicación automática por SKU
- **Procesamiento por lotes**: Inserta productos en chunks de 50 para mejor rendimiento
- **Feedback visual**: Estados de carga, éxito y error
- **Mapeo de columnas flexible**: Soporta múltiples nombres de columnas

#### Columnas CSV soportadas:
- **SKU**: `CODIGO PROVEEDOR`, `SKU`
- **Nombre**: `DESCRIPCION`, `Nombre`
- **Costo**: ` COSTO SIN IVA`, `Costo`, `Costo Unitario`
- **Precio venta**: `PVP UN `, `Precio Venta`, `PVP`
- **Stock**: `Cantidad Actual`, `Stock`
- **Marca**: `Marca`
- **Categoría**: `Categoria`
- **Descripción**: `Descripción`
- **Imagen**: `Imagen`

### 3. Integración en Página de Inventario

- Botón "Importar CSV" agregado junto a "Exportar CSV"
- Invalidación automática de queries para refrescar la vista
- Integrado con el sistema de gestión de estado existente

## Validaciones Implementadas

1. **SKU único**: Sistema upsert previene duplicados
2. **Deduplicación en archivo**: Si el CSV tiene SKUs repetidos, solo se toma el último
3. **Datos requeridos**: Productos sin SKU o nombre son filtrados
4. **Valores numéricos**: Conversión segura de strings a números
5. **Stocks y precios**: No permite valores negativos (min: 0)

## Uso

1. Ir a la página de Inventario
2. Clic en botón "Importar CSV"
3. Seleccionar archivo CSV
4. Revisar vista previa de datos
5. Clic en "Importar Datos"
6. Los productos se agregan/actualizan automáticamente

## Formato CSV Recomendado

```csv
DESCRIPCION, COSTO SIN IVA,CODIGO PROVEEDOR,Cantidad Actual,PVP UN 
PEDAL DE FRENO SCRAMBLER,$5.47,34B040301-00,10,$10.69
TELESCOPICAS COMANDER 200,$45.00,CGB200CMD-005,5,$87.98
```

## Dependencias Agregadas

- `papaparse`: Parser CSV robusto
- `@types/papaparse`: Tipos TypeScript

## Notas Técnicas

- Los productos importados se marcan como `is_active: true`
- Stock mínimo por defecto: 5
- Stock máximo por defecto: 100
- Si no hay SKU en el CSV, se genera uno aleatorio con prefijo "GEN-"
- El procesamiento en chunks (50 productos) previene timeouts en importaciones grandes
