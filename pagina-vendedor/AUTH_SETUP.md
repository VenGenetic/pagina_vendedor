# Configuración de Autenticación

## ¿Qué se agregó?

Se implementó un sistema completo de autenticación con login/registro para administradores. Ahora puedes:

1. **Registrarte** con tu correo, contraseña y nombre
2. **Iniciar sesión** con tus credenciales
3. Ver tu nombre en el dashboard: "Hola [nombre]"
4. Proteger todas las rutas de la aplicación

## Archivos Nuevos

```
app/
  ├── login/page.tsx              # Página de login/registro
  ├── page.tsx                     # Redirecciona según autenticación
  └── (protected)/
      ├── layout.tsx               # Layout con protección de rutas
      ├── page.tsx                 # Dashboard con saludo personalizado
      ├── inventory/page.tsx       # Inventario protegido
      └── transactions/
          └── sale/page.tsx        # Nueva venta protegida

lib/
  ├── supabase/auth.ts            # Funciones de autenticación
hooks/
  └── use-auth.ts                 # Hook para usar la autenticación

supabase/
  └── auth-schema.sql             # Tabla de admins
```

## Pasos para Configurar

### 1. Ejecutar el SQL en Supabase

1. Ve a tu dashboard de Supabase: https://app.supabase.com
2. Selecciona tu proyecto
3. Ve a **SQL Editor**
4. Crea una nueva query
5. Copia todo el contenido de `supabase/auth-schema.sql`
6. Haz click en "Run"

Este SQL:
- ✅ Crea la tabla `admins`
- ✅ Configurar Row Level Security (RLS)
- ✅ Vincula con el sistema de autenticación de Supabase

### 2. Habilitar Autenticación en Supabase

1. Ve a tu proyecto en Supabase
2. **Authentication** > **Providers**
3. Busca "Email" y habilítalo si no lo está
4. La autenticación por correo/contraseña debe estar activa

## ¿Cómo Funciona?

### Flujo de Autenticación:

```
Usuario abre la app
    ↓
Página "/" (app/page.tsx) verifica autenticación
    ↓
¿Está logueado? 
  ├─ NO → Redirige a /login (página de login/registro)
  └─ SÍ → Redirige a /(protected) (dashboard)

En /login:
  ├─ Nuevo usuario → Click en "Registrate"
  │   ├─ Ingresa email, contraseña y NOMBRE
  │   ├─ Sistema crea cuenta en Supabase Auth
  │   ├─ Sistema guarda perfil en tabla "admins"
  │   └─ Redirige al dashboard
  │
  └─ Usuario existente → Click en "Iniciar Sesión"
      ├─ Ingresa email y contraseña
      ├─ Sistema valida con Supabase Auth
      ├─ Carga perfil de tabla "admins"
      └─ Redirige al dashboard

En el Dashboard:
  ├─ Muestra "Hola [full_name]" en el header
  ├─ Botón "Cerrar sesión" en la esquina
  └─ Todas las rutas están protegidas
```

## Código Clave

### Hook de Autenticación (`hooks/use-auth.ts`)

```typescript
import { useAuth } from '@/hooks/use-auth';

export default function MyComponent() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div>Cargando...</div>;
  if (!user) return <div>No autenticado</div>;

  return <div>Hola, {user.full_name}!</div>;
}
```

### Cerrar Sesión

```typescript
import { logoutAdmin } from '@/lib/supabase/auth';

const handleLogout = async () => {
  await logoutAdmin();
  router.push('/login');
};
```

## Estructura de la BD

### Tabla `admins`

```sql
id              → UUID (Primary Key)
auth_id         → UUID (vinculado a auth.users)
email           → VARCHAR (del formulario de registro)
full_name       → VARCHAR (EL NOMBRE QUE PIDES)
created_at      → TIMESTAMP
updated_at      → TIMESTAMP
is_active       → BOOLEAN
```

## Seguridad (RLS - Row Level Security)

La tabla `admins` tiene RLS habilitado:

- ✅ Cada admin **solo puede ver su propio perfil**
- ✅ Solo puede **actualizar sus propios datos**
- ✅ El sistema vincula `auth.uid()` con `auth_id` en la tabla

## Próximos Pasos

1. **Ejecuta el SQL** (auth-schema.sql) en Supabase
2. **Inicia el servidor**: `npm run dev`
3. **Ve a** http://localhost:3000
4. **Haz click** en "Registrate"
5. **Ingresa**:
   - Correo: tu@email.com
   - Contraseña: mínimo 6 caracteres
   - Nombre: Tu Nombre Aquí ✨
6. **¡Listo!** Verás "Hola Tu Nombre" en el dashboard

## Notas Técnicas

- El componente `LoginPage` maneja tanto registro como login
- El estado se maneja con un toggle `isLogin`
- Las contraseñas se envían a Supabase Auth (nunca se guardan en la BD)
- Los perfiles se guardan en la tabla `admins`
- Hay listeners de cambios de autenticación en `useAuth` hook

## Solución de Problemas

**Error: "Admins table does not exist"**
→ Ejecuta el `auth-schema.sql` en Supabase SQL Editor

**No aparece el nombre en el header**
→ Verifica que la tabla `admins` tenga datos
→ Abre Dev Tools (F12) > Network y revisa si hay errores

**No puedo registrarme**
→ Asegúrate que Email Auth esté habilitado en Supabase
→ Verifica el mensaje de error en la consola del navegador

---

**¡Tu ERP ahora tiene autenticación segura! 🚀**
