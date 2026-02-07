import { supabase } from './client';

// Interfaz para usuario autenticado
export interface UsuarioAutenticado {
  id: string;
  email: string;
  nombre_completo: string;
}

// Interfaz para respuesta de autenticación
export interface RespuestaAutenticacion {
  exito: boolean;
  usuario?: UsuarioAutenticado;
  error?: string;
}

// Alias para compatibilidad
export type AuthUser = UsuarioAutenticado;
export type AuthResponse = RespuestaAutenticacion;

/**
 * Registrar nuevo administrador
 */
export async function registrarAdmin(email: string, contraseña: string, nombreCompleto: string): Promise<RespuestaAutenticacion> {
  try {
    // 1. Intentar registrarse con metadatos
    const { data: datosAuth, error: errorAuth } = await supabase.auth.signUp({
      email,
      password: contraseña,
      options: {
        data: {
          full_name: nombreCompleto,
        },
      },
    });

    if (errorAuth) {
      // Verificar si el usuario ya existe
      if (errorAuth.message.includes('already registered') || errorAuth.status === 422) {
        // Intentar recuperación
        return intentarRecuperacionRegistro(email, contraseña, nombreCompleto);
      }
      return { exito: false, error: errorAuth.message };
    }

    if (!datosAuth.user) {
      return { exito: false, error: 'Por favor revisa tu correo para confirmar, o intenta iniciar sesión.' };
    }

    // 2. Crear o actualizar perfil de administrador
    const { error: errorPerfil } = await supabase
      .from('admins')
      .upsert({
        auth_id: datosAuth.user.id,
        email,
        full_name: nombreCompleto,
        is_active: true
      } as any, { onConflict: 'auth_id' });

    if (errorPerfil) {
      return { exito: false, error: 'Error creando perfil: ' + errorPerfil.message };
    }

    return {
      exito: true,
      usuario: {
        id: datosAuth.user.id,
        email,
        nombre_completo: nombreCompleto,
      },
    };
  } catch (error) {
    return {
      exito: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

// Función auxiliar para recuperarse de usuario duplicado
async function intentarRecuperacionRegistro(email: string, contraseña: string, nombreCompleto: string): Promise<RespuestaAutenticacion> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: contraseña,
    });

    if (error) {
      return { exito: false, error: 'El usuario ya existe, pero la contraseña es incorrecta.' };
    }

    if (data.user) {
      // Se inició sesión correctamente, arreglar perfil si falta
      const { error: errorUpsert } = await supabase
        .from('admins')
        .upsert({
          auth_id: data.user.id,
          email,
          full_name: nombreCompleto,
          is_active: true
        } as any, { onConflict: 'auth_id' });

      if (errorUpsert) {
        return { exito: false, error: 'Sesión exitosa, pero falló la creación del perfil.' };
      }

      return {
        exito: true,
        usuario: { id: data.user.id, email, nombre_completo: nombreCompleto }
      };
    }

    return { exito: false, error: 'Error desconocido en recuperación.' };
  } catch (e) {
    return { exito: false, error: 'Error de recuperación.' };
  }
}

/**
 * Iniciar sesión con email y contraseña
 */
export async function iniciarSesionAdmin(email: string, contraseña: string): Promise<RespuestaAutenticacion> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: contraseña,
    });

    if (error) {
      return { exito: false, error: error.message };
    }

    if (!data.user) {
      return { exito: false, error: 'No se retornó datos de usuario' };
    }

    // Obtener perfil de administrador
    let { data: datoAdmin, error: errorPerfil } = await supabase
      .from('admins')
      .select('*')
      .eq('auth_id', data.user.id)
      .single();

    // Si falta el perfil pero está autenticado, intentar recuperar con metadatos
    if (errorPerfil && (errorPerfil.code === 'PGRST116' || !datoAdmin)) {
      console.log('Perfil no encontrado, intentando crear...');
      const nombreMeta = data.user.user_metadata?.full_name || email.split('@')[0];

      const { data: nuevoPerfil, error: errorCrear } = await supabase
        .from('admins')
        .insert({
          auth_id: data.user.id,
          email: email,
          full_name: nombreMeta,
          is_active: true
        } as any)
        .select()
        .single();

      if (!errorCrear && nuevoPerfil) {
        datoAdmin = nuevoPerfil;
        errorPerfil = null;
      } else {
        console.error('Error creando perfil:', errorCrear);
        // Si falla por duplicado, intenta leer de nuevo (posible condición de carrera)
        if (errorCrear?.code === '23505') {
          const { data: reintentoAdmin, error: reintentoError } = await supabase
            .from('admins')
            .select('*')
            .eq('auth_id', data.user.id)
            .single();

          if (reintentoAdmin && !reintentoError) {
            datoAdmin = reintentoAdmin;
            errorPerfil = null;
          } else {
            return { exito: false, error: 'Conflicto de perfil. El usuario existe pero no se puede leer.' };
          }
        } else {
          return { exito: false, error: 'Usuario sin perfil de administrador. Contacte soporte. ' + (errorCrear?.message || '') };
        }
      }
    }

    if (errorPerfil || !datoAdmin) {
      return { exito: false, error: errorPerfil?.message || 'Error de perfil' };
    }

    const admin = datoAdmin as any;

    return {
      exito: true,
      usuario: {
        id: admin.auth_id,
        email: admin.email,
        nombre_completo: admin.full_name,
      },
    };
  } catch (error) {
    return {
      exito: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

/**
 * Cerrar sesión
 */
export async function cerrarSesionAdmin(): Promise<RespuestaAutenticacion> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { exito: false, error: error.message };
    }

    return { exito: true };
  } catch (error) {
    return {
      exito: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}

/**
 * Obtener sesión actual
 */
export async function obtenerSesionActual() {
  const { data, error } = await supabase.auth.getSession();
  return { data, error };
}

/**
 * Obtener usuario actual
 */
export async function obtenerUsuarioActual(): Promise<UsuarioAutenticado | null> {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    // Obtener perfil de administrador
    const { data: datoAdmin } = await supabase
      .from('admins')
      .select('*')
      .eq('auth_id', data.user.id)
      .single();

    if (!datoAdmin) {
      return null;
    }

    const admin = datoAdmin as any;

    return {
      id: admin.auth_id,
      email: admin.email,
      nombre_completo: admin.full_name,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Escuchar cambios de autenticación
 */
export function escucharCambiosAutenticacion(callback: (usuario: UsuarioAutenticado | null) => void) {
  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (!session || !session.user) {
      callback(null);
      return;
    }

    try {
      const { data: datoAdmin } = await supabase
        .from('admins')
        .select('*')
        .eq('auth_id', session.user.id)
        .single();

      if (datoAdmin) {
        const admin = datoAdmin as any;
        callback({
          id: admin.auth_id,
          email: admin.email,
          nombre_completo: admin.full_name,
        });
      } else {
        callback(null);
      }
    } catch (error) {
      callback(null);
    }
  });

  return data;
}

// Alias para compatibilidad hacia atrás
export const registerAdmin = registrarAdmin;
export const loginAdmin = iniciarSesionAdmin;
export const logoutAdmin = cerrarSesionAdmin;
export const getCurrentSession = obtenerSesionActual;
export const getCurrentUser = obtenerUsuarioActual;
export const onAuthStateChange = escucharCambiosAutenticacion;
