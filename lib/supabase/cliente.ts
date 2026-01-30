import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

// URLs y claves de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Validar que las variables de entorno estén configuradas
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variables de entorno de Supabase no configuradas');
}

// Crear cliente de Supabase con tipos de base de datos
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Mantener sesión en el navegador
    autoRefreshToken: true, // Refrescar token automáticamente
  },
});

// Función auxiliar para obtener cliente Supabase tipado
export const obtenerClienteSupabase = () => supabase;
