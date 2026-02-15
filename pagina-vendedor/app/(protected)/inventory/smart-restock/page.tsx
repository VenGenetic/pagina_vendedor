'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SmartReplenishmentItem, ReplenishmentCalculation } from '@/types/replenishment';
import { formatCurrency } from '@/lib/utils';
import { advancedProductSearch } from '@/lib/utils/advanced-search';
import { Loader2, Download, AlertTriangle, CheckCircle, Info, XCircle, Search, Filter } from 'lucide-react';
import Papa from 'papaparse';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from '@/components/ui/button';

export default function SmartRestockPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReplenishmentCalculation[]>([]);
  const [filteredData, setFilteredData] = useState<ReplenishmentCalculation[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');

  // Unique values for dropdowns
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: viewData, error } = await supabase
        .from('view_smart_replenishment')
        .select('*');

      if (error) throw error;

      // Apply Client-Side Logic (Capping & Status)
      const calculatedData: ReplenishmentCalculation[] = (viewData as any[]).map((item: SmartReplenishmentItem) => {
        const LEAD_TIME_DAYS = 2;
        const reorderPoint = (item.weighted_velocity * LEAD_TIME_DAYS) + item.dynamic_safety_stock;
        const MAX_SHELF_CAP = 20;

        // Define Status
        // Critical: Stock <= Velocity (1 day left)
        // Reorder: Stock <= Reorder Point
        // Overstock: Stock > Max Cap (20)

        let status: 'CRITICAL' | 'REORDER' | 'OK' | 'OVERSTOCK' = 'OK';

        if (item.current_stock <= item.weighted_velocity) {
          status = 'CRITICAL';
        } else if (item.current_stock <= reorderPoint) {
          status = 'REORDER';
        } else if (item.current_stock > MAX_SHELF_CAP) {
          status = 'OVERSTOCK';
        }

        // Logic for Buy Qty
        let rawNeed = 0;
        if (status === 'CRITICAL' || status === 'REORDER') {
          const CYCLE_DAYS = 7;
          const idealTarget = reorderPoint + (item.weighted_velocity * CYCLE_DAYS);
          rawNeed = Math.max(0, idealTarget - item.current_stock);
        }

        // 3. Capping Logic
        const spaceToCap = Math.max(0, MAX_SHELF_CAP - item.current_stock);
        const finalBuy = Math.min(rawNeed, spaceToCap);

        // Overrides
        if (item.replenishment_status === 'DO_NOT_BUY') status = 'OVERSTOCK';
        if (item.replenishment_status === 'MANUAL_REVIEW_NEW') status = 'OK';

        return {
          ...item,
          suggested_reorder_point: reorderPoint,
          raw_need: rawNeed,
          final_buy_qty: Math.ceil(finalBuy),
          uncapped_need: Math.ceil(rawNeed),
          is_capped: rawNeed > spaceToCap,
          status_label: status
        };
      });

      // Extract unique categories and brands
      const uniqueCategories = Array.from(new Set(calculatedData.map(d => d.category).filter(Boolean))) as string[];
      const uniqueBrands = Array.from(new Set(calculatedData.map(d => d.brand).filter(Boolean))) as string[];

      setCategories(uniqueCategories.sort());
      setBrands(uniqueBrands.sort());

      // Initial Sort
      const statusPriority = { 'CRITICAL': 0, 'REORDER': 1, 'OK': 2, 'OVERSTOCK': 3 };
      calculatedData.sort((a, b) => statusPriority[a.status_label] - statusPriority[b.status_label]);

      setData(calculatedData);
      setFilteredData(calculatedData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let result = data;

    // Search
    if (searchTerm) {
      // Use advanced search logic (Weighted + Fuzzy)
      // Casting to any to satisfy SearchableProduct constraint as SmartReplenishmentItem has required fields
      // And casting back to ReplenishmentCalculation[] because advancedProductSearch returns T[]
      result = (advancedProductSearch(result as any, searchTerm) as unknown) as ReplenishmentCalculation[];
    }

    // Status Filter
    if (statusFilter !== 'ALL') {
      result = result.filter(item => item.status_label === statusFilter);
    }

    // Category Filter
    if (categoryFilter !== 'ALL') {
      result = result.filter(item => item.category === categoryFilter);
    }

    // Brand Filter
    if (brandFilter !== 'ALL') {
      result = result.filter(item => item.brand === brandFilter);
    }

    setFilteredData(result);
  }, [searchTerm, statusFilter, categoryFilter, brandFilter, data]);


  const downloadCSV = () => {
    const csvData = filteredData.map(item => ({
      Estado: translateStatus(item.status_label),
      SKU: item.sku,
      Producto: item.name,
      Categoria: item.category || '',
      Marca: item.brand || '',
      'Sugerido Comprar': item.final_buy_qty,
      'Necesidad Real': item.uncapped_need,
      'Stock Actual': item.current_stock,
      'Velocidad Ponderada': item.weighted_velocity.toFixed(2),
      'Nota': item.is_capped ? 'Tope Max 20' : ''
    }));

    const csvUser = Papa.unparse(csvData);
    const blob = new Blob([csvUser], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smart_replenishment_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const translateStatus = (status: string) => {
    switch (status) {
      case 'CRITICAL': return 'Crítico';
      case 'REORDER': return 'Reordenar';
      case 'OK': return 'OK';
      case 'OVERSTOCK': return 'Excedente';
      default: return status;
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reabastecimiento Inteligente</h1>
          <p className="text-slate-500 dark:text-slate-400">Análisis de velocidad ponderada y reorden dinámico</p>
        </div>
        <Button
          onClick={downloadCSV}
          className="bg-green-600 hover:bg-green-700 text-white font-bold"
        >
          <Download className="w-4 h-4 mr-2" />
          Descargar CSV
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los Estados</SelectItem>
            <SelectItem value="CRITICAL">Crítico (0-1 Días)</SelectItem>
            <SelectItem value="REORDER">Reordenar</SelectItem>
            <SelectItem value="OK">OK</SelectItem>
            <SelectItem value="OVERSTOCK">Excedente</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las Categorías</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las Marcas</SelectItem>
            {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Velocidad</th>
                <th className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/10">Comprar</th>
                <th className="px-4 py-3 text-right text-slate-400">Necesidad Real</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredData.map((item) => (
                <tr key={item.product_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${item.status_label === 'CRITICAL' ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900' :
                      item.status_label === 'REORDER' ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900' :
                        item.status_label === 'OVERSTOCK' ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-900' :
                          'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900'
                      }`}>
                      {item.status_label === 'CRITICAL' && <XCircle className="w-3 h-3" />}
                      {item.status_label === 'REORDER' && <AlertTriangle className="w-3 h-3" />}
                      {item.status_label === 'OK' && <CheckCircle className="w-3 h-3" />}
                      {item.status_label === 'OVERSTOCK' && <Info className="w-3 h-3" />}
                      {translateStatus(item.status_label)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.sku} • {item.brand}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{item.current_stock}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{item.weighted_velocity.toFixed(2)}/día</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10">
                    {item.final_buy_qty}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {item.is_capped ? (
                      <span className="text-amber-500 font-medium" title="Tope Max 20">{item.uncapped_need}</span>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No se encontraron datos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
