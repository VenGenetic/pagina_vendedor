'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccounts, useCreateExpense, useRecentExpenses, useDeleteExpense, useNominalAccounts } from '@/hooks/use-queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Clock, Loader2, Edit2, Trash2, Undo2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import Link from 'next/link';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { EditTransactionModal } from '@/components/transactions/edit-transaction-modal';

export default function NewExpensePage() {
  const router = useRouter();
  const { data: accounts } = useAccounts();
  const { data: nominalAccounts } = useNominalAccounts();
  const createExpense = useCreateExpense();
  const { mutate: deleteExpense, isPending: isDeleting } = useDeleteExpense();

  // History Hooks
  const { data: recentExpenses, isLoading: loadingHistory } = useRecentExpenses();


  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState(''); // Nominal Account
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'CHECK' | 'OTHER'>('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Editing State
  const [editingTx, setEditingTx] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amountNum = parseFloat(amount);

    if (!amountNum || !accountId || !categoryId) {
      alert('Por favor complete todos los campos requeridos, incluyendo la categoría.');
      return;
    }

    const categoryName = nominalAccounts?.find(a => a.id === categoryId)?.name || 'Gasto General';

    const paymentMethodMap: Record<string, 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO'> = {
      'CASH': 'EFECTIVO',
      'CARD': 'TARJETA',
      'TRANSFER': 'TRANSFERENCIA',
      'CHECK': 'CHEQUE',
      'OTHER': 'OTRO'
    };

    const result = await createExpense.mutateAsync({
      descripcion: categoryName,
      monto: amountNum,
      id_cuenta: accountId,
      id_categoria: categoryId,
      metodo_pago: paymentMethodMap[paymentMethod],
      numero_referencia: referenceNumber || undefined,
      notas: notes || undefined,
    });

    if (result.success) {
      // alert('Gasto registrado exitosamente'); // Removed to be less intrusive, or keep if desired
      router.push('/');
    } else {
      alert('Error al registrar el gasto: ' + result.error);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <EditTransactionModal
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
      />

      <header className="sticky top-0 z-50 w-full border-b bg-background">
        <div className="container flex h-16 items-center gap-4 px-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold">Nuevo Gasto</h1>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Información del Gasto (Dinero Saliente)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="category" className="text-base font-semibold text-slate-700 mb-1.5 block">Categoría (Cuenta Nominal) *</Label>
                <select
                  id="category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-12 px-3 border border-slate-200 rounded-xl bg-white text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  required
                >
                  <option value="">Seleccione una categoría</option>
                  {nominalAccounts?.filter(a => (a as any).type === 'EXPENSE').sort((a, b) => a.name.localeCompare(b.name)).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="amount" className="text-base font-semibold text-slate-700 mb-1.5 block">Monto *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-12 text-base text-red-600 font-bold"
                  required
                />
              </div>

              <div>
                <Label htmlFor="referenceNumber" className="text-base font-semibold text-slate-700 mb-1.5 block">Número de Referencia</Label>
                <Input
                  id="referenceNumber"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="h-12 text-base"
                  placeholder="Factura, recibo, etc."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Información de Pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="account">Cuenta de Origen (Saldo que disminuye) *</Label>
                <select
                  id="account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full h-12 px-3 border border-red-200 rounded-xl bg-white text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Seleccione la cuenta de pago</option>
                  {accounts?.sort((a, b) => a.name.localeCompare(b.name)).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({formatCurrency(account.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="paymentMethod">Método de Pago *</Label>
                <select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full h-12 px-3 border border-red-200 rounded-xl bg-white text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CHECK">Cheque</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>

              <div>
                <Label htmlFor="notes" className="text-base font-semibold text-slate-700 mb-1.5 block">Notas (Opcional)</Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas adicionales"
                  className="h-12 text-base"
                />
              </div>
            </CardContent>
          </Card>

          {amount && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center text-xl font-bold">
                  <span>Total:</span>
                  <span className="text-red-600">{formatCurrency(-(parseFloat(amount) || 0))}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            type="submit"
            className="w-full h-14 text-lg font-bold rounded-xl shadow-lg"
            disabled={createExpense.isPending || !amount || !accountId || !categoryId}
          >
            {createExpense.isPending ? 'Procesando...' : 'Registrar Gasto'}
          </Button>
        </form>

        {/* History Section */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-500" />
            Historial de Gastos
          </h2>

          {loadingHistory ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : recentExpenses && recentExpenses.length > 0 ? (
            <div className="space-y-3">
              {recentExpenses.map((tx: any) => (
                <Card key={tx.id} className="overflow-hidden">
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-bold text-slate-800 line-clamp-1">
                          {tx.description}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {formatDateTime(tx.created_at)}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Ref: {tx.reference_number || 'N/A'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="font-bold text-red-600 whitespace-nowrap">
                          {formatCurrency(-Math.abs(tx.amount))}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                          onClick={() => setEditingTx(tx)}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Editar
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50"
                              disabled={isDeleting}
                            >
                              <Undo2 className="w-3 h-3 mr-1" />
                              Revertir
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Revertir este gasto?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción creará un contrasiento (Devolución) y corregirá el saldo. El gasto original se marcará como revertido.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteExpense(tx.id)}
                                className="bg-red-600 text-white hover:bg-red-700"
                              >
                                {isDeleting ? 'Revirtiendo...' : 'Sí, revertir'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {tx.notes && (
                      <div className="text-xs text-slate-500 italic border-t border-slate-100 pt-2">
                        {tx.notes}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 text-sm italic">
              No hay gastos recientes
            </div>
          )}
        </div>
      </main >
    </div >
  );
}
