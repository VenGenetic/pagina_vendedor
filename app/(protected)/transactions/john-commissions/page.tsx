'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProducts, useAccounts } from '@/hooks/use-queries';
import { useDebounce } from '@/hooks/use-debounce';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Search, DollarSign, Loader2, History, TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { advancedProductSearch } from '@/lib/utils/advanced-search';

interface CommissionItem {
  product_id: string;
  product_name?: string;
  product_cost?: number;
  selling_price?: number;
  commission_value?: number;
}

export default function JohnCommissionsPage() {
  const router = useRouter();
  const { data: accounts } = useAccounts();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const { data: productsData } = useProducts({ search: debouncedSearch });
  const products = productsData?.data || [];

  // "Yo Comisiono" State
  const [iComissionSearch, setIComissionSearch] = useState('');
  // const [iComissionModelSearch, setIComissionModelSearch] = useState(''); // Removed model filter
  const [iComissionProduct, setIComissionProduct] = useState<any>(null);
  const [iComissionManualMode, setIComissionManualMode] = useState(false); // NEW: Manual entry mode
  const [iComissionManualName, setIComissionManualName] = useState(''); // NEW: Manual product name
  const [iComissionManualCost, setIComissionManualCost] = useState(''); // NEW: Manual cost
  const [iComissionSellingPrice, setIComissionSellingPrice] = useState('');
  const [iComissionAccount, setIComissionAccount] = useState('');
  const [iComissionLoading, setIComissionLoading] = useState(false);

  // "Él Vende Nuestros" State
  const [heVendsSearch, setHeVendsSearch] = useState('');
  // const [heVendsModelSearch, setHeVendsModelSearch] = useState(''); // Removed model filter
  const [heVendsProduct, setHeVendsProduct] = useState<any>(null);
  const [heVendsManualMode, setHeVendsManualMode] = useState(false); // NEW: Manual entry mode
  const [heVendsManualName, setHeVendsManualName] = useState(''); // NEW: Manual product name
  const [heVendsManualCost, setHeVendsManualCost] = useState(''); // NEW: Manual cost
  const [heVendsQuantity, setHeVendsQuantity] = useState('1');
  const [heVendsAccount, setHeVendsAccount] = useState('');
  const [heVendsLoading, setHeVendsLoading] = useState(false);

  // Recent searches state
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Filtered products for search
  const iComissionDebouncedSearch = useDebounce(iComissionSearch, 50);
  const heVendsDebouncedSearch = useDebounce(heVendsSearch, 50);

  // Fetch ALL products to ensure client-side search finds everything (A-Z)
  // Large pageSize prevents truncation of products starting with later letters (T, V, Z)
  const { data: iComissionProductsData } = useProducts({ pageSize: 100000 });
  const allIComissionProducts = iComissionProductsData?.data || [];

  // Apply catalog-motos search algorithm
  const iComissionProducts = advancedProductSearch(
    allIComissionProducts,
    iComissionSearch
  );

  // DEBUGGING AID: Check if specific problematic term exists in loaded data
  // This helps identify if it's a fetch issue or search issue
  console.log(`[DEBUG] Loaded ${allIComissionProducts.length} items for search.`);
  if (iComissionSearch.toLowerCase().includes('wolf')) {
    const debugMatches = allIComissionProducts.filter(p => p.name.toLowerCase().includes('velocimetro') && p.name.toLowerCase().includes('wolf'));
    console.log('[DEBUG] "Velocimetro ... Wolf" items in Raw Data:', debugMatches);
  }

  const { data: heVendsProductsData } = useProducts({ pageSize: 100000 });
  const allHeVendsProducts = heVendsProductsData?.data || [];

  // Apply catalog-motos search algorithm
  const heVendsProducts = advancedProductSearch(
    allHeVendsProducts,
    heVendsSearch
  );

  // Calculate commission for "Yo Comisiono"
  const calculateIComissionValue = (): number => {
    if (!iComissionSellingPrice) return 0;
    const sellingPrice = parseFloat(iComissionSellingPrice) || 0;

    if (iComissionManualMode) {
      const manualCost = parseFloat(iComissionManualCost) || 0;
      const costWithIva = manualCost * 1.15;
      return Math.max(0, sellingPrice - costWithIva);
    }

    if (!iComissionProduct) return 0;
    const costWithIva = iComissionProduct.cost_price * 1.15;
    return Math.max(0, sellingPrice - costWithIva);
  };

  // Calculate amount for "Él Vende Nuestros"
  const calculateHeVendsValue = (): number => {
    const qty = parseInt(heVendsQuantity) || 1;

    if (heVendsManualMode) {
      const manualCost = parseFloat(heVendsManualCost) || 0;
      const costWithIva = manualCost * 1.15;
      return costWithIva * qty;
    }

    if (!heVendsProduct) return 0;
    const costWithIva = heVendsProduct.cost_price * 1.15;
    return costWithIva * qty;
  };

  // Helper function to save recent searches
  const addRecentSearch = (search: string) => {
    if (!search.trim()) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== search);
      return [search, ...filtered].slice(0, 5); // Keep only 5 recent
    });
  };

  // Handle "Yo Comisiono" Submit
  const handleIComissionSubmit = async () => {
    if (iComissionManualMode) {
      // Manual entry validation
      if (!iComissionManualName.trim() || !iComissionManualCost || !iComissionSellingPrice || !iComissionAccount) {
        alert('Por favor completa todos los campos');
        return;
      }
    } else {
      // Product from stock validation
      if (!iComissionProduct || !iComissionSellingPrice || !iComissionAccount) {
        alert('Por favor completa todos los campos');
        return;
      }
    }

    // Save the search to recent
    if (iComissionSearch.trim()) {
      addRecentSearch(iComissionSearch);
    }

    setIComissionLoading(true);
    try {
      const commissionValue = calculateIComissionValue();
      const productName = iComissionManualMode ? iComissionManualName : iComissionProduct.name;
      const costPrice = iComissionManualMode ? parseFloat(iComissionManualCost) : iComissionProduct.cost_price;

      // Create transaction for John's commission
      const { error } = await supabase
        .from('transactions')
        .insert({
          type: 'INCOME',
          amount: commissionValue,
          description: `Comisión para nosotros por venta de ${productName}${iComissionManualMode ? ' (No en stock)' : ''}`,
          account_id: iComissionAccount,
          account_in_id: iComissionAccount,
          payment_method: 'OTHER',
          reference_number: `JOHN-COMM-${Date.now()}`,
          notes: `Precio venta: ${iComissionSellingPrice}, Costo con IVA: ${(costPrice * 1.15).toFixed(2)}${iComissionManualMode ? ' | Producto manual: ' + productName : ''}`,
        } as any);

      if (error) throw error;

      alert('Comisión registrada exitosamente');
      setIComissionProduct(null);
      setIComissionSellingPrice('');
      setIComissionSearch('');
      setIComissionAccount('');
      setIComissionManualName('');
      setIComissionManualCost('');
      setIComissionManualMode(false);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al registrar la comisión');
    } finally {
      setIComissionLoading(false);
    }
  };

  // Handle "Él Vende Nuestros" Submit
  const handleHeVendsSubmit = async () => {
    if (heVendsManualMode) {
      // Manual entry validation
      if (!heVendsManualName.trim() || !heVendsManualCost || !heVendsAccount) {
        alert('Por favor completa todos los campos');
        return;
      }
    } else {
      // Product from stock validation
      if (!heVendsProduct || !heVendsAccount) {
        alert('Por favor completa todos los campos');
        return;
      }
    }

    // Save the search to recent
    if (heVendsSearch.trim()) {
      addRecentSearch(heVendsSearch);
    }

    setHeVendsLoading(true);
    try {
      const amount = calculateHeVendsValue();
      const qty = parseInt(heVendsQuantity) || 1;
      const productName = heVendsManualMode ? heVendsManualName : heVendsProduct.name;
      const costPrice = heVendsManualMode ? parseFloat(heVendsManualCost) : heVendsProduct.cost_price;

      // Create transaction for our income
      const { error } = await supabase
        .from('transactions')
        .insert({
          type: 'INCOME',
          amount: amount,
          description: `Venta de ${productName} por John (Él Vende Nuestros) x${qty}${heVendsManualMode ? ' (No en stock)' : ''}`,
          account_id: heVendsAccount,
          account_in_id: heVendsAccount,
          payment_method: 'OTHER',
          reference_number: `JOHN-VEND-${Date.now()}`,
          notes: `Costo unitario con IVA: ${(costPrice * 1.15).toFixed(2)}, Cantidad: ${qty}${heVendsManualMode ? ' | Producto manual: ' + productName : ''}`,
        } as any);

      if (error) throw error;

      alert('Venta registrada exitosamente');
      setHeVendsProduct(null);
      setHeVendsQuantity('1');
      setHeVendsSearch('');
      setHeVendsAccount('');
      setHeVendsManualName('');
      setHeVendsManualCost('');
      setHeVendsManualMode(false);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al registrar la venta');
    } finally {
      setHeVendsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 pb-16 md:pb-24 transition-colors">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm sticky top-0 z-40">
        <div className="container max-w-6xl flex h-16 items-center gap-4 px-4 mx-auto justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
              </button>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Comisiones de John</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Gestionar comisiones y ventas</p>
            </div>
          </div>
          <Link href="/transactions/john-commissions/history">
            <Button variant="outline" size="sm" className="gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Historial</span>
            </Button>
          </Link>
        </div>
      </header>

      <main className="container max-w-6xl px-4 py-8 mx-auto">
        <Tabs defaultValue="i-comission" className="w-full space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-white dark:bg-slate-900 p-1 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800">
            <TabsTrigger value="i-comission" className="data-[state=active]:bg-violet-100 dark:data-[state=active]:bg-violet-900/30 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-400">
              <TrendingUp className="h-4 w-4 mr-2" />
              Yo Comisiono
            </TabsTrigger>
            <TabsTrigger value="he-vends" className="data-[state=active]:bg-emerald-100 dark:data-[state=active]:bg-emerald-900/30 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400">
              <TrendingDown className="h-4 w-4 mr-2" />
              Él Vende Nuestros
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: "Yo Comisiono" */}
          <TabsContent value="i-comission" className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4 md:gap-6">
              {/* Form Section */}
              <div className="md:col-span-2 space-y-6">
                <Card className="border-violet-200 dark:border-violet-800/30 shadow-md bg-gradient-to-br from-white to-violet-50/30 dark:from-slate-900 dark:to-violet-950/10">
                  <CardHeader className="border-b border-violet-200 dark:border-violet-800/30 pb-4">
                    <CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-400 text-lg md:text-xl">
                      <DollarSign className="h-5 w-5" />
                      <span className="truncate">Nosotros Vendemos Productos de John</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5">
                    <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 bg-violet-50 dark:bg-violet-950/20 p-2 md:p-3 rounded-lg border border-violet-200 dark:border-violet-800/30">
                      Registra cuando vendemos un producto de John. Tu ganancia es la diferencia entre el precio de venta y el costo del repuesto con IVA.
                    </p>

                    {/* Product Search */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {iComissionManualMode ? 'Producto Manual (No en Stock)' : 'Buscar Producto'}
                        </Label>
                        <button
                          onClick={() => {
                            setIComissionManualMode(!iComissionManualMode);
                            setIComissionProduct(null);
                            setIComissionSearch('');
                            setIComissionManualName('');
                            setIComissionManualCost('');
                          }}
                          className="text-xs px-3 py-1 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-800/50 transition-colors font-medium"
                        >
                          {iComissionManualMode ? '🔍 Buscar en Stock' : '✏️ Entrada Manual'}
                        </button>
                      </div>

                      {!iComissionManualMode ? (
                        <>
                          {/* Part Name Filter */}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                              placeholder="Buscar repuesto (Ej: velocímetro wolf, tanque gn125...)"
                              value={iComissionSearch}
                              onChange={(e) => setIComissionSearch(e.target.value)}
                              className="pl-10 pr-10 bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 focus-visible:ring-violet-500 text-sm"
                              autoComplete="off"
                            />
                            {iComissionSearch && (
                              <button
                                onClick={() => {
                                  setIComissionSearch('');
                                  setIComissionProduct(null);
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Manual Entry Fields */}
                          <div className="space-y-3 bg-amber-50/50 dark:bg-amber-950/10 p-4 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-800/50">
                            <div>
                              <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">Nombre del Repuesto</Label>
                              <Input
                                placeholder="Ej: Velocímetro Wolf 2023"
                                value={iComissionManualName}
                                onChange={(e) => setIComissionManualName(e.target.value)}
                                className="mt-1 bg-white dark:bg-slate-950 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">Costo del Repuesto (sin IVA)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={iComissionManualCost}
                                onChange={(e) => setIComissionManualCost(e.target.value)}
                                className="mt-1 bg-white dark:bg-slate-950 text-sm"
                              />
                            </div>
                          </div>
                        </>
                      )}
                      {iComissionSearch && iComissionProducts.length > 0 && (
                        <div className="absolute z-50 w-full max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 shadow-2xl backdrop-blur-sm ring-1 ring-black/5">
                          <div className="sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-900/90 px-4 py-2 text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center backdrop-blur-sm">
                            <span>✓ {iComissionProducts.length} Resultados encontrados</span>
                            <span className="text-[10px] bg-violet-100 dark:bg-violet-900/50 px-2 py-0.5 rounded-full">Buscador Inteligente Activo</span>
                          </div>
                          <div className="p-1.5 space-y-1">
                            {iComissionProducts.slice(0, 15).map((p) => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setIComissionProduct(p);
                                  setIComissionSearch('');
                                }}
                                className="w-full text-left px-3 py-3 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 border border-transparent hover:border-violet-200 dark:hover:border-violet-800 transition-all group relative overflow-hidden"
                              >
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="flex justify-between items-start gap-3 pl-2">
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-violet-700 dark:group-hover:text-violet-400 text-sm leading-tight">
                                      {p.name}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                      <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px] tracking-tight">{p.sku}</span>
                                      {p.category && <span className="truncate max-w-[120px] hidden sm:inline-block opacity-70">• {p.category}</span>}
                                    </div>
                                  </div>
                                  <div className="text-right flex flex-col items-end">
                                    <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200 group-hover:scale-105 transition-transform">
                                      {formatCurrency(p.cost_price || 0)}
                                    </div>
                                    {(p.current_stock !== undefined) && (
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-1 ${p.current_stock > 0
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                                        }`}>
                                        {p.current_stock > 0 ? `${p.current_stock} disp.` : 'Agotado'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                          {iComissionProducts.length > 15 && (
                            <div className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 text-center border-t border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                              Ver {iComissionProducts.length - 15} resultados más...
                            </div>
                          )}
                        </div>
                      )}
                      {!iComissionSearch && recentSearches.length > 0 && !iComissionProduct && (
                        <div className="absolute z-50 w-full max-h-72 md:max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
                          <div className="px-3 md:px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                            🔍 Recientes
                          </div>
                          {recentSearches.map((search, idx) => (
                            <button
                              key={idx}
                              onClick={() => setIComissionSearch(search)}
                              className="w-full text-left px-3 md:px-4 py-2 md:py-3 hover:bg-violet-50 dark:hover:bg-violet-950/30 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors text-sm"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <Search className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                <span className="text-slate-700 dark:text-slate-300 truncate">{search}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {iComissionSearch && iComissionProducts.length === 0 && (
                        <div className="absolute z-50 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xl">
                          <div className="px-4 py-4 text-center">
                            <p className="text-sm text-slate-600 dark:text-slate-400">No encontrado</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Intenta otro término</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Selected Product or Manual Entry Confirmation */}
                    {(iComissionProduct || (iComissionManualMode && iComissionManualName && iComissionManualCost)) && (
                      <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/30 dark:to-violet-900/20 border border-violet-300 dark:border-violet-700/50 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-lg">
                              {iComissionManualMode ? iComissionManualName : iComissionProduct.name}
                              {iComissionManualMode && <span className="ml-2 text-xs font-normal bg-amber-200 dark:bg-amber-900/50 text-amber-800 dark:text-amber-400 px-2 py-1 rounded">No en stock</span>}
                            </p>
                            {!iComissionManualMode && (
                              <p className="text-sm text-slate-600 dark:text-slate-400">SKU: {iComissionProduct.sku}</p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              if (iComissionManualMode) {
                                setIComissionManualName('');
                                setIComissionManualCost('');
                              } else {
                                setIComissionProduct(null);
                              }
                            }}
                            className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 bg-white dark:bg-slate-900 px-3 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/30"
                          >
                            Cambiar
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-violet-200 dark:border-violet-700/50">
                          <div>
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Costo Unitario</span>
                            <p className="font-bold text-violet-700 dark:text-violet-400 text-lg mt-1">
                              {formatCurrency(iComissionManualMode ? parseFloat(iComissionManualCost) : iComissionProduct.cost_price)}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">+ IVA 15%</span>
                            <p className="font-bold text-slate-700 dark:text-slate-300 text-lg mt-1">
                              {formatCurrency((iComissionManualMode ? parseFloat(iComissionManualCost) : iComissionProduct.cost_price) * 1.15)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Selling Price Input */}
                    {(iComissionProduct || (iComissionManualMode && iComissionManualName && iComissionManualCost)) && (
                      <div className="space-y-3">
                        <Label className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-300">Precio de Venta al Cliente</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={iComissionSellingPrice}
                          onChange={(e) => setIComissionSellingPrice(e.target.value)}
                          className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-lg font-semibold focus-visible:ring-violet-500"
                        />
                      </div>
                    )}

                    {/* Account Selection */}
                    {(iComissionProduct || (iComissionManualMode && iComissionManualName && iComissionManualCost)) && (
                      <div className="space-y-3">
                        <Label className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-300">¿A Qué Cuenta Entra la Ganancia?</Label>
                        <Select value={iComissionAccount} onValueChange={setIComissionAccount}>
                          <SelectTrigger className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 focus:ring-violet-500 text-sm">
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts?.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.name} ({formatCurrency(acc.balance)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Submit Button */}
                    {((iComissionProduct || (iComissionManualMode && iComissionManualName && iComissionManualCost)) && iComissionSellingPrice && iComissionAccount) && (
                      <Button
                        onClick={handleIComissionSubmit}
                        disabled={iComissionLoading}
                        className="w-full bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white font-bold h-11 md:h-12 rounded-lg shadow-lg text-sm md:text-base"
                      >
                        {iComissionLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Registrando...
                          </>
                        ) : (
                          'Registrar Ganancia'
                        )}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Preview/Summary Section */}
              {((iComissionProduct || (iComissionManualMode && iComissionManualName && iComissionManualCost)) && iComissionSellingPrice) && (
                <div className="md:col-span-1">
                  <Card className="border-violet-200 dark:border-violet-800/30 shadow-md bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/20 dark:to-violet-900/10 md:sticky md:top-24">
                    <CardHeader className="border-b border-violet-200 dark:border-violet-800/30 pb-3">
                      <CardTitle className="text-violet-700 dark:text-violet-400 text-lg">📊 Resumen</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 md:pt-6 space-y-3">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs md:text-sm text-slate-600 dark:text-slate-400">Precio Venta</span>
                          <span className="font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">{formatCurrency(parseFloat(iComissionSellingPrice) || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-violet-200 dark:border-violet-700/50">
                          <span className="text-xs md:text-sm text-slate-600 dark:text-slate-400">Costo + IVA</span>
                          <span className="font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
                            {formatCurrency(-((iComissionManualMode ? parseFloat(iComissionManualCost) : iComissionProduct.cost_price) * 1.15))}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t-2 border-violet-300 dark:border-violet-600">
                          <span className="text-xs md:text-sm font-bold text-violet-700 dark:text-violet-400">Tu Ganancia</span>
                          <span className="font-bold text-lg md:text-2xl text-violet-700 dark:text-violet-400">{formatCurrency(calculateIComissionValue())}</span>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-slate-900 rounded-lg p-2 md:p-3 text-xs text-slate-600 dark:text-slate-400">
                        <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1 text-xs">Desglose:</p>
                        <p>V: {formatCurrency(parseFloat(iComissionSellingPrice) || 0)}</p>
                        <p>C: {formatCurrency(iComissionManualMode ? parseFloat(iComissionManualCost) : iComissionProduct.cost_price)}</p>
                        <p>IVA (15%): {formatCurrency((iComissionManualMode ? parseFloat(iComissionManualCost) : iComissionProduct.cost_price) * 0.15)}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: "Él Vende Nuestros" */}
          <TabsContent value="he-vends" className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4 md:gap-6">
              {/* Form Section */}
              <div className="md:col-span-2 space-y-6">
                <Card className="border-emerald-200 dark:border-emerald-800/30 shadow-md bg-gradient-to-br from-white to-emerald-50/30 dark:from-slate-900 dark:to-emerald-950/10">
                  <CardHeader className="border-b border-emerald-200 dark:border-emerald-800/30 pb-4">
                    <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-lg md:text-xl">
                      <DollarSign className="h-5 w-5" />
                      <span className="truncate">John Vende Nuestros Repuestos</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5">
                    <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 bg-emerald-50 dark:bg-emerald-950/20 p-2 md:p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/30">
                      Registra cuando John vende uno de nuestros repuestos. Nosotros recibimos el costo unitario con IVA por cada unidad.
                    </p>

                    {/* Product Search */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {heVendsManualMode ? 'Producto Manual (No en Stock)' : 'Buscar Producto'}
                        </Label>
                        <button
                          onClick={() => {
                            setHeVendsManualMode(!heVendsManualMode);
                            setHeVendsProduct(null);
                            setHeVendsSearch('');
                            setHeVendsManualName('');
                            setHeVendsManualCost('');
                          }}
                          className="text-xs px-3 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-colors font-medium"
                        >
                          {heVendsManualMode ? '🔍 Buscar en Stock' : '✏️ Entrada Manual'}
                        </button>
                      </div>

                      {!heVendsManualMode ? (
                        <>
                          {/* Part Name Filter */}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                              placeholder="Buscar repuesto (Ej: velocímetro wolf, tanque gn125...)"
                              value={heVendsSearch}
                              onChange={(e) => setHeVendsSearch(e.target.value)}
                              className="pl-10 pr-10 bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 focus-visible:ring-emerald-500 text-sm"
                              autoComplete="off"
                            />
                            {heVendsSearch && (
                              <button
                                onClick={() => {
                                  setHeVendsSearch('');
                                  setHeVendsProduct(null);
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Manual Entry Fields */}
                          <div className="space-y-3 bg-amber-50/50 dark:bg-amber-950/10 p-4 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-800/50">
                            <div>
                              <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">Nombre del Repuesto</Label>
                              <Input
                                placeholder="Ej: Velocímetro Wolf 2023"
                                value={heVendsManualName}
                                onChange={(e) => setHeVendsManualName(e.target.value)}
                                className="mt-1 bg-white dark:bg-slate-950 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">Costo del Repuesto (sin IVA)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={heVendsManualCost}
                                onChange={(e) => setHeVendsManualCost(e.target.value)}
                                className="mt-1 bg-white dark:bg-slate-950 text-sm"
                              />
                            </div>
                          </div>
                        </>
                      )}
                      {heVendsSearch && heVendsProducts.length > 0 && (
                        <div className="absolute z-50 w-full max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 shadow-2xl backdrop-blur-sm ring-1 ring-black/5">
                          <div className="sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-900/90 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center backdrop-blur-sm">
                            <span>✓ {heVendsProducts.length} Resultados encontrados</span>
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded-full">Buscador Inteligente Activo</span>
                          </div>
                          <div className="p-1.5 space-y-1">
                            {heVendsProducts.slice(0, 15).map((p) => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setHeVendsProduct(p);
                                  setHeVendsSearch('');
                                }}
                                className="w-full text-left px-3 py-3 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800 transition-all group relative overflow-hidden"
                              >
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="flex justify-between items-start gap-3 pl-2">
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 text-sm leading-tight">
                                      {p.name}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                      <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px] tracking-tight">{p.sku}</span>
                                      {p.category && <span className="truncate max-w-[120px] hidden sm:inline-block opacity-70">• {p.category}</span>}
                                    </div>
                                  </div>
                                  <div className="text-right flex flex-col items-end">
                                    <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200 group-hover:scale-105 transition-transform">
                                      {formatCurrency(p.cost_price || 0)}
                                    </div>
                                    {(p.current_stock !== undefined) && (
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-1 ${p.current_stock > 0
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                                        }`}>
                                        {p.current_stock > 0 ? `${p.current_stock} disp.` : 'Agotado'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                          {heVendsProducts.length > 15 && (
                            <div className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 text-center border-t border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                              Ver {heVendsProducts.length - 15} resultados más...
                            </div>
                          )}
                        </div>
                      )}
                      {!heVendsSearch && recentSearches.length > 0 && !heVendsProduct && (
                        <div className="absolute z-50 w-full max-h-72 md:max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
                          <div className="px-3 md:px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                            🔍 Recientes
                          </div>
                          {recentSearches.map((search, idx) => (
                            <button
                              key={idx}
                              onClick={() => setHeVendsSearch(search)}
                              className="w-full text-left px-3 md:px-4 py-2 md:py-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors text-sm"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <Search className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                <span className="text-slate-700 dark:text-slate-300 truncate">{search}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {heVendsSearch && heVendsProducts.length === 0 && (
                        <div className="absolute z-50 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xl">
                          <div className="px-4 py-4 text-center">
                            <p className="text-sm text-slate-600 dark:text-slate-400">No encontrado</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Intenta otro término</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Selected Product or Manual Entry Confirmation */}
                    {(heVendsProduct || (heVendsManualMode && heVendsManualName && heVendsManualCost)) && (
                      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border border-emerald-300 dark:border-emerald-700/50 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-lg">
                              {heVendsManualMode ? heVendsManualName : heVendsProduct.name}
                              {heVendsManualMode && <span className="ml-2 text-xs font-normal bg-amber-200 dark:bg-amber-900/50 text-amber-800 dark:text-amber-400 px-2 py-1 rounded">No en stock</span>}
                            </p>
                            {!heVendsManualMode && (
                              <p className="text-sm text-slate-600 dark:text-slate-400">SKU: {heVendsProduct.sku}</p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              if (heVendsManualMode) {
                                setHeVendsManualName('');
                                setHeVendsManualCost('');
                              } else {
                                setHeVendsProduct(null);
                              }
                            }}
                            className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 bg-white dark:bg-slate-900 px-3 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          >
                            Cambiar
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-emerald-200 dark:border-emerald-700/50">
                          <div>
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Costo Unitario</span>
                            <p className="font-bold text-emerald-700 dark:text-emerald-400 text-lg mt-1">
                              {formatCurrency(heVendsManualMode ? parseFloat(heVendsManualCost) : heVendsProduct.cost_price)}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">+ IVA 15%</span>
                            <p className="font-bold text-slate-700 dark:text-slate-300 text-lg mt-1">
                              {formatCurrency((heVendsManualMode ? parseFloat(heVendsManualCost) : heVendsProduct.cost_price) * 1.15)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quantity Input */}
                    {(heVendsProduct || (heVendsManualMode && heVendsManualName && heVendsManualCost)) && (
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Cantidad Vendida</Label>
                        <Input
                          type="number"
                          min="1"
                          placeholder="1"
                          value={heVendsQuantity}
                          onChange={(e) => setHeVendsQuantity(e.target.value)}
                          className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-lg font-semibold focus-visible:ring-emerald-500"
                        />
                      </div>
                    )}

                    {/* Account Selection */}
                    {(heVendsProduct || (heVendsManualMode && heVendsManualName && heVendsManualCost)) && (
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">¿A Qué Cuenta Entra el Dinero?</Label>
                        <Select value={heVendsAccount} onValueChange={setHeVendsAccount}>
                          <SelectTrigger className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 focus:ring-emerald-500">
                            <SelectValue placeholder="Seleccionar cuenta..." />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts?.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.name} ({formatCurrency(acc.balance)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Submit Button */}
                    {((heVendsProduct || (heVendsManualMode && heVendsManualName && heVendsManualCost)) && heVendsQuantity && heVendsAccount) && (
                      <Button
                        onClick={handleHeVendsSubmit}
                        disabled={heVendsLoading}
                        className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold h-12 rounded-lg shadow-lg"
                      >
                        {heVendsLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Registrando...
                          </>
                        ) : (
                          'Registrar Venta'
                        )}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Preview/Summary Section */}
              {((heVendsProduct || (heVendsManualMode && heVendsManualName && heVendsManualCost)) && heVendsQuantity) && (
                <div className="lg:col-span-1">
                  <Card className="border-emerald-200 dark:border-emerald-800/30 shadow-md bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10 sticky top-24">
                    <CardHeader className="border-b border-emerald-200 dark:border-emerald-800/30">
                      <CardTitle className="text-emerald-700 dark:text-emerald-400">Resumen</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Precio Unitario</span>
                          <span className="font-bold text-lg text-slate-900 dark:text-slate-100">
                            {formatCurrency(heVendsManualMode ? parseFloat(heVendsManualCost) : heVendsProduct.cost_price)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 dark:text-slate-400">IVA 15%</span>
                          <span className="font-bold text-lg text-slate-900 dark:text-slate-100">
                            {formatCurrency((heVendsManualMode ? parseFloat(heVendsManualCost) : heVendsProduct.cost_price) * 0.15)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-emerald-200 dark:border-emerald-700/50">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Con IVA</span>
                          <span className="font-bold text-lg text-slate-900 dark:text-slate-100">
                            {formatCurrency((heVendsManualMode ? parseFloat(heVendsManualCost) : heVendsProduct.cost_price) * 1.15)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Cantidad</span>
                          <span className="font-bold text-lg text-slate-900 dark:text-slate-100">× {heVendsQuantity}</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t-2 border-emerald-300 dark:border-emerald-600">
                          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Total a Recibir</span>
                          <span className="font-bold text-2xl text-emerald-700 dark:text-emerald-400">{formatCurrency(calculateHeVendsValue())}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
