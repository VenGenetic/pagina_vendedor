'use client';

import { useTransactionsHistory, useAccounts } from '@/hooks/use-queries';
import { ArrowLeft, ArrowUpCircle, ArrowDownCircle, User, Loader2, FileText, Wallet, Trash2, ChevronDown, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AuditPage() {
  const { data: transactions, isLoading } = useTransactionsHistory();
  const { data: accounts } = useAccounts();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);

  const processedTransactions = useMemo(() => {
    if (!transactions || !accounts) return [];

    // Clone balances to avoid mutating original data if it were deep interacting
    const balances = new Map();
    accounts.forEach(acc => balances.set(acc.id, Number(acc.balance)));

    // Transactions are ordered Newest first
    // We walk backwards in time
    return transactions.map((tx: any) => {
      const accId = tx.account_id;
      const currentBal = balances.get(accId) || 0;

      const balanceAfter = currentBal;

      // Prepare balance for the "next" (older) iteration by reversing the operation
      // If it was Income (+), previous balance was lower (-)
      // If it was Expense (-), previous balance was higher (+)
      if (tx.type === 'INCOME') {
        balances.set(accId, currentBal - Number(tx.amount));
      } else {
        balances.set(accId, currentBal + Number(tx.amount));
      }

      return { ...tx, balance_after: balanceAfter };
    });
  }, [transactions, accounts]);

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    if (!processedTransactions) return {};

    return processedTransactions.reduce((groups: any, tx: any) => {
      const date = new Date(tx.created_at).toLocaleDateString('es-EC', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });

      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(tx);
      return groups;
    }, {});
  }, [processedTransactions]);

  const handleDeleteClick = (tx: any) => {
    setTransactionToDelete(tx);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!transactionToDelete) return;

    setIsDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user");

      const { data, error } = await supabase.rpc('rpc_reverse_transaction' as any, {
        p_transaction_id: transactionToDelete.id,
        p_user_id: user.id,
        p_reason: 'Reversión desde Historial Financiero'
      } as any);

      if (error) throw error;

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });

      setDeleteDialogOpen(false);
      setTransactionToDelete(null);
    } catch (error: any) {
      console.error('Error deleting transaction:', error);
      alert(error.message || 'Error al eliminar la transacción');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-2xl mx-auto flex h-16 items-center gap-4 px-4">
          <Link href="/">
            <button className="p-2 -ml-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Historial Financiero</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {transactions?.length || 0} movimientos registrados
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Cargando transacciones...</p>
          </div>
        ) : !processedTransactions || processedTransactions.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="bg-slate-100 dark:bg-slate-900 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileText className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sin movimientos</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2">No se han encontrado registros en el historial.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedTransactions).map(([date, txs]: [string, any]) => (
              <div key={date} className="space-y-4">
                {/* Date Header */}
                <div className="sticky top-16 z-40 bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-900 dark:to-slate-950 backdrop-blur-sm border-l-4 border-indigo-500 pl-4 py-2 rounded-r-lg shadow-sm">
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 capitalize">
                    {date}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {txs.length} {txs.length === 1 ? 'movimiento' : 'movimientos'}
                  </p>
                </div>

                {/* Transactions for this date */}
                <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-3 md:ml-6 space-y-6">
                  {txs.map((tx: any, index: number) => (
                    <div
                      key={tx.id}
                      className="ml-6 relative animate-in fade-in slide-in-from-bottom-4 duration-500"
                      style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
                    >
                      {/* Timeline Dot */}
                      <span className={cn(
                        "absolute -left-[31px] md:-left-[37px] top-1 h-4 w-4 rounded-full border-2 ring-4 ring-white dark:ring-slate-950",
                        tx.type === 'INCOME'
                          ? "bg-emerald-500 border-emerald-500 dark:border-emerald-400 dark:bg-emerald-400"
                          : tx.type === 'TRANSFER'
                            ? "bg-blue-500 border-blue-500 dark:border-blue-400 dark:bg-blue-400"
                            : "bg-rose-500 border-rose-500 dark:border-rose-400 dark:bg-rose-400"
                      )}></span>

                      {/* Content Card */}
                      <div className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all hover:border-slate-300 dark:hover:border-slate-700">

                        {/* Header Row */}
                        <div className="flex justify-between items-start gap-4 mb-3">
                          <div className="space-y-1 flex-1">
                            <span className="inline-flex items-center text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
                              {new Date(tx.created_at).toLocaleTimeString('es-EC', {
                                timeZone: 'America/Guayaquil',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base leading-tight">
                              {tx.description}
                            </h3>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="text-right whitespace-nowrap">
                              <div className={cn(
                                "text-lg font-bold tracking-tight",
                                tx.type === 'INCOME' ? "text-emerald-600 dark:text-emerald-400" :
                                  tx.type === 'TRANSFER' ? "text-blue-600 dark:text-blue-400" :
                                    "text-rose-600 dark:text-rose-400"
                              )}>
                                {tx.type === 'INCOME' ? '+' : tx.type === 'TRANSFER' ? '⇄' : '-'}{formatCurrency(tx.amount)}
                              </div>
                              <div className="text-xs text-slate-400 dark:text-slate-500 font-medium flex items-center justify-end gap-1.5 mt-1">
                                <Wallet className="w-3.5 h-3.5" />
                                <span>{formatCurrency(tx.balance_after)}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteClick(tx)}
                              className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                              title="Eliminar transacción"
                            >
                              <Undo2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Details Container */}
                        <div className="space-y-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                          {/* Flow Info - Always Show */}
                          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950/50 p-3 rounded-lg">
                            {tx.type === 'INCOME' ? (
                              <ArrowDownCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                            ) : tx.type === 'TRANSFER' ? (
                              <ArrowDownCircle className="h-5 w-5 text-blue-500 shrink-0" />
                            ) : (
                              <ArrowUpCircle className="h-5 w-5 text-rose-500 shrink-0" />
                            )}
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 leading-none mb-1">
                                {tx.type === 'INCOME' ? 'Entrada de Dinero' : tx.type === 'TRANSFER' ? 'Transferencia' : 'Salida de Dinero'}
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-1 rounded">
                                  {tx.type === 'INCOME'
                                    ? (tx.account_out_id ? (tx.account_out?.name || 'Externo') : 'Ingreso Externo')
                                    : tx.type === 'TRANSFER'
                                      ? (tx.account_out?.name || 'Cuenta Origen')
                                      : (tx.account?.name || 'Caja')}
                                </span>
                                <span className="text-slate-400 dark:text-slate-500">→</span>
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-1 rounded">
                                  {tx.type === 'INCOME'
                                    ? (tx.account?.name || 'Caja')
                                    : tx.type === 'TRANSFER'
                                      ? (tx.account_in?.name || 'Cuenta Destino')
                                      : (tx.account_out_id ? (tx.account_out?.name || 'Externo') : 'Gasto Externo')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Additional Details - Expandable Info */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {tx.reference_number && (
                              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-lg">
                                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Referencia:</span>
                                <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                                  {tx.reference_number}
                                </span>
                              </div>
                            )}

                            {tx.created_by_name && (
                              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-lg">
                                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  Operador:
                                </span>
                                <span className="font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                                  {tx.created_by_name}
                                </span>
                              </div>
                            )}

                            {tx.notes && (
                              <div className="col-span-1 sm:col-span-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 p-2.5 rounded-lg">
                                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block mb-1">Notas:</span>
                                <p className="text-xs text-blue-900 dark:text-blue-100">
                                  {tx.notes}
                                </p>
                              </div>
                            )}

                            {tx.type === 'TRANSFER' && tx.description && (
                              <div className="col-span-1 sm:col-span-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-2.5 rounded-lg">
                                <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block mb-1">Concepto:</span>
                                <p className="text-xs text-amber-900 dark:text-amber-100">
                                  {tx.description}
                                </p>
                              </div>
                            )}

                            {/* Details Section - Expandable */}
                            {tx.details && (
                              <div className="col-span-1 sm:col-span-2">
                                <button
                                  onClick={() => setExpandedTransactionId(expandedTransactionId === tx.id ? null : tx.id)}
                                  className="w-full flex items-center justify-between bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 p-2.5 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors"
                                >
                                  <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400">
                                    Detalles del Movimiento
                                  </span>
                                  <ChevronDown
                                    className={cn(
                                      "h-4 w-4 text-purple-600 dark:text-purple-400 transition-transform",
                                      expandedTransactionId === tx.id && "rotate-180"
                                    )}
                                  />
                                </button>

                                {expandedTransactionId === tx.id && (
                                  <div className="mt-2 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 p-3 rounded-lg space-y-2">
                                    {typeof tx.details === 'object' ? (
                                      <>
                                        {tx.details.items && Array.isArray(tx.details.items) && (
                                          <div>
                                            <p className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 mb-2">Productos:</p>
                                            <div className="space-y-2">
                                              {tx.details.items.map((item: any, idx: number) => (
                                                <div key={idx} className="bg-white dark:bg-slate-900 p-2 rounded border border-purple-200 dark:border-purple-800/50">
                                                  <div className="flex justify-between items-start gap-2">
                                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{item.name || item.sku}</span>
                                                    <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">{item.quantity || 1}x</span>
                                                  </div>
                                                  {item.price && (
                                                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                                      Precio: {formatCurrency(item.price)}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {tx.details.payment_method && (
                                          <div>
                                            <p className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 mb-1">Forma de Pago:</p>
                                            <p className="text-xs text-purple-900 dark:text-purple-100 capitalize">
                                              {tx.details.payment_method}
                                            </p>
                                          </div>
                                        )}

                                        {tx.details.notes && (
                                          <div>
                                            <p className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 mb-1">Notas:</p>
                                            <p className="text-xs text-purple-900 dark:text-purple-100">
                                              {tx.details.notes}
                                            </p>
                                          </div>
                                        )}

                                        {tx.details.invoice_number && (
                                          <div>
                                            <p className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 mb-1">Factura:</p>
                                            <p className="text-xs text-purple-900 dark:text-purple-100 font-mono">
                                              {tx.details.invoice_number}
                                            </p>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <pre className="text-xs text-purple-900 dark:text-purple-100 overflow-auto max-h-40">
                                        {JSON.stringify(tx.details, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Revertir transacción?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción creará una contra-transacción para anular el movimiento. El saldo y/o inventario serán ajustados.
                {transactionToDelete && (
                  <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{transactionToDelete.description}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      Monto: {formatCurrency(transactionToDelete.amount)}
                    </p>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Revirtiendo...
                  </>
                ) : (
                  'Revertir'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
