'use client';

import { useAuthContext } from '@/components/providers/auth-provider';
import { UsuarioAutenticado } from '@/lib/supabase/auth';

// Hook para consumir el contexto de autenticación
// Reemplaza la lógica anterior que hacía fetch duplicados
export function useAuth() {
  const context = useAuthContext();
  return {
    ...context,
    setAuth: context.setUsuario
  };
}

// Alias para compatibilidad hacia atrás
export type { UsuarioAutenticado as AuthUser };
