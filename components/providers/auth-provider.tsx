'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { UsuarioAutenticado } from '@/lib/supabase/auth';
import { supabase } from '@/lib/supabase/client';

interface AuthContextType {
  usuario: UsuarioAutenticado | null;
  setUsuario: (usuario: UsuarioAutenticado | null) => void;
  estaCargando: boolean;
  user: UsuarioAutenticado | null; // Alias inglés
  isLoading: boolean; // Alias inglés
}

const AuthContext = createContext<AuthContextType>({
  usuario: null,
  setUsuario: () => {},
  estaCargando: true,
  user: null,
  isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);
  const [estaCargando, setEstaCargando] = useState(true);

  // Cargar perfil de admin
  const cargarUsuario = async (userId: string, mounted: { current: boolean }) => {
    try {
      const { data: datoAdmin } = await supabase
        .from('admins')
        .select('*')
        .eq('auth_id', userId)
        .single();

      if (!mounted.current) return;

      if (datoAdmin) {
        const admin = datoAdmin as any;
        setUsuario({
          id: admin.auth_id,
          email: admin.email,
          nombre_completo: admin.full_name,
        });
      } else {
        setUsuario(null);
      }
    } catch (error) {
      console.error('Error verificando autenticación:', error);
      if (mounted.current) setUsuario(null);
    } finally {
      if (mounted.current) setEstaCargando(false);
    }
  };

  useEffect(() => {
    const mounted = { current: true };

    const init = async () => {
      try {
        const { data: datosSesion } = await supabase.auth.getSession();
        if (!mounted.current) return;

        const userId = datosSesion.session?.user?.id;
        if (!userId) {
          setUsuario(null);
          setEstaCargando(false);
          return;
        }

        await cargarUsuario(userId, mounted);
      } catch (error) {
        console.error('Error inicial de sesión:', error);
        if (mounted.current) {
          setUsuario(null);
          setEstaCargando(false);
        }
      }
    };

    init();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted.current) return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        setUsuario(null);
        setEstaCargando(false);
        return;
      }

      const newId = session.user.id;
      // Evitar recarga si ya es el mismo usuario
      setUsuario(current => {
        if (current && current.id === newId) {
          setEstaCargando(false);
          return current;
        }
        cargarUsuario(newId, mounted);
        return current;
      });
    });

    return () => {
      mounted.current = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  const value = {
    usuario,
    setUsuario,
    estaCargando,
    user: usuario,
    isLoading: estaCargando,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
