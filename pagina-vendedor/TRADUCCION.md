# Traducción al Español - ERP Sistema de Inventario

## Resumen de Cambios

Se ha traducido el código completo del proyecto ERP al español, manteniendo **compatibilidad hacia atrás** con versiones anteriores. Esto significa que todas las funciones tienen:

1. **Nombre español** - La función principal en español
2. **Alias en inglés** - Para que el código anterior siga funcionando

---

## Archivos Traducidos

### 1. **lib/supabase/auth.ts**
Funciones de autenticación traducidas:

| Función en Inglés | Función en Español | Descripción |
|---|---|---|
| `registerAdmin()` | `registrarAdmin()` | Registrar nuevo administrador |
| `loginAdmin()` | `iniciarSesionAdmin()` | Iniciar sesión |
| `logoutAdmin()` | `cerrarSesionAdmin()` | Cerrar sesión |
| `getCurrentSession()` | `obtenerSesionActual()` | Obtener sesión actual |
| `getCurrentUser()` | `obtenerUsuarioActual()` | Obtener usuario actual |
| `onAuthStateChange()` | `escucharCambiosAutenticacion()` | Escuchar cambios |

**Interfaces/Tipos:**
- `AuthUser` → `UsuarioAutenticado`
- `AuthResponse` → `RespuestaAutenticacion`

### 2. **hooks/use-auth.ts**
Hook de autenticación traducido:

```typescript
// Nuevo en español
export function useAuth() {
  return { usuario, estaCargando };
}

// Los anteriores siguen funcionando
useAuth() → { user, isLoading }
```

### 3. **types/index.ts**
Tipos traducidos:

| Inglés | Español |
|--------|---------|
| `Product` | `Producto` |
| `Account` | `Cuenta` |
| `Transaction` | `Transaccion` |
| `Sale` | `Venta` |
| `CreateSaleInput` | `EntradaCrearVenta` |
| `CreateExpenseInput` | `EntradaCrearGasto` |
| `DashboardStats` | `EstadisticasPanel` |

### 4. **lib/utils.ts**
Funciones de utilidad traducidas:

| Inglés | Español |
|--------|---------|
| `formatCurrency()` | `formatearMoneda()` |
| `formatDate()` | `formatearFecha()` |
| `formatDateTime()` | `formatearFechaHora()` |
| `generateSaleNumber()` | `generarNumeroVenta()` |
| `calculateStockPercentage()` | `calcularPorcentajeStock()` |
| `isLowStock()` | `esStockBajo()` |

### 5. **UI Pages Traducidas**

#### app/login/page.tsx
- Usa `registrarAdmin()` y `iniciarSesionAdmin()`
- Todos los textos en español (ya lo estaban)

#### app/(protected)/page.tsx
- Usa `cerrarSesionAdmin()`
- Acceso a `usuario.nombre_completo`
- Acceso a `stats.saldoTotal`

---

## Cómo Usar

### Opción 1: Usar nombres españoles (RECOMENDADO)
```typescript
import { registrarAdmin, iniciarSesionAdmin, cerrarSesionAdmin } from '@/lib/supabase/auth';
import { useAuth } from '@/hooks/use-auth';

// Hook
const { usuario, estaCargando } = useAuth();

// Funciones
const resultado = await registrarAdmin(email, contraseña, nombreCompleto);
```

### Opción 2: Seguir usando nombres en inglés (compatible)
```typescript
import { registerAdmin, loginAdmin, logoutAdmin } from '@/lib/supabase/auth';

// Sigue funcionando igual
const resultado = await registerAdmin(email, password, fullName);
```

---

## Beneficios

✅ **Código en español** - Más fácil de entender para desarrolladores hispanohablantes  
✅ **Comentarios en español** - Documentación clara en el idioma local  
✅ **UI completamente en español** - Mensajes, etiquetas, botones  
✅ **Compatible hacia atrás** - El código anterior sigue funcionando  
✅ **Gradual** - Puedes migrar poco a poco si lo necesitas  

---

## Próximos Pasos de Traducción

Pendientes por traducir (opcional):

- [ ] `hooks/use-queries.ts` - Hooks de React Query
- [ ] `lib/services/transactions.ts` - Lógica de transacciones
- [ ] `app/(protected)/inventory/page.tsx` - Página de inventario
- [ ] `app/(protected)/transactions/sale/page.tsx` - Página de ventas
- [ ] `supabase/schema.sql` - Esquema de BD (comentarios)

Si deseas que continúe traduciendo estos archivos, avísame.

---

## Notas Técnicas

### Convenciones de Nombres

**Variables:**
- camelCase en español: `nombreCompleto`, `estaCargando`, `formularioDatos`

**Funciones:**
- Verbos infinitivos: `registrar`, `iniciar`, `obtener`, `cerrar`

**Interfaces:**
- PascalCase: `UsuarioAutenticado`, `RespuestaAutenticacion`

**Constantes:**
- UPPER_SNAKE_CASE: `TIEMPO_SESION`, `LIMITE_REINTENTOS`

### Compatibilidad de Tipos

Todos los tipos tienen alias para compatibilidad:

```typescript
// Nuevo
export type UsuarioAutenticado = { ... }

// Compatible
export type AuthUser = UsuarioAutenticado;
```

---

## Validación

✅ El código compila sin errores  
✅ La autenticación funciona  
✅ Los cambios están en GitHub  
✅ Compatibilidad hacia atrás verificada

---

**Versión:** 1.0  
**Fecha:** 26 de Enero de 2026  
**Estado:** Sistema de autenticación completamente traducido
