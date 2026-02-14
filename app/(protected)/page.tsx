'use client';

import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';
import { useDashboardStats, useRecentActivity, useAccounts } from '@/hooks/use-queries';
import { formatCurrency, formatDateTime, getAccountColor, cn } from '@/lib/utils';
import { cerrarSesionAdmin } from '@/lib/supabase/auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  LogOut,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Wallet,
  ArrowRightLeft,
  Settings2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { TransferModal } from '@/components/transactions/transfer-modal';
import { GrossProfitChart } from '@/components/dashboard/gross-profit-chart';

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentActivity } = useRecentActivity();
  const { data: accounts } = useAccounts();
  const [showTransfer, setShowTransfer] = useState(false);

  // const handleLogout = async () => {
  //   await cerrarSesionAdmin();
  //   router.push('/login');
  // };

  const totalBalance = stats?.saldoTotal || 0;

  // Mostrar todas las cuentas activas
  const cuentasMostrar = accounts || [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 transition-colors">

      {/* Transfer Modal */}
      {accounts && accounts.length > 0 && (
        <TransferModal
          isOpen={showTransfer}
          onClose={() => setShowTransfer(false)}
          sourceAccount={accounts[0]} // Default fallback
          accounts={accounts}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-md md:max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">Hola,</p>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {user?.nombre_completo || 'Administrador'}
            </h1>
          </div>
          <div className="flex gap-2">
            <ThemeToggle />
            <Link
              href="/settings"
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Configuración"
            >
              <Settings2 className="h-5 w-5 text-slate-700 dark:text-slate-300" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-md md:max-w-7xl mx-auto p-4 space-y-6 md:space-y-0 md:grid md:grid-cols-12 md:gap-6">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-900 rounded-2xl p-6 text-white shadow-lg md:col-span-5 lg:col-span-4">
          <p className="text-sm text-blue-100 mb-2">Saldo en Cuentas</p>
          <div className="flex items-baseline gap-2 mb-6">
            <h2 className="text-4xl font-bold">
              {formatCurrency(totalBalance)}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            {cuentasMostrar.map((acc, i) => {
              const colors = getAccountColor(acc.name);

              return (
                <Link
                  href={`/accounts/${acc.id}`}
                  key={acc.id || i}
                  className={cn(
                    "rounded-xl p-2.5 text-center transition-all active:scale-95 flex flex-col justify-center shadow-lg border border-white/10 dark:border-white/5",
                    colors.bg,
                    colors.text,
                    colors.hover
                  )}
                >
                  <p className={cn("text-[10px] uppercase font-bold tracking-tight mb-1 truncate opacity-90")}>{acc.name}</p>
                  <p className="text-sm font-bold truncate">
                    {formatCurrency(acc.balance || 0)}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-3 md:col-span-7 lg:col-span-8">
          {/* VENDER - Prominente en 2 columnas */}
          <Link href="/transactions/sale" className="col-span-4 md:col-span-2 bg-gradient-to-br from-emerald-600 to-emerald-700 dark:from-emerald-700 dark:to-emerald-800 hover:from-emerald-700 hover:to-emerald-800 dark:hover:from-emerald-600 dark:hover:to-emerald-700 rounded-2xl p-5 flex items-center justify-center gap-4 shadow-lg shadow-emerald-200/50 dark:shadow-none transition-all active:scale-95 group">
            <div className="p-3 bg-white/20 rounded-xl group-hover:scale-110 transition-transform">
              <ShoppingCart className="h-7 w-7 text-white" />
            </div>
            <div>
              <span className="block text-xl font-bold text-white tracking-tight">VENDER</span>
              <span className="block text-sm text-emerald-100 font-medium">Nueva Venta</span>
            </div>
          </Link>

          {/* SURTIR */}
          <Link href="/transactions/purchase" className="col-span-2 md:col-span-1">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 hover:from-blue-600 hover:to-blue-700 dark:hover:from-blue-500 dark:hover:to-blue-600 rounded-xl p-4 flex flex-col items-center gap-2 transition-all shadow-md h-full justify-center group active:scale-95">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-tight">Surtir</span>
            </div>
          </Link>

          {/* GASTO */}
          <Link href="/transactions/expense" className="col-span-2 md:col-span-1">
            <div className="bg-gradient-to-br from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 hover:from-red-600 hover:to-red-700 dark:hover:from-red-500 dark:hover:to-red-600 rounded-xl p-4 flex flex-col items-center gap-2 transition-all shadow-md h-full justify-center group active:scale-95">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <TrendingDown className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-tight">Gasto</span>
            </div>
          </Link>

          {/* COMISIÓN */}
          <Link href="/transactions/income" className="col-span-2 md:col-span-1">
            <div className="bg-gradient-to-br from-violet-500 to-violet-600 dark:from-violet-600 dark:to-violet-700 hover:from-violet-600 hover:to-violet-700 dark:hover:from-violet-500 dark:hover:to-violet-600 rounded-xl p-4 flex flex-col items-center gap-2 transition-all shadow-md h-full justify-center group active:scale-95">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-tight">Ingreso</span>
            </div>
          </Link>

          {/* TRANSFERIR */}
          <div className="col-span-2 md:col-span-1">
            <button
              onClick={() => setShowTransfer(true)}
              className="w-full bg-gradient-to-br from-cyan-500 to-cyan-600 dark:from-cyan-600 dark:to-cyan-700 hover:from-cyan-600 hover:to-cyan-700 dark:hover:from-cyan-500 dark:hover:to-cyan-600 rounded-xl p-4 flex flex-col items-center gap-2 transition-all shadow-md h-full justify-center group active:scale-95"
            >
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <ArrowRightLeft className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-tight">Transferir</span>
            </button>
          </div>

          {/* INVENTARIO */}
          <Link href="/inventory" className="col-span-2 md:col-span-1">
            <div className="bg-gradient-to-br from-slate-600 to-slate-700 dark:from-slate-700 dark:to-slate-800 hover:from-slate-700 hover:to-slate-800 dark:hover:from-slate-600 dark:hover:to-slate-700 rounded-xl p-4 flex flex-col items-center gap-2 transition-all shadow-md h-full justify-center group active:scale-95">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-tight">Inventario</span>
            </div>
          </Link>

          {/* COMISIONES JOHN */}
          <Link href="/transactions/john-commissions" className="col-span-2 md:col-span-1">
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 dark:from-amber-600 dark:to-amber-700 hover:from-amber-600 hover:to-amber-700 dark:hover:from-amber-500 dark:hover:to-amber-600 rounded-xl p-4 flex flex-col items-center gap-2 transition-all shadow-md h-full justify-center group active:scale-95">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-tight text-center leading-tight">Comisiones<br />John</span>
            </div>
          </Link>

          {/* SMART RESTOCK */}
          <Link href="/inventory/smart-restock" className="col-span-2 md:col-span-1">
            <div className="bg-gradient-to-br from-purple-600 to-purple-700 dark:from-purple-700 dark:to-purple-800 hover:from-purple-700 hover:to-purple-800 dark:hover:from-purple-600 dark:hover:to-purple-700 rounded-xl p-4 flex flex-col items-center gap-2 transition-all shadow-md h-full justify-center group active:scale-95">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-tight text-center leading-tight">Smart<br />Restock</span>
            </div>
          </Link>

          {/* CONTROL / SETTINGS */}
          <Link href="/settings" className="col-span-2 md:col-span-1">
            <div className="bg-gradient-to-br from-gray-600 to-gray-700 dark:from-gray-700 dark:to-gray-800 hover:from-gray-700 hover:to-gray-800 dark:hover:from-gray-600 dark:hover:to-gray-700 rounded-xl p-4 flex flex-col items-center gap-2 transition-all shadow-md h-full justify-center group active:scale-95">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                <Settings2 className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-tight text-center leading-tight">Configuración</span>
            </div>
          </Link>
        </div>


        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 md:col-span-5 lg:col-span-4">
          <Link href="/inventory" className="block">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 transition-colors h-full active:scale-95">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium uppercase tracking-wider flex items-center gap-1">
                <Package className="w-3 h-3" /> Productos
              </p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                {stats?.totalProductos || 0}
              </p>
              <p className={`text-xs font-bold mt-2 ${Number(stats?.cantidadStockBajo) > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-slate-400'}`}>
                {stats?.cantidadStockBajo || 0} stock bajo
              </p>
            </div>
          </Link>

          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 transition-colors">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Ventas Hoy</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {formatCurrency(stats?.ventasHoy || 0)}
            </p>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 md:col-span-7 lg:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Actividad Reciente
            </h3>
            <Link href="/audit">
              <button className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-semibold transition-colors">
                Ver todas
              </button>
            </Link>
          </div>

          {recentActivity && recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.slice(0, 5).map((transaction) => (
                <div
                  key={transaction.id}
                  className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 flex items-center justify-between transition-colors shadow-sm dark:shadow-none"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${transaction.amount > 0
                        ? 'bg-emerald-100 dark:bg-emerald-900/30'
                        : 'bg-red-100 dark:bg-red-900/30'
                        }`}
                    >
                      {transaction.amount > 0 ? (
                        <TrendingUp className={`w-5 h-5 ${transaction.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`} />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
                        {transaction.description}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(transaction.transaction_date)}
                      </p>
                    </div>
                  </div>
                  <div className={`text-right font-bold text-sm ${transaction.amount > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                    }`}>
                    {formatCurrency(transaction.amount)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              No hay actividad reciente
            </div>
          )}
        </div>

        {/* Analytics Section */}
        <div className="md:col-span-12">
          <GrossProfitChart />
        </div>
      </main>
    </div>
  );
}
