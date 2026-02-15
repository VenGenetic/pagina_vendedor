'use client';

import { useCommissionHistory, useDeleteCommission } from '@/hooks/use-queries';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Calendar, DollarSign, AlertTriangle, ChevronDown, User, Package, Wallet, ArrowUpRight, ArrowDownLeft, TrendingDown, Edit2 } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

import { EditTransactionModal } from '@/components/transactions/edit-transaction-modal';

export default function CommissionHistoryPage() {
  const { data: commissions, isLoading } = useCommissionHistory();
  // const deleteMutation = useDeleteCommission(); // Not used anymore
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<any>(null); // State for editing

  // const handleDelete = async (id: string) => {
  //   deleteMutation.mutate(id);
  // };

  // Group commissions by date
  const groupedCommissions = useMemo(() => {
    if (!commissions) return {};

    return commissions.reduce((groups: any, tx: any) => {
      const date = new Date(tx.transaction_date || tx.created_at).toLocaleDateString('es-EC', {
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
  }, [commissions]);

  // Calculate totals
  const totals = useMemo(() => {
    if (!commissions) return { count: 0, amount: 0 };

    return {
      count: commissions.length,
      amount: commissions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
    };
  }, [commissions]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
      <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="container flex h-16 items-center gap-4 px-4 max-w-2xl mx-auto">
          <Link href="/transactions/income">
            <button className="p-2 -ml-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Historial de Ventas</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {totals.count} ventas registradas • {formatCurrency(totals.amount)} total
            </p>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-6">
        <EditTransactionModal
          isOpen={!!editingTx}
          onClose={() => setEditingTx(null)}
          transaction={editingTx}
        />
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="animate-spin">
              <Wallet className="h-10 w-10 text-emerald-500" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Cargando historial de ventas...</p>
          </div>
        )}

        {!isLoading && commissions?.length === 0 && (
          <div className="text-center py-20 px-6">
            <div className="bg-slate-100 dark:bg-slate-900 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Package className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sin ventas</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2">No hay ventas registradas aún.</p>
          </div>
        )}

        {!isLoading && commissions && commissions.length > 0 && (
          <div className="space-y-8">
            {Object.entries(groupedCommissions).map(([date, txs]: [string, any]) => (
              <div key={date} className="space-y-4">
                {/* Date Header */}
                <div className="sticky top-16 z-40 bg-gradient-to-r from-emerald-50 to-emerald-50/50 dark:from-emerald-950/30 dark:to-emerald-950/10 backdrop-blur-sm border-l-4 border-emerald-500 pl-4 py-2 rounded-r-lg shadow-sm">
                  <h2 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 capitalize">
                    {date}
                  </h2>
                  <p className="text-xs text-emerald-600 dark:text-emerald-300">
                    {txs.length} {txs.length === 1 ? 'venta' : 'ventas'} • {formatCurrency(txs.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0))}
                  </p>
                </div>

                {/* Transactions for this date */}
                <div className="space-y-4">
                  {txs.map((tx: any, index: number) => (
                    <div
                      key={tx.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:shadow-lg hover:border-emerald-300 dark:hover:border-emerald-700 transition-all animate-in fade-in slide-in-from-bottom-4 duration-500"
                      style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
                    >
                      {/* Header */}
                      <div className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                                Venta
                              </span>
                              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                {new Date(tx.transaction_date || tx.created_at).toLocaleTimeString('es-EC', {
                                  timeZone: 'America/Guayaquil',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base">
                              {tx.description}
                            </h3>
                          </div>

                          {/* Edit Button */}
                          <button
                            onClick={() => setEditingTx(tx)}
                            className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Amount and Account */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                            <Wallet className="h-4 w-4" />
                            <span className="text-xs font-medium">{tx.account?.name || 'Cuenta'}</span>
                          </div>
                          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(tx.amount)}
                          </span>
                        </div>
                      </div>

                      {/* Expandable Details */}
                      {(tx.reference_number || tx.created_by_name || tx.notes || tx.details || (tx.relatedTransactions && tx.relatedTransactions.length > 0)) && (
                        <div className="border-t border-slate-100 dark:border-slate-800">
                          <button
                            onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                            className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                              Detalles {tx.relatedTransactions && tx.relatedTransactions.length > 0 && `(${tx.relatedTransactions.length} movimientos)`}
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 text-slate-600 dark:text-slate-400 transition-transform",
                                expandedId === tx.id && "rotate-180"
                              )}
                            />
                          </button>

                          {expandedId === tx.id && (
                            <div className="px-5 pb-5 space-y-3 bg-slate-50 dark:bg-slate-800/30">
                              {/* Reference */}
                              {tx.reference_number && (
                                <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                  <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Número de Venta:</p>
                                  <p className="text-sm font-mono text-slate-700 dark:text-slate-300">{tx.reference_number}</p>
                                </div>
                              )}

                              {/* Operator */}
                              {tx.created_by_name && (
                                <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                                  <User className="h-4 w-4 text-indigo-500" />
                                  <div>
                                    <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Registrado por:</p>
                                    <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{tx.created_by_name}</p>
                                  </div>
                                </div>
                              )}

                              {/* Notes */}
                              {tx.notes && (
                                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 p-3 rounded-lg">
                                  <p className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 mb-1">Notas:</p>
                                  <p className="text-sm text-blue-900 dark:text-blue-100">{tx.notes}</p>
                                </div>
                              )}

                              {/* Transaction Details (JSON) */}
                              {tx.details && (
                                <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 p-3 rounded-lg space-y-2">
                                  <p className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400">Detalles de Productos:</p>

                                  {typeof tx.details === 'object' ? (
                                    <>
                                      {tx.details.items && Array.isArray(tx.details.items) && (
                                        <div className="space-y-2">
                                          {tx.details.items.map((item: any, idx: number) => (
                                            <div key={idx} className="bg-white dark:bg-slate-900 p-2 rounded border border-purple-200 dark:border-purple-800/50 text-xs">
                                              <div className="flex justify-between items-start gap-2">
                                                <div>
                                                  <p className="font-semibold text-slate-800 dark:text-slate-200">{item.name || item.sku}</p>
                                                  {item.sku && item.name && <p className="text-slate-500 dark:text-slate-400 text-[10px]">{item.sku}</p>}
                                                </div>
                                                <span className="font-mono text-slate-600 dark:text-slate-400">{item.quantity || 1}x</span>
                                              </div>
                                              {item.price && (
                                                <p className="text-slate-600 dark:text-slate-400 text-[10px] mt-1">
                                                  Precio: {formatCurrency(item.price)}
                                                </p>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {tx.details.payment_method && (
                                        <div className="text-xs">
                                          <p className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                                            Pago: {tx.details.payment_method}
                                          </p>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <pre className="text-xs text-purple-900 dark:text-purple-100 overflow-auto max-h-40 bg-white dark:bg-slate-900 p-2 rounded">
                                      {JSON.stringify(tx.details, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              )}

                              {/* Related Transactions */}
                              {tx.relatedTransactions && tx.relatedTransactions.length > 0 && (
                                <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 p-3 rounded-lg space-y-2">
                                  <p className="text-[10px] uppercase font-bold text-orange-600 dark:text-orange-400">Movimientos Relacionados:</p>
                                  <div className="space-y-2">
                                    {tx.relatedTransactions.map((relTx: any, idx: number) => (
                                      <div key={idx} className="bg-white dark:bg-slate-900 p-2 rounded border border-orange-200 dark:border-orange-800/50">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex items-start gap-2 flex-1 min-w-0">
                                            {relTx.type === 'EXPENSE' ? (
                                              <TrendingDown className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
                                            ) : (
                                              <ArrowUpRight className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                {relTx.description}
                                              </p>
                                              <p className="text-[10px] text-slate-600 dark:text-slate-400">
                                                {new Date(relTx.created_at).toLocaleTimeString('es-EC', {
                                                  timeZone: 'America/Guayaquil',
                                                  hour: '2-digit',
                                                  minute: '2-digit'
                                                })}
                                              </p>
                                            </div>
                                          </div>
                                          <span className={cn(
                                            "text-xs font-bold whitespace-nowrap flex-shrink-0",
                                            relTx.type === 'EXPENSE' ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"
                                          )}>
                                            {formatCurrency(relTx.type === 'EXPENSE' ? -Math.abs(relTx.amount) : Math.abs(relTx.amount))}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
