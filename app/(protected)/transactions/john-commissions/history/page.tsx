'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Search, Trash2, Calendar, DollarSign, Loader2, Filter } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  account_id: string;
  payment_method: string;
  reference_number: string;
  notes: string;
  created_at: string;
}

export default function JohnCommissionsHistoryPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'comisiones' | 'ventas'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .or(`reference_number.like.%JOHN-COMM%,reference_number.like.%JOHN-VEND%`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTransactions(transactions.filter(t => t.id !== id));
      setDeleteId(null);
      alert('Transacción eliminada correctamente');
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Error al eliminar la transacción');
    } finally {
      setIsDeleting(false);
    }
  };

  const getTransactionType = (ref: string) => {
    if (ref.includes('JOHN-COMM')) return 'Yo Comisiono';
    if (ref.includes('JOHN-VEND')) return 'Él Vende Nuestros';
    return 'Otra';
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = 
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.reference_number.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesFilter = true;
    if (filterType === 'comisiones') matchesFilter = t.reference_number.includes('JOHN-COMM');
    if (filterType === 'ventas') matchesFilter = t.reference_number.includes('JOHN-VEND');

    return matchesSearch && matchesFilter;
  });

  const totals = {
    all: filteredTransactions.reduce((sum, t) => sum + t.amount, 0),
    comisiones: filteredTransactions
      .filter(t => t.reference_number.includes('JOHN-COMM'))
      .reduce((sum, t) => sum + t.amount, 0),
    ventas: filteredTransactions
      .filter(t => t.reference_number.includes('JOHN-VEND'))
      .reduce((sum, t) => sum + t.amount, 0),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 pb-16 md:pb-24 transition-colors">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm sticky top-0 z-40">
        <div className="container max-w-6xl flex h-16 items-center gap-4 px-4 mx-auto justify-between">
          <div className="flex items-center gap-4">
            <Link href="/transactions/john-commissions">
              <button className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
              </button>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Historial de Comisiones</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Revisa y gestiona todos los movimientos</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-6xl px-4 py-8 mx-auto">
        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card className="border-violet-200 dark:border-violet-800/30 shadow-md bg-gradient-to-br from-violet-50 to-violet-100/30 dark:from-violet-950/20 dark:to-violet-900/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-violet-700 dark:text-violet-400 font-semibold">Yo Comisiono</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-violet-700 dark:text-violet-400">{formatCurrency(totals.comisiones)}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{filteredTransactions.filter(t => t.reference_number.includes('JOHN-COMM')).length} registros</p>
            </CardContent>
          </Card>

          <Card className="border-emerald-200 dark:border-emerald-800/30 shadow-md bg-gradient-to-br from-emerald-50 to-emerald-100/30 dark:from-emerald-950/20 dark:to-emerald-900/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">Él Vende Nuestros</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(totals.ventas)}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{filteredTransactions.filter(t => t.reference_number.includes('JOHN-VEND')).length} registros</p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 dark:border-blue-800/30 shadow-md bg-gradient-to-br from-blue-50 to-blue-100/30 dark:from-blue-950/20 dark:to-blue-900/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-blue-700 dark:text-blue-400 font-semibold">Total General</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">{formatCurrency(totals.all)}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{filteredTransactions.length} registros totales</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Filtros y Búsqueda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por descripción o referencia..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              {/* Filter */}
              <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Movimientos</SelectItem>
                  <SelectItem value="comisiones">Solo Yo Comisiono</SelectItem>
                  <SelectItem value="ventas">Solo Él Vende Nuestros</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Transactions List */}
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-400">Cargando historial...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <Card className="border-dashed border-slate-300 dark:border-slate-700">
            <CardContent className="py-12 text-center">
              <DollarSign className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-400">No hay movimientos que mostrar</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => (
              <Card key={transaction.id} className="border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white ${
                          transaction.reference_number.includes('JOHN-COMM')
                            ? 'bg-gradient-to-br from-violet-600 to-violet-700'
                            : 'bg-gradient-to-br from-emerald-600 to-emerald-700'
                        }`}>
                          {transaction.reference_number.includes('JOHN-COMM') ? '💰' : '📦'}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{transaction.description}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                              transaction.reference_number.includes('JOHN-COMM')
                                ? 'bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400'
                                : 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                            }`}>
                              {getTransactionType(transaction.reference_number)}
                            </span>
                            <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDateTime(transaction.created_at)}
                            </span>
                          </div>
                          {transaction.notes && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 bg-slate-50 dark:bg-slate-950/30 p-2 rounded">
                              {transaction.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${
                          transaction.reference_number.includes('JOHN-COMM')
                            ? 'text-violet-700 dark:text-violet-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}>
                          {formatCurrency(transaction.amount)}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Ref: {transaction.reference_number}</p>
                      </div>
                      <button
                        onClick={() => setDeleteId(transaction.id)}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg text-red-600 dark:text-red-400 transition-colors"
                        title="Eliminar transacción"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Transacción?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la transacción del historial. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Eliminando...
                </>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
