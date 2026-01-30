# ✨ Autenticación - Guía Rápida

## 🎯 ¿Qué Cambió?

Tu app ahora **requiere login** para acceder. Los administradores deben ser **registrados manualmente** en Supabase (no hay registro público).

### Flujo de Autenticación:
```
http://localhost:3000 → ¿Logueado? 
  ├─ NO → /login (Solo Iniciar Sesión)
  └─ SÍ → /(protected) → Dashboard (con saludo "Hola [nombre]")
```

⚠️ **IMPORTANTE:** No hay opción de registro público. Los usuarios deben ser creados por un administrador en Supabase.

---

## 📋 Pasos para Activar

### Paso 1️⃣: Ejecuta el SQL de Admins

**Archivo:** `supabase/auth-schema.sql`

1. Ve a https://vfemkaighftkqyoaxxpa.supabase.co
2. **SQL Editor** → **New Query**
3. Copia TODO de `auth-schema.sql`
4. **Run** ▶️

```sql
-- Esto crea la tabla que guarda los nombres de los admins
CREATE TABLE admins (
  id UUID PRIMARY KEY,
  auth_id UUID UNIQUE,  -- Vinculado a auth.users
  email VARCHAR(255) UNIQUE,
  full_name VARCHAR(200),  -- ✨ NOMBRE DEL ADMIN
  ...
)
```

### Paso 2️⃣: Verifica Email Auth

En Supabase:
1. **Authentication** → **Providers**
2. Busca "Email"
3. Verifica que esté **habilitado** (toggle en verde)

### Paso 3️⃣: Crear Primer Administrador

En Supabase Dashboard:
1. **Authentication** → **Users**
2. Click en **"Add user"**
3. Método: **"Create a new user"**
4. Ingresa:
   ```
   Email: tu@email.com
   Password: TuContraseñaSegura123
   ```
5. Click en **"Create user"**
6. Luego ve a **SQL Editor** y ejecuta:
   ```sql
   INSERT INTO admins (auth_id, email, full_name, is_active)
   VALUES (
     (SELECT id FROM auth.users WHERE email = 'tu@email.com'),
     'tu@email.com',
     'Tu Nombre Completo',
     true
   );
   ```

### Paso 4️⃣: Abre la App

```bash
npm run dev
# Abre http://localhost:3000
```

---

## 🚀 Usando la App

### Iniciar Sesión

1. Verás la página de login (sin opción de registro)
2. Ingresa:
   ```
   Correo: tu@email.com (el que creaste en Supabase)
   Contraseña: TuContraseñaSegura123
   ```
3. Click en **"Iniciar Sesión"**
4. ✨ **Se abre el dashboard que dice:**
   ```
   Hola,
   Tu Nombre Completo
   ```

### Crear Más Administradores

Solo puedes crear administradores desde Supabase:

1. **Authentication** → **Users** → **"Add user"**
2. Ingresa email y contraseña
3. Ejecuta SQL para crear perfil:
   ```sql
   INSERT INTO admins (auth_id, email, full_name, is_active)
   VALUES (
     (SELECT id FROM auth.users WHERE email = 'nuevo@email.com'),
     'nuevo@email.com',
     'Nombre del Nuevo Admin',
     true
   );
   ```

### Para Cerrar Sesión

Click en el botón **"Salir"** en la esquina superior derecha o en el menú inferior

---

## 📁 Archivos Nuevos

```
app/
  login/                          # Página de login/registro
    page.tsx
  
  (protected)/                    # Todas estas rutas requieren login
    layout.tsx                    # Protección de rutas
    page.tsx                      # Dashboard actualizado
    inventory/
      page.tsx
    transactions/
      sale/
        page.tsx
  
  page.tsx                        # Redirige según autenticación

lib/
  supabase/
    auth.ts                       # Funciones de login/registro

hooks/
  use-auth.ts                     # Hook para usar autenticación

supabase/
  auth-schema.sql                 # BD para admins
```

---

## 🔐 Cómo Funciona

### Registro
```
Usuario llena formulario
    ↓
registerAdmin() en auth.ts
    ↓
Crea cuenta en Supabase Auth (email + contraseña)
    ↓
Guarda nombre en tabla "admins"
    ↓
Redirige al dashboard
```

### Login
```
Usuario ingresa credenciales
    ↓
loginAdmin() en auth.ts
    ↓
Valida contra Supabase Auth
    ↓
Lee nombre de tabla "admins"
    ↓
Redirige al dashboard con nombre
```

### Protección de Rutas
```
useAuth() hook verifica sesión
    ↓
¿Usuario logueado?
  ├─ NO → Redirige a /login
  └─ SÍ → Muestra contenido
```

---

## 💡 Código Ejemplo

### Usar el nombre en cualquier componente:

```typescript
'use client';
import { useAuth } from '@/hooks/use-auth';

export default function Header() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div>Cargando...</div>;
  
  return <h1>Hola, {user?.full_name}! 👋</h1>;
}
```

### Cerrar sesión programáticamente:

```typescript
import { logoutAdmin } from '@/lib/supabase/auth';
import { useRouter } from 'next/navigation';

const handleLogout = async () => {
  await logoutAdmin();
  router.push('/login');
};
```

---

## ⚡ Estructura de BD

### Tabla `admins`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `auth_id` | UUID | Vinculado a Supabase Auth |
| `email` | VARCHAR | Email del admin |
| `full_name` | VARCHAR | ✨ **EL NOMBRE QUE INGRESA** |
| `is_active` | BOOLEAN | Si está activo |
| `created_at` | TIMESTAMP | Fecha de registro |

**Seguridad:** RLS habilitado - cada admin solo ve su propio perfil

---

## 🆘 Solución de Problemas

| Problema | Solución |
|----------|----------|
| "Auth users table does not exist" | Ejecuta `auth-schema.sql` en Supabase |
| No aparece el nombre en header | Verifica que `full_name` esté en tabla `admins` |
| No puedo registrarme | Verifica que Email Auth esté habilitado en Supabase |
| "Unauthorized" en la consola | Abre DevTools (F12) y revisa los errores |

---

## 📱 UI/UX de Login

- **Diseño moderno** con gradiente azul
- **Validación en tiempo real** de campos
- **Mensajes de error** claros
- **Botón de toggle** entre Login y Registro
- **Responsivo** en mobile

---

## ✅ Checklist

- [ ] Ejecuté `auth-schema.sql` en Supabase SQL Editor
- [ ] Verifiqué que Email Auth esté habilitado
- [ ] Hice `npm run dev`
- [ ] Abrí http://localhost:3000
- [ ] Me registré con mi nombre
- [ ] Veo "Hola [Mi Nombre]" en el dashboard
- [ ] Cerré sesión correctamente

---

## 🎉 ¡Listo!

Tu ERP ahora es **seguro y personalizado**. Cada administrador:
- ✅ Tiene su propia cuenta
- ✅ Usa email + contraseña
- ✅ Ve su nombre en el dashboard
- ✅ Sus datos están protegidos

**Todo guardado en GitHub:**
https://github.com/VenGenetic/pagina_vendedor

---

**¿Preguntas?** Revisa [AUTH_SETUP.md](AUTH_SETUP.md) para detalles técnicos.
