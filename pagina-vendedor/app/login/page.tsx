'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { iniciarSesionAdmin } from '@/lib/supabase/auth';
import { useAuthContext } from '@/components/providers/auth-provider';
import { 
  KeyRound, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ChevronRight,
  AlertCircle
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setUsuario } = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const resultado = await iniciarSesionAdmin(email, password);

      if (!resultado.exito) {
        let mensajeError = resultado.error || 'Error al iniciar sesión';
        
        // Traducir errores comunes de Supabase
        if (mensajeError.includes('Invalid login') || mensajeError.includes('Invalid')) {
          mensajeError = 'Credenciales incorrectas. Verifica tu correo y contraseña.';
        } else if (mensajeError.includes('Email not confirmed')) {
          mensajeError = 'Por favor confirma tu correo electrónico.';
        }

        setError(mensajeError);
        setLoading(false);
        return;
      }

      // Actualizar contexto global inmediatamente para evitar race conditions
      if (resultado.usuario) {
        setUsuario(resultado.usuario);
      }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl shadow-slate-200 p-8 space-y-8 border border-slate-100">
        
        {/* Header Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex p-4 rounded-2xl bg-blue-600 shadow-lg shadow-blue-200 mb-2 transform rotate-3">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">MotoManager</h1>
            <p className="text-slate-400 text-sm font-medium">Sistema de Gestión de Repuestos</p>
          </div>
        </div>

        {/* Alerta de Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3 animate-in slide-in-from-top-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <p className="text-xs font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Form */}
        <form className="space-y-5" onSubmit={handleSubmit}>
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Correo</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                required 
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Contraseña</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                required 
                disabled={loading}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600"
                disabled={loading}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Ingresar al Sistema
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-2">
          <a href="#" className="text-xs font-semibold text-slate-400 hover:text-blue-600 transition-colors">
            ¿Olvidaste tu contraseña?
          </a>
        </div>
      </div>
      
      <p className="mt-8 text-xs text-slate-400 text-center px-6">
        Acceso restringido únicamente para personal autorizado.
      </p>
    </div>
  );
}
