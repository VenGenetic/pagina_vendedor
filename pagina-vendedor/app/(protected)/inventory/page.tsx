'use client';

import { useState, useCallback } from 'react';
import { useProducts, useLowStockProducts, queryKeys, ProductFilters } from '@/hooks/use-queries';
import { useDebounce } from '@/hooks/use-debounce';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, AlertTriangle, Package, ChevronRight, Download, Trash2, Pencil, Filter, Plus, Minus, RefreshCw, TrendingUp, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { formatCurrency, isLowStock, calculateStockPercentage } from '@/lib/utils';
import * as XLSX from 'xlsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { advancedProductSearch } from '@/lib/utils/advanced-search';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ProductDialog } from '@/components/inventory/product-dialog';
import { ImportProductsDialog } from '@/components/inventory/import-products-dialog';
import { RestockDialog } from '@/components/inventory/restock-dialog';
import { inventoryService } from '@/lib/services/inventory';
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
} from "@/components/ui/alert-dialog";
import { Producto } from '@/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InventoryTable } from '@/components/inventory/inventory-table';

export default function InventoryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [stockFilter, setStockFilter] = useState<ProductFilters['stockStatus']>('all');
  const [page, setPage] = useState(1);
  // SERVER-SIDE SEARCH: Fetch only what is needed
  // Optimization: Reduced to 30 to improve rendering performance
  const pageSize = 30;

  const { data: productsData, isLoading } = useProducts({
    search: debouncedSearch,
    stockStatus: stockFilter,
    page: page,
    pageSize: pageSize
  });

  const products = productsData?.data || [];
  const totalCount = productsData?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const { data: lowStockProducts } = useLowStockProducts();
  const queryClient = useQueryClient();

  const [deleteProduct, setDeleteProduct] = useState<Producto | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [adjustmentPending, setAdjustmentPending] = useState<{ product: Producto, change: number } | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);

  const handleDelete = async () => {
    if (!deleteProduct) return;
    try {
      await inventoryService.deleteProduct(deleteProduct.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      setDeleteProduct(null);
    } catch (error) {
      console.error('Error deleting product', error);
      alert('Error eliminado producto');
    }
  };

  const handleResetNegativeStock = async () => {
    setIsResetting(true);
    try {
      await inventoryService.resetAllNegativeStock();
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
      queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
      setResetDialogOpen(false);
    } catch (error) {
      console.error('Error resetting negative stock', error);
      alert('Error reseteando stock negativo');
    } finally {
      setIsResetting(false);
    }
  };

  const handleConfirmAdjustment = async () => {
    if (!adjustmentPending) return;
    const { product, change } = adjustmentPending;
    setIsAdjusting(true);
    try {
      const newStock = Math.max(0, product.current_stock + change);
      // audited adjustment
      await inventoryService.adjustStockAudit(
        product.id,
        newStock,
        'SHRINKAGE',
        `Ajuste manual: ${change > 0 ? '+' : ''}${change}`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
      queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
      setAdjustmentPending(null);
    } catch (error) {
      console.error('Error updating stock', error);
      alert('Error actualizando stock');
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleUpdateStock = useCallback((product: Producto, change: number) => {
    setAdjustmentPending({ product, change });
  }, []);

  const handleProductSuccess = useCallback((data: any) => {
    if (data?.name) {
      setSearchTerm(data.name);
      setPage(1);
    }
  }, []);

  const handleRequestDelete = useCallback((product: Producto) => {
    setDeleteProduct(product);
  }, []);

  const handleExportExcel = async () => {
    try {
      // Export requires fetching all filtered data (we can make a special "getAll" call here)
      // For now, alerting user that export limit applies or implement a specific export endpoint
      alert("La exportación completa de grandes inventarios se está optimizando. Por ahora se exportarán los productos visibles.");
      // ... (keeping existing export logic for visible/cached items or refactoring later)
    } catch (error) {
      console.error(error);
    }
  };

  const handleExportCSV = async () => {
    // Similar handling for CSV
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 transition-colors font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors hidden sm:block">
                <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Inventario</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {totalCount} productos • Página {page} de {totalPages || 1}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/inventory/smart-restock">
              <Button
                variant="default"
                size="sm"
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white hidden md:flex"
              >
                <TrendingUp className="h-4 w-4" />
                <span>Reabastecimiento</span>
              </Button>
            </Link>
            <Link href="/inventory/smart-restock" className="md:hidden">
              <Button
                variant="default"
                size="icon"
                className="bg-violet-600 hover:bg-violet-700 text-white"
                title="Reabastecimiento Inteligente"
              >
                <TrendingUp className="h-4 w-4" />
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetDialogOpen(true)}
              title="Resetear Stock Negativo"
              className="gap-2 hidden md:flex text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reset Stock</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.products })}
              title="Refrescar Inventario"
              className="gap-2 hidden md:flex text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refrescar</span>
            </Button>
            {/* Export buttons temporarily hidden or simplified */}
            <div className="hidden sm:block">
              <ImportProductsDialog />
            </div>
            <ProductDialog onSuccess={handleProductSuccess} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Filters Area */}
        <div className="sticky top-16 bg-slate-50/95 dark:bg-slate-950/95 z-40 py-2 -mx-4 px-4 sm:mx-0 sm:px-0 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Buscar por nombre, SKU, marca..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm focus-visible:ring-indigo-500 rounded-lg"
              />
            </div>

            <Tabs defaultValue="all" value={stockFilter} onValueChange={(val) => {
              setStockFilter(val as any);
              setPage(1);
            }} className="w-full md:w-auto">
              <TabsList className="grid w-full grid-cols-4 bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
                <TabsTrigger value="all" className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">Todos</TabsTrigger>
                <TabsTrigger value="in_stock" className="text-xs data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">En Stock</TabsTrigger>
                <TabsTrigger value="low_stock" className="text-xs data-[state=active]:text-amber-600 dark:data-[state=active]:text-amber-400 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">Bajo</TabsTrigger>
                <TabsTrigger value="out_of_stock" className="text-xs data-[state=active]:text-rose-600 dark:data-[state=active]:text-rose-400 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">Agotado</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Low Stock Alert - Refined Design */}
        {(stockFilter === 'all' || stockFilter === 'low_stock') && lowStockProducts && lowStockProducts.length > 0 && !searchTerm && page === 1 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 flex items-start gap-4 shadow-sm">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm mb-1">
                Atención necesaria: {lowStockProducts.length} productos con stock bajo
              </h3>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mb-2">
                Se recomienda reabastecer estos productos pronto para evitar perder ventas.
              </p>
            </div>
          </div>
        )}

        {/* Product Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-slate-500 dark:text-slate-400 text-sm animate-pulse">Cargando inventario...</p>
          </div>
        ) : products && products.length > 0 ? (
          <div className="space-y-6">
            <InventoryTable
              products={products}
              onUpdateStock={handleUpdateStock}
              onDelete={handleRequestDelete}
              onSuccess={handleProductSuccess}
            />

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 py-8 border-t border-dashed border-slate-200 dark:border-slate-800 mt-8">
                <Button
                  variant="ghost"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-32 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" /> Anterior
                </Button>
                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Página <span className="text-indigo-600 dark:text-indigo-400 font-bold">{page}</span> de {totalPages}
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="w-32 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Siguiente <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center px-4">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
              No se encontraron productos
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto mb-6">
              {searchTerm
                ? `No hay resultados para "${searchTerm}". Intenta con otros términos.`
                : stockFilter !== 'all'
                  ? 'No hay productos en esta categoría.'
                  : 'Tu inventario parece vacío. Agrega tu primer producto para comenzar.'
              }
            </p>
            {stockFilter !== 'all' ? (
              <Button variant="outline" onClick={() => setStockFilter('all')} className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                Limpiar filtros
              </Button>
            ) : (
              <ProductDialog onSuccess={handleProductSuccess} />
            )}
          </div>
        )}
      </main>

      <AlertDialog open={!!deleteProduct} onOpenChange={(open) => !open && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar <span className="font-bold text-slate-900 dark:text-slate-100 mx-1">{deleteProduct?.name}</span>.
              <br />Esta acción eliminará el registro del inventario pero mantendrá el historial de transacciones asociado si existe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700 text-white">
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Negative Stock Confirmation */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              ¿Resetear todo el stock negativo?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción ajustará todos los productos con stock negativo a **cero**.
              <br /><br />
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                IMPORTANTE: Estos ajustes se registrarán como pérdidas financieras (Gasto por Merma) en el historial.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetNegativeStock}
              disabled={isResetting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isResetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Stock Adjustment Confirmation */}
      <AlertDialog open={!!adjustmentPending} onOpenChange={(open) => !open && !isAdjusting && setAdjustmentPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ajuste de stock</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de ajustar el stock de <span className="font-bold text-slate-900 dark:text-slate-100">{adjustmentPending?.product.name}</span> por <span className="font-bold">{adjustmentPending?.change ? (adjustmentPending.change > 0 ? `+${adjustmentPending.change}` : adjustmentPending.change) : ''}</span> unidades.
              <br /><br />
              Este movimiento será auditado y registrado como <span className="font-semibold text-amber-600">Merma/Ajuste (Shrinkage)</span>, lo cual impactará el balance de gastos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAdjusting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAdjustment}
              disabled={isAdjusting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isAdjusting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Ajuste
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
