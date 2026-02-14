'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDeletePurchase } from '@/hooks/use-queries';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Trash2, AlertTriangle, X, Check, Edit2, ArrowLeft, Package, Loader2, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PurchaseBatch {
  id: string;
  created_at: string;
  transaction_id: string | null;
  description: string;
  total_cost: number;
  total_items: number;
  is_free_entry: boolean;
  items: {
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    unit_price: number;
    movement_id: string;
    cost_price: number;
    selling_price: number;
  }[];
  transaction_notes?: string;
  transaction_reference_number?: string;
}

import { EditTransactionModal } from '@/components/transactions/edit-transaction-modal';

export default function PurchaseHistoryPage() {
  const queryClient = useQueryClient();
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const { mutate: deletePurchase, isPending: isDeleting } = useDeletePurchase();
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editProfitValues, setEditProfitValues] = useState<Record<string, string>>({});

  // State for editing generic transaction details
  const [editingTx, setEditingTx] = useState<any>(null);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['purchase-batches'],
    queryFn: async (): Promise<PurchaseBatch[]> => {
      // Get all IN movements with their products and transactions
      const { data: movements, error } = await supabase
        .from('inventory_movements')
        .select(`
          id,
          product_id,
          quantity_change,
          unit_price,
          total_value,
          transaction_id,
          created_at,
          reason,
          notes,
          products (
            id,
            name,
            sku,
            cost_price,
            selling_price
          )
        `)
        .eq('type', 'IN')
        .in('reason', ['PURCHASE', 'ADJUSTMENT'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by transaction_id or by date+notes for free entries
      const grouped = new Map<string, any[]>();

      (movements || []).forEach((mov: any) => {
        let key: string;
        if (mov.transaction_id) {
          key = mov.transaction_id;
        } else {
          // Free entries: group by date (round to nearest minute) + notes
          const dateKey = new Date(mov.created_at).toISOString().slice(0, 16);
          key = `free_${dateKey}_${mov.notes || 'no-notes'}`;
        }

        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(mov);
      });

      // Get transaction details for each batch
      const transactionIds = Array.from(grouped.keys()).filter(k => !k.startsWith('free_'));
      const { data: transactions } = await supabase
        .from('transactions')
        .select('id, description, amount, created_at, notes, reference_number')
        .in('id', transactionIds);

      const transactionMap = new Map((transactions || []).map((t: any) => [t.id, t]));

      // Build batch objects
      const result: PurchaseBatch[] = [];

      grouped.forEach((items, key) => {
        const isFree = key.startsWith('free_');
        const transaction = isFree ? null : transactionMap.get(key);

        const batch: PurchaseBatch = {
          id: key,
          created_at: items[0].created_at,
          transaction_id: isFree ? null : key,
          description: transaction?.description ||
            (items[0].notes || 'Ingreso sin costo'),
          total_cost: items.reduce((sum, item) => sum + (item.total_value || 0), 0),
          total_items: items.reduce((sum, item) => sum + item.quantity_change, 0),
          is_free_entry: isFree,
          items: items.map((item: any) => ({
            product_id: item.product_id,
            product_name: item.products?.name || 'Producto desconocido',
            product_sku: item.products?.sku || '',
            quantity: item.quantity_change,
            unit_price: item.unit_price || 0,
            movement_id: item.id,
            cost_price: item.products?.cost_price || 0,
            selling_price: item.products?.selling_price || 0,
          })),
          transaction_notes: transaction?.notes,
          transaction_reference_number: transaction?.reference_number,
        };

        result.push(batch);
      });

      return result.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });

  const updateSellingPrice = useMutation({
    mutationFn: async ({ productId, newPrice }: { productId: string; newPrice: number }) => {
      const { error } = await (supabase as any)
        .from('products')
        .update({ selling_price: newPrice })
        .eq('id', productId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-batches'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditingProduct(null);
      setEditProfitValues({});
      alert('Precio de venta actualizado correctamente');
    },
    onError: () => {
      alert('Error al actualizar el precio');
    },
  });



  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
      <EditTransactionModal
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
      />
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-5xl mx-auto flex h-16 items-center gap-4 px-4">
          <Link href="/transactions/purchase">
            <button className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
              <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
            </button>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Historial de Ingresos</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Revisa y gestiona tus entradas de inventario</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          </div>
        ) : !batches || batches.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">No hay ingresos registrados</p>
            <p className="text-sm text-slate-400 mt-2">Los ingresos de inventario aparecerán aquí</p>
          </div>
        ) : (
          <div className="space-y-4">
            {batches.map((batch) => (
              <Card key={batch.id} className="border-slate-200 dark:border-slate-800 overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-900/50 pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100">
                          {batch.description}
                        </CardTitle>
                        {batch.is_free_entry && (
                          <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold">
                            Sin Costo
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>📅 {formatDateTime(batch.created_at)}</span>
                        <span>📦 {batch.items.length} productos ({batch.total_items} unidades)</span>
                        {!batch.is_free_entry && (
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            💰 {formatCurrency(batch.total_cost)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Edit and Anular Buttons */}
                    {!batch.is_free_entry && batch.transaction_id && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                          onClick={() => {
                            setEditingTx({
                              id: batch.transaction_id,
                              description: batch.description,
                              amount: batch.total_cost,
                              notes: batch.transaction_notes || '',
                              reference_number: batch.transaction_reference_number || ''
                            });
                          }}
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Editar
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              disabled={isDeleting}
                            >
                              <Undo2 className="w-4 h-4 mr-2" />
                              Revertir
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-slate-900 dark:text-slate-100">¿Revertir esta compra?</AlertDialogTitle>
                              <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                                Esta acción creará una contra-transacción (&quot;Reembolso&quot;), reducirá el inventario ingresado y corregirá el saldo.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700">Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deletePurchase(batch.transaction_id!)}
                                className="bg-red-600 text-white hover:bg-red-700"
                              >
                                {isDeleting ? 'Revirtiendo...' : 'Sí, revertir'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedBatch(expandedBatch === batch.id ? null : batch.id)}
                    className="w-full text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    {expandedBatch === batch.id ? '▼ Ocultar detalles' : '▶ Ver detalles'}
                  </Button>

                  {expandedBatch === batch.id && (
                    <div className="mt-4 space-y-2">
                      {batch.items.map((item, idx) => {
                        const isEditing = editingProduct === item.product_id;
                        const costWithTax = item.cost_price;

                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between py-3 px-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-sm gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{item.product_name}</p>
                              <p className="text-xs text-slate-500 font-mono">{item.product_sku}</p>
                              <div className="text-xs text-slate-500 mt-1">
                                <span>Costo: {formatCurrency(item.cost_price)} • Venta: {formatCurrency(item.selling_price)}</span>
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={editProfitValues[item.product_id] || item.selling_price}
                                  onChange={(e) => setEditProfitValues({
                                    ...editProfitValues,
                                    [item.product_id]: e.target.value
                                  })}
                                  className="w-24 h-8 text-xs"
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                                  onClick={() => {
                                    const newPrice = parseFloat(editProfitValues[item.product_id] || '0');
                                    if (newPrice > 0) {
                                      updateSellingPrice.mutate({ productId: item.product_id, newPrice });
                                    }
                                  }}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-slate-400 hover:text-slate-600"
                                  onClick={() => {
                                    setEditingProduct(null);
                                    setEditProfitValues({});
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="text-right">
                                  <p className="font-bold text-slate-700 dark:text-slate-300">{item.quantity} un.</p>
                                  <p className="text-xs text-slate-500">{formatCurrency(item.unit_price)} c/u</p>
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                                  onClick={() => {
                                    setEditingProduct(item.product_id);
                                    setEditProfitValues({ [item.product_id]: item.selling_price.toString() });
                                  }}
                                  title="Editar precio de venta"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
