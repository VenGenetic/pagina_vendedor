'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Download, TrendingUp, Package, Calendar, DollarSign, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

interface RestockSuggestion {
  product_id: string;
  sku: string;
  product_name: string;
  category: string;
  current_stock: number;
  min_stock_level: number;
  selling_price: number;
  cost_price: number;
  days_since_creation: number;
  total_sold: number;
  days_with_stock: number;
  avg_daily_sales: number;
  suggested_stock: number;
  quantity_to_order: number;
  estimated_cost: number;
}

export default function SmartRestockPage() {
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysCoverage, setDaysCoverage] = useState(30);
  const [lookbackDays, setLookbackDays] = useState(365);

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('calculate_smart_restock', {
        p_days_coverage: daysCoverage,
        p_lookback_days: lookbackDays
      } as any);

      if (error) throw error;
      setSuggestions(data || []);
    } catch (error) {
      console.error('Error loading restock suggestions:', error);
      alert('Error al cargar sugerencias de reabastecimiento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, []);

  const exportToCSV = () => {
    if (suggestions.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    // Group by category (using category as proxy for supplier)
    const grouped = suggestions.reduce((acc, item) => {
      const cat = item.category || 'Sin categoría';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {} as Record<string, RestockSuggestion[]>);

    // Build CSV
    let csv = 'Categoría/Proveedor,SKU,Producto,Stock Actual,Venta Diaria,Días Stock,Cantidad a Pedir,Costo Estimado\n';
    
    Object.entries(grouped).forEach(([category, items]) => {
      items.forEach(item => {
        csv += `"${category}","${item.sku}","${item.product_name}",${item.current_stock},${item.avg_daily_sales.toFixed(2)},${item.days_with_stock},${Math.ceil(item.quantity_to_order)},${item.estimated_cost.toFixed(2)}\n`;
      });
    });

    // Download
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const date = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `reabastecimiento_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalToOrder = suggestions.reduce((sum, s) => sum + s.quantity_to_order, 0);
  const totalCost = suggestions.reduce((sum, s) => sum + s.estimated_cost, 0);
  const newProducts = suggestions.filter(s => s.days_since_creation < 30).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-16">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="container max-w-7xl flex h-16 items-center gap-4 px-4 mx-auto justify-between">
          <div className="flex items-center gap-4">
            <Link href="/inventory">
              <button className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
              </button>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-violet-600" />
                Reabastecimiento Inteligente
              </h1>
              <p className="text-xs text-slate-500">Basado en venta diaria real (últimos {lookbackDays} días)</p>
            </div>
          </div>
          <Button onClick={exportToCSV} variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </header>

      <main className="container max-w-7xl px-4 py-8 mx-auto space-y-6">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Configuración</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="coverage" className="text-xs font-bold text-slate-500 uppercase">
                  Días de Cobertura
                </Label>
                <Input
                  id="coverage"
                  type="number"
                  min="7"
                  max="180"
                  value={daysCoverage}
                  onChange={(e) => setDaysCoverage(parseInt(e.target.value) || 30)}
                  className="mt-1"
                />
                <p className="text-xs text-slate-500 mt-1">Stock sugerido = Venta Diaria × {daysCoverage} días</p>
              </div>
              <div>
                <Label htmlFor="lookback" className="text-xs font-bold text-slate-500 uppercase">
                  Período de Análisis (días)
                </Label>
                <Input
                  id="lookback"
                  type="number"
                  min="30"
                  max="730"
                  value={lookbackDays}
                  onChange={(e) => setLookbackDays(parseInt(e.target.value) || 365)}
                  className="mt-1"
                />
                <p className="text-xs text-slate-500 mt-1">Historial de ventas a considerar</p>
              </div>
              <div className="flex items-end">
                <Button onClick={loadSuggestions} className="w-full bg-violet-600 hover:bg-violet-700" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Recalcular
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-violet-100 dark:bg-violet-900/20 rounded-lg">
                  <Package className="h-6 w-6 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Productos a Pedir</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{suggestions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Unidades Totales</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{Math.ceil(totalToOrder)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Costo Estimado</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalCost)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
                  <Calendar className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Productos Nuevos</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{newProducts}</p>
                  <p className="text-xs text-slate-400">&lt; 30 días</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Products Table */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          </div>
        ) : suggestions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No hay productos que necesiten reabastecimiento</p>
              <p className="text-sm text-slate-400">Todos los productos tienen stock suficiente</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Sugerencias de Compra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">SKU</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Producto</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Stock Actual</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Venta/Día</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Días Stock</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Sugerido</th>
                      <th className="text-center py-3 px-4 font-semibold text-violet-700 dark:text-violet-400">A Pedir</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Costo Est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((item) => (
                      <tr
                        key={item.product_id}
                        className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                      >
                        <td className="py-3 px-4 font-mono text-xs">{item.sku}</td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.product_name}</div>
                          <div className="text-xs text-slate-500">{item.category}</div>
                          {item.days_since_creation < 30 && (
                            <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded">
                              Nuevo ({item.days_since_creation}d)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`font-semibold ${item.current_stock < item.min_stock_level ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}>
                            {item.current_stock}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs">{item.avg_daily_sales.toFixed(2)}</td>
                        <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-400">{item.days_with_stock}</td>
                        <td className="py-3 px-4 text-center font-semibold text-blue-600 dark:text-blue-400">
                          {Math.ceil(item.suggested_stock)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-3 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-bold rounded">
                            {Math.ceil(item.quantity_to_order)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs">{formatCurrency(item.estimated_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
