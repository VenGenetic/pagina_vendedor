'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccounts, useCreateIncome, useNominalAccounts } from '@/hooks/use-queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, History, Calculator, Wallet, Truck, Package } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

export default function NewIncomePage() {
  const router = useRouter();
  const { data: accounts } = useAccounts();
  const { data: nominalAccounts } = useNominalAccounts();
  const createIncome = useCreateIncome();

  const [description, setDescription] = useState('');

  // Values
  const [saleValue, setSaleValue] = useState('');
  const [costValue, setCostValue] = useState('');
  const [shippingValue, setShippingValue] = useState('');

  // Accounts
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [categoryId, setCategoryId] = useState(''); // Nominal Account
  const [costAccountId, setCostAccountId] = useState('');
  const [shippingAccountId, setShippingAccountId] = useState('');

  // Local state for immediate double-click prevention
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter accounts
  const activeAccounts = accounts?.sort((a, b) => a.name.localeCompare(b.name)) || [];

  const calculateProfit = () => {
    const s = parseFloat(saleValue) || 0;
    const c = parseFloat(costValue) || 0;
    const sh = parseFloat(shippingValue) || 0;
    return s - c - sh;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    const saleNum = parseFloat(saleValue);

    if (!description || !saleNum || !incomeAccountId || !categoryId) {
      alert('Por favor complete la descripción, el valor de venta, la cuenta de ingreso y la categoría.');
      return;
    }

    // Validar costos
    if (parseFloat(costValue) > 0 && !costAccountId) {
      alert('Si ingresa un costo de repuesto, debe seleccionar la cuenta de pago al proveedor.');
      return;
    }

    if (parseFloat(shippingValue) > 0 && !shippingAccountId) {
      alert('Si ingresa un costo de envío, debe seleccionar la cuenta de pago del envío.');
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedAccount = activeAccounts.find(a => a.id === incomeAccountId);
      const isCash = selectedAccount?.name.toLowerCase().includes('efectivo');
      const autoMethod = isCash ? 'EFECTIVO' : 'TRANSFERENCIA';

      const result = await createIncome.mutateAsync({
        descripcion: description,
        monto: saleNum,
        id_cuenta: incomeAccountId,
        id_categoria: categoryId,
        metodo_pago: autoMethod,
        costo_repuesto: parseFloat(costValue) || 0,
        id_cuenta_costo: costAccountId || undefined,
        costo_envio: parseFloat(shippingValue) || 0,
        id_cuenta_envio: shippingAccountId || undefined,
      });

      if (result.success) {
        alert('Transacción registrada exitosamente');
        router.push('/');
      } else {
        alert('Error al registrar: ' + result.error);
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error(error);
      alert('Error inesperado al registrar');
      setIsSubmitting(false);
    }
  };

  const profit = calculateProfit();
  const isPositive = profit >= 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-32 md:pb-24 transition-colors">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="container max-w-5xl flex h-16 items-center justify-between gap-4 px-4 mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
              </button>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Nueva Venta</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Calculadora de Comisión</p>
            </div>
          </div>

          <Link href="/transactions/income/history">
            <Button variant="outline" size="sm" className="gap-2 hidden sm:flex">
              <History className="h-4 w-4" />
              Historial
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden">
              <History className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </header>

      <main className="container max-w-5xl px-4 py-6 mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Main Input Section */}
          <div className="grid gap-6 md:grid-cols-2">

            {/* Description & Sale (The "Good" Stuff) */}
            <Card className="border-indigo-100 dark:border-indigo-900 shadow-sm overflow-hidden">
              <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-4 border-b border-indigo-100 dark:border-indigo-900 flex items-center gap-2">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg text-indigo-600 dark:text-indigo-400">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-indigo-900 dark:text-indigo-300">Datos de la Venta</h3>
              </div>
              <CardContent className="p-5 space-y-5">
                <div>
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Descripción del Producto</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ej: Kit de Cilindro Yamaha FZ"
                    className="h-12 text-lg bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1.5 block">Precio Venta</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-slate-400">$</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={saleValue}
                        onChange={(e) => setSaleValue(e.target.value)}
                        className="pl-7 h-12 text-lg font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50/30 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800 focus-visible:ring-indigo-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Cuenta Ingreso</Label>
                    <Select value={incomeAccountId} onValueChange={setIncomeAccountId}>
                      <SelectTrigger className="h-12 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                        <SelectValue placeholder="Destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeAccounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Concepto Nominal (Fuente)</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="h-12 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                      <SelectValue placeholder="Seleccione concepto..." />
                    </SelectTrigger>
                    <SelectContent>
                      {nominalAccounts?.filter(a => (a as any).type === 'INCOME').sort((a, b) => a.name.localeCompare(b.name)).map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Costs (The "Bad" Stuff) */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm border-t-4 border-t-orange-400">
              <CardContent className="p-5 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-5 h-5 text-orange-500" />
                  <h3 className="font-bold text-slate-700 dark:text-slate-200">Costos Asociados</h3>
                </div>

                {/* Product Cost */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold text-slate-500 uppercase">Costo del Repuesto</Label>
                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={costValue}
                        onChange={(e) => setCostValue(e.target.value)}
                        className="h-10 text-orange-700 dark:text-orange-400 border-slate-200 dark:border-slate-800 bg-orange-50/30 dark:bg-orange-900/10"
                        placeholder="$ 0.00"
                      />
                    </div>
                    <div className="col-span-3">
                      <Select value={costAccountId} onValueChange={setCostAccountId}>
                        <SelectTrigger className="h-10 text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                          <SelectValue placeholder="Pagado desde..." />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Shipping Cost */}
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Truck className="w-3 h-3" /> Costo de Envío
                  </Label>
                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={shippingValue}
                        onChange={(e) => setShippingValue(e.target.value)}
                        className="h-10 border-slate-200 dark:border-slate-800"
                        placeholder="$ 0.00"
                      />
                    </div>
                    <div className="col-span-3">
                      <Select value={shippingAccountId} onValueChange={setShippingAccountId}>
                        <SelectTrigger className="h-10 text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                          <SelectValue placeholder="Pagado desde..." />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sticky Footer for Mobile */}
          <div className="md:sticky md:bottom-4 md:z-40 fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50 md:rounded-xl md:border md:shadow-xl md:mx-auto md:max-w-5xl md:mb-6">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Ganancia Real</p>
                <p className={`text-2xl md:text-3xl font-black ${isPositive ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-500'}`}>
                  {formatCurrency(profit)}
                </p>
              </div>
              <Button
                type="submit"
                size="lg"
                className="flex-1 max-w-sm bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-14 md:h-12 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 text-lg md:text-base rounded-xl"
                disabled={isSubmitting || !description || !saleValue || !incomeAccountId || !categoryId}
              >
                {isSubmitting ? 'Guardando...' : 'REGISTRAR'}
              </Button>
            </div>
          </div>

        </form>
      </main>
    </div>
  );
}

