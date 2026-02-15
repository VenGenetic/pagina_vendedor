'use client';

import { useState, useRef, type DragEvent, type ChangeEvent, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProducts, useAccounts, useCreatePurchase, useRecentPurchases, useDeletePurchase, useCreateProduct } from '@/hooks/use-queries';
import { useLocalDrafts } from '@/hooks/use-local-drafts';
import { DraftManager } from '@/components/common/draft-manager';
import { useDebounce } from '@/hooks/use-debounce';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Search, Trash2, Clock, Loader2, Upload, Download, History } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { advancedProductSearch } from '@/lib/utils/advanced-search';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface PurchaseItem {
  product_id: string;
  product_name?: string;
  product_image?: string | null;
  quantity: number;
  unit_cost: number;
}

export default function NewPurchasePage() {
  const router = useRouter();
  const { data: accounts } = useAccounts();
  const createPurchase = useCreatePurchase();
  const createProduct = useCreateProduct();

  // History Hooks
  const { data: recentPurchases, isLoading: loadingHistory } = useRecentPurchases();
  const { mutate: deletePurchase, isPending: isDeleting } = useDeletePurchase();

  const [searchTerm, setSearchTerm] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'CHECK' | 'OTHER'>('CASH');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [notes, setNotes] = useState('');
  const [isFreeEntry, setIsFreeEntry] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ivaTax, setIvaTax] = useState('15');
  const [profitMargin, setProfitMargin] = useState('65');
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(undefined);

  // ── Draft integration ────────────────────────────────────────
  const { saveDraft, getLatestDraft, clearDrafts } = useLocalDrafts('purchase_new');

  const getFormState = useCallback(() => ({
    items,
    supplierName,
    accountId,
    paymentMethod,
    notes,
    isFreeEntry,
    ivaTax,
    profitMargin
  }), [items, supplierName, accountId, paymentMethod, notes, isFreeEntry, ivaTax, profitMargin]);

  const applyFormState = useCallback((state: any) => {
    if (state.items) setItems(state.items);
    if (state.supplierName !== undefined) setSupplierName(state.supplierName);
    if (state.accountId !== undefined) setAccountId(state.accountId);
    if (state.paymentMethod !== undefined) setPaymentMethod(state.paymentMethod);
    if (state.notes !== undefined) setNotes(state.notes);
    if (state.isFreeEntry !== undefined) setIsFreeEntry(state.isFreeEntry);
    if (state.ivaTax !== undefined) setIvaTax(state.ivaTax);
    if (state.profitMargin !== undefined) setProfitMargin(state.profitMargin);
  }, []);

  // Auto-save draft on change
  useEffect(() => {
    if (currentDraftId) {
      saveDraft(getFormState(), undefined, currentDraftId);
    }
  }, [getFormState, saveDraft, currentDraftId]);

  // Auto-load latest draft on mount
  useEffect(() => {
    const latest = getLatestDraft();
    if (latest) {
      applyFormState(latest.data);
      setCurrentDraftId(latest.id);
    } else {
      setCurrentDraftId(crypto.randomUUID());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewDraft = () => {
    clearDrafts();
    setItems([]);
    setSupplierName('');
    setAccountId('');
    setPaymentMethod('CASH');
    setNotes('');
    setIsFreeEntry(false);
    setCurrentDraftId(crypto.randomUUID());
  };

  // Conflict Resolution State
  const [conflictItems, setConflictItems] = useState<{ existing: PurchaseItem, incoming: PurchaseItem }[]>([]);
  const [pendingItems, setPendingItems] = useState<PurchaseItem[]>([]); // Items that had no conflicts
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  // New Products Resolution State
  const [newProducts, setNewProducts] = useState<{ sku: string, qty: number, cost: number, description?: string }[]>([]);
  const [showNewProductsDialog, setShowNewProductsDialog] = useState(false);

  // Pricing Configuration State
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showPricingDialog, setShowPricingDialog] = useState(false);

  // Advanced search with catalog-motos algorithm
  const debouncedSearch = useDebounce(searchTerm, 50); // Faster like catalog
  const { data: productsData } = useProducts({ search: debouncedSearch });
  const allProducts = productsData?.data || [];
  const filteredProducts = advancedProductSearch(allProducts, searchTerm);

  const addItem = (productId: string) => {
    const product = allProducts?.find((p) => p.id === productId);
    if (!product) return;

    const existingItem = items.find((item) => item.product_id === product.id);
    if (existingItem) {
      setItems(
        items.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setItems([
        ...items,
        {
          product_id: product.id,
          product_name: product.name,
          product_image: product.image_url,
          quantity: 1,
          unit_cost: product.cost_price,
        },
      ]);
    }
    setSearchTerm('');
  };

  const updateItem = (productId: string, field: 'quantity' | 'unit_cost', value: number) => {
    if (field === 'quantity' && value <= 0) {
      removeItem(productId);
      return;
    }
    // Redondear unit_cost hacia arriba
    const finalValue = field === 'unit_cost' ? Math.ceil(value) : value;
    setItems(
      items.map((item) =>
        item.product_id === productId ? { ...item, [field]: finalValue } : item
      )
    );
  };

  const removeItem = (productId: string) => {
    setItems(items.filter((item) => item.product_id !== productId));
  };

  // Calculate selling price based on IVA and profit margin
  const calculateSellingPrice = (costPrice: number) => {
    const ivaMultiplier = 1 + (parseFloat(ivaTax || '15') / 100);
    const profitMultiplier = 1 + (parseFloat(profitMargin || '65') / 100);
    return costPrice * ivaMultiplier * profitMultiplier;
  };

  const total = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
  const totalWithIva = items.reduce((sum, item) => {
    const costWithIva = item.unit_cost * (1 + parseFloat(ivaTax || '15') / 100);
    return sum + item.quantity * costWithIva;
  }, 0);
  const totalWithMargin = items.reduce((sum, item) => {
    const sellingPrice = calculateSellingPrice(item.unit_cost);
    return sum + item.quantity * sellingPrice;
  }, 0);

  const downloadTemplate = () => {
    const headers = ['SKU', 'Descripción', 'Cantidad', 'Precio sin IVA'];
    const example = ['SKU-EJEMPLO-01', 'Descripción del producto', '10', '150.00'];
    const csvContent = [headers.join(','), example.join(',')].join('\n');

    // Add BOM for Excel compatibility with UTF-8
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla_surtido.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processCSV = async (file: File, ivaPercent: number, profitPercent: number) => {
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      const skusToFetch: string[] = [];
      const csvData: Record<string, { qty: number, cost: number, description: string }> = {};

      // Auto-detect separator (comma or semicolon)
      const firstLine = lines[0] || '';
      const separator = firstLine.includes(';') ? ';' : ',';

      let startIndex = 0;
      // Heuristic to skip header if present
      if (lines[0].toLowerCase().includes('sku')) {
        startIndex = 1;
      }

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(separator);
        // Expecting 4 columns: SKU, Desc, Qty, Cost
        if (parts.length < 4) continue;

        const sku = parts[0].trim();
        const description = parts[1].trim();
        const qtyStr = parts[2].trim().replace(',', '.'); // Replace comma with dot for parsing
        const costStr = parts[3].trim().replace(',', '.'); // Replace comma with dot for parsing

        const qty = parseInt(qtyStr);
        const cost = parseFloat(costStr);

        if (sku && !isNaN(qty) && !isNaN(cost)) {
          skusToFetch.push(sku);
          csvData[sku] = { qty, cost, description };
        }
      }

      if (skusToFetch.length === 0) {
        alert('No se encontraron datos válidos. Formato: SKU, Descripción, Cantidad, Precio sin IVA');
        return;
      }

      // Fetch matching products (batching for safety)
      const foundProducts: any[] = [];
      const batchSize = 50;

      for (let i = 0; i < skusToFetch.length; i += batchSize) {
        const batch = skusToFetch.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('products')
          .select('id, name, sku, cost_price, image_url')
          .in('sku', batch)
          .eq('is_active', true);

        if (error) console.error(error);
        if (data) foundProducts.push(...data);
      }

      const newItems: PurchaseItem[] = [];
      const missingSkus: string[] = [];

      skusToFetch.forEach(sku => {
        const product = foundProducts.find(p => p.sku === sku);
        if (product) {
          const { qty, cost } = csvData[sku];
          newItems.push({
            product_id: product.id,
            product_name: product.name,
            product_image: product.image_url,
            quantity: qty,
            unit_cost: cost
          });
        } else {
          missingSkus.push(sku);
        }
      });

      // Determine conflicts
      const conflicts: { existing: PurchaseItem, incoming: PurchaseItem }[] = [];
      const cleanNewItems: PurchaseItem[] = [];

      newItems.forEach(newItem => {
        const existing = items.find(i => i.product_id === newItem.product_id);
        if (existing) {
          conflicts.push({ existing, incoming: newItem });
        } else {
          cleanNewItems.push(newItem);
        }
      });

      if (conflicts.length > 0) {
        setConflictItems(conflicts);
        setPendingItems(cleanNewItems);
        setShowConflictDialog(true);

        if (missingSkus.length > 0) {
          const missingData = missingSkus.map(sku => ({
            sku,
            qty: csvData[sku].qty,
            cost: csvData[sku].cost,
            description: csvData[sku].description
          }));
          setNewProducts(missingData);
        }

      } else {
        if (missingSkus.length > 0) {
          // Prepare data for New Products Dialog
          const potentialNewProducts = missingSkus.map(sku => ({
            sku,
            qty: csvData[sku].qty,
            cost: csvData[sku].cost,
            description: csvData[sku].description
          }));
          setNewProducts(potentialNewProducts);
          setItems(prev => [...prev, ...cleanNewItems]); // Add valid terms
          setShowNewProductsDialog(true);
        } else {
          if (cleanNewItems.length > 0) {
            setItems(prev => [...prev, ...cleanNewItems]);
            alert(`Se importaron ${cleanNewItems.length} productos exitosamente.`);
          } else {
            alert('Ningún SKU del archivo coincide con los productos registrados.');
          }
        }
      }

    } catch (err) {
      console.error(err);
      alert('Error al procesar el archivo CSV. Asegúrate que tenga el formato: SKU, Descripción, Cantidad, Precio sin IVA');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateNewProducts = async () => {
    try {
      let createdCount = 0;
      const newItemsToAdd: PurchaseItem[] = [];
      const ivaMultiplier = 1 + (parseFloat(ivaTax) / 100);
      const profitMultiplier = 1 + (parseFloat(profitMargin) / 100);

      await Promise.all(newProducts.map(async (p) => {
        try {
          // Create product in DB
          // Use a default name if description is missing (it's currently missing in my parser logic, I need to fix that)
          const name = p.description || `Nuevo Producto ${p.sku}`;
          const sellingPrice = parseFloat((p.cost * ivaMultiplier * profitMultiplier).toFixed(2));

          const newProduct = await createProduct.mutateAsync({
            sku: p.sku,
            name: name,
            description: 'Importado desde compra',
            cost_price: p.cost,
            selling_price: sellingPrice,
            current_stock: 0, // Starts at 0, purchase adds stock later
            min_stock_level: 5,
            is_active: true,
            category: 'General'
          });

          if (newProduct) {
            createdCount++;
            newItemsToAdd.push({
              product_id: newProduct.id,
              product_name: newProduct.name,
              product_image: null,
              quantity: p.qty,
              unit_cost: p.cost
            });
          }
        } catch (e) {
          console.error(`Failed to create product ${p.sku}`, e);
        }
      }));

      setItems(prev => [...prev, ...newItemsToAdd]);
      setShowNewProductsDialog(false);
      setNewProducts([]);
      alert(`${createdCount} productos nuevos creados y agregados a la compra.`);

    } catch (e) {
      alert('Error creando productos');
    }
  };

  const resolveConflict = (action: 'merge' | 'replace' | 'keep_existing', all: boolean = false) => {
    if (all) {
      // Resolve ALL conflicts with the same action
      const resolved = conflictItems.map(c => {
        if (action === 'merge') {
          return {
            ...c.existing,
            quantity: c.existing.quantity + c.incoming.quantity,
            unit_cost: c.incoming.unit_cost // Update cost to new
          };
        } else if (action === 'replace') {
          return c.incoming;
        } else {
          return c.existing;
        }
      });

      // Merge resolved items back into main list
      // We need to replace the old items with resolved ones
      setItems(prev => {
        const map = new Map(prev.map(i => [i.product_id, i]));
        resolved.forEach(r => map.set(r.product_id, r));
        pendingItems.forEach(p => map.set(p.product_id, p));
        return Array.from(map.values());
      });

      setConflictItems([]);
      setPendingItems([]);
      setShowConflictDialog(false);

      if (newProducts.length > 0) {
        setShowNewProductsDialog(true);
      } else {
        alert('Conflictos resueltos y productos importados.');
      }
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setShowPricingDialog(true);
  };

  const handlePricingConfirm = async () => {
    if (!pendingFile) return;
    setShowPricingDialog(false);
    const ivaPercent = parseFloat(ivaTax) || 15;
    const profitPercent = parseFloat(profitMargin) || 65;
    await processCSV(pendingFile, ivaPercent, profitPercent);
    setPendingFile(null);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      setPendingFile(file);
      setShowPricingDialog(true);
    } else {
      alert('Por favor, arrastra un archivo .csv válido');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      alert('Por favor agrega al menos un producto');
      return;
    }

    if (!isFreeEntry && !accountId) {
      alert('Por favor selecciona una cuenta de pago');
      return;
    }

    const paymentMethodMap: Record<string, 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CHEQUE' | 'OTRO'> = {
      'CASH': 'EFECTIVO',
      'CARD': 'TARJETA',
      'TRANSFER': 'TRANSFERENCIA',
      'CHECK': 'CHEQUE',
      'OTHER': 'OTRO'
    };

    const result = await createPurchase.mutateAsync({
      nombre_proveedor: supplierName || undefined,
      id_cuenta: accountId,
      metodo_pago: paymentMethodMap[paymentMethod],
      es_ingreso_gratuito: isFreeEntry,
      iva_tax: parseFloat(ivaTax),
      profit_margin: parseFloat(profitMargin),
      articulos: items.map(item => ({
        id_producto: item.product_id,
        cantidad: item.quantity,
        costo_unitario: Math.ceil(item.unit_cost)
      })),
      notas: notes || undefined,
    });

    if (result.success) {
      alert(isFreeEntry ? 'Ingreso de inventario registrado' : 'Compra registrada exitosamente');
      router.push('/');
    } else {
      alert('Error al registrar: ' + result.error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-16 md:pb-24 transition-colors">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="container max-w-5xl flex h-16 items-center gap-4 px-4 mx-auto justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
              </button>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Nueva Compra</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Reabastecer inventario</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DraftManager
              namespace="purchase_new"
              onLoad={(draft) => {
                applyFormState(draft.data);
                setCurrentDraftId(draft.id);
              }}
              onNew={handleNewDraft}
            />
            <Link href="/transactions/purchase/history">
              <Button variant="outline" size="sm" className="gap-2">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">Historial</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl px-4 py-8 mx-auto">
        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Top Section: Supplier & Actions */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Proveedor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Input
                    id="supplierName"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Nombre del proveedor (Opcional)"
                    className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 h-11"
                  />
                  <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <input
                      type="checkbox"
                      id="freeEntry"
                      checked={isFreeEntry}
                      onChange={(e) => setIsFreeEntry(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <label
                      htmlFor="freeEntry"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer select-none text-slate-700 dark:text-slate-300"
                    >
                      Ingreso sin costo / Inventario Externo
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center transition-all ${isDragging ? 'border-dashed border-violet-500 bg-violet-50 dark:bg-violet-900/20 ring-2 ring-violet-500 ring-offset-2' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <CardContent className="py-6 flex items-center justify-between gap-4">
                <div className="pointer-events-none">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">Importación Masiva</p>
                  <p className="text-xs text-slate-500 transition-colors">
                    {isDragging ? '¡Suelta el archivo para cargar!' : 'Carga o arrastra tu archivo CSV aquí'}
                  </p>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      downloadTemplate();
                    }}
                    type="button"
                    className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 hover:underline mt-2 flex items-center gap-1 font-medium transition-colors pointer-events-auto"
                  >
                    <Download className="w-3 h-3" />
                    Descargar plantilla
                  </button>
                </div>
                <div className="pointer-events-none">
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-dashed border-2 border-slate-300 dark:border-slate-700 hover:border-violet-500 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-slate-600 dark:text-slate-300 pointer-events-auto"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Subir CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Products Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Productos</h2>
              <span className="text-sm text-slate-500 bg-slate-100 dark:bg-slate-900 px-3 py-1 rounded-full">
                {items.length} items
              </span>
            </div>

            <div className="relative group z-20">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
              </div>
              <Input
                placeholder="Buscar por nombre o SKU para agregar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-12 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-lg shadow-sm focus-visible:ring-violet-500"
              />
              {searchTerm && filteredProducts && filteredProducts.length > 0 && (
                <div className="absolute z-50 mt-2 w-full max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xl ring-1 ring-slate-200 dark:ring-slate-800">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addItem(product.id)}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900 border-b border-slate-50 dark:border-slate-800/50 last:border-0 flex items-center gap-3 transition-colors"
                    >
                      <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-900 flex-shrink-0 overflow-hidden border border-slate-100 dark:border-slate-800">
                        {product.image_url ? (
                          <div className="relative w-full h-full">
                            <Image
                              src={product.image_url!}
                              alt={product.name}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <Search className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200">{product.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {product.sku} • Stock: {product.current_stock}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((item) => (
                  <div
                    key={item.product_id}
                    className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/50 transition-all p-4 relative overflow-hidden"
                  >
                    <div className="flex gap-3 mb-4">
                      <div className="h-12 w-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex-shrink-0 overflow-hidden border border-slate-100 dark:border-slate-800">
                        {item.product_image ? (
                          <div className="relative w-full h-full">
                            <Image
                              src={item.product_image!}
                              alt={item.product_name || 'Producto'}
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300">
                            <Search className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 line-clamp-2 leading-tight">
                          {item.product_name}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product_id)}
                        className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Cantidad</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(item.product_id, 'quantity', parseInt(e.target.value) || 0)
                          }
                          className="h-9 mt-1 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-violet-500"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Costo Unit.</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unit_cost.toFixed(2)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const rounded = Math.round(val * 100) / 100;
                            updateItem(item.product_id, 'unit_cost', rounded);
                          }}
                          className="h-9 mt-1 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-violet-500"
                        />
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-50 dark:border-slate-800 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">{isFreeEntry ? 'Valor Ref. (sin IVA)' : 'Costo unitario (sin IVA)'}</span>
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                          {formatCurrency(item.unit_cost)}
                        </span>
                      </div>
                      {!isFreeEntry && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-400">Costo con IVA (unit.)</span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-500">
                            {formatCurrency(item.unit_cost * (1 + parseFloat(ivaTax || '15') / 100))}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">Precio Venta (unit.)</span>
                        <span className="text-xs font-mono font-bold text-violet-600 dark:text-violet-400">
                          {formatCurrency(calculateSellingPrice(item.unit_cost))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-t border-slate-50 dark:border-slate-800 pt-2">
                        <span className="text-xs font-semibold text-slate-500">{isFreeEntry ? 'Valor Inventario' : 'Subtotal (con IVA)'}</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {isFreeEntry
                            ? formatCurrency(item.quantity * item.unit_cost)
                            : formatCurrency(item.quantity * item.unit_cost * (1 + parseFloat(ivaTax || '15') / 100))
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-slate-50/50 dark:bg-slate-950/50">
                <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No hay productos seleccionados</p>
                <p className="text-sm text-slate-400">Busca productos arriba o importa un CSV</p>
              </div>
            )}
          </div>

          {/* Footer Summary */}
          <div className="md:sticky md:bottom-4 md:z-40">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-4 md:p-6 ring-1 ring-black/5">
              <div className="grid gap-6 md:grid-cols-2 items-end">

                {/* Payment Info */}
                <div className="space-y-4">
                  {!isFreeEntry && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 sm:col-span-1">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Cuenta de Pago</Label>
                        <Select value={accountId} onValueChange={setAccountId} required={!isFreeEntry}>
                          <SelectTrigger className="mt-1 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
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
                      <div className="col-span-2 sm:col-span-1">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Método</Label>
                        <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                          <SelectTrigger className="mt-1 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Efectivo</SelectItem>
                            <SelectItem value="TRANSFER">Transferencia</SelectItem>
                            <SelectItem value="CARD">Tarjeta</SelectItem>
                            <SelectItem value="CHECK">Cheque</SelectItem>
                            <SelectItem value="OTHER">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase">Notas</Label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notas adicionales..."
                      className="mt-1 h-9 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-sm"
                    />
                  </div>
                </div>

                {/* Total & Action */}
                <div className="flex flex-col gap-4">
                  {isFreeEntry ? (
                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider">Ingreso Sin Costo</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-green-700 dark:text-green-300">Valor Estimado Inventario</span>
                          <span className="text-xl font-bold text-green-700 dark:text-green-300">{formatCurrency(total)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-green-200 dark:border-green-700">
                          <span className="text-sm font-semibold text-green-800 dark:text-green-200">Valor Venta Estimado</span>
                          <span className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalWithMargin)}</span>
                        </div>
                        <div className="bg-green-100 dark:bg-green-900/30 rounded px-3 py-2 mt-3">
                          <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                            ⓘ No se realizará ningún cobro. Solo se actualizará el inventario.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between px-2 mb-2">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">IVA: {ivaTax}% | Ganancia: {profitMargin}%</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs h-auto py-0.5 px-2 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20"
                          onClick={() => {
                            setShowPricingDialog(true);
                          }}
                        >
                          Cambiar
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600 dark:text-slate-400">Costo Base (sin IVA)</span>
                          <span className="text-lg font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(total)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                          <span className="text-sm font-semibold text-red-600 dark:text-red-400">Total a Pagar (con IVA)</span>
                          <span className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalWithIva)}</span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
                          Precio Venta Estimado: <span className="font-semibold text-violet-600 dark:text-violet-400">{formatCurrency(totalWithMargin)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200 dark:shadow-violet-900/20 text-lg font-bold h-14"
                    disabled={createPurchase.isPending || items.length === 0 || (!isFreeEntry && !accountId)}
                  >
                    {createPurchase.isPending ? 'Procesando...' : (isFreeEntry ? 'REGISTRAR INGRESO' : 'CONFIRMAR COMPRA')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Conflict Resolution Dialog */}
        <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto w-full">
            <DialogHeader>
              <DialogTitle>Conflictos de Importación ({conflictItems.length})</DialogTitle>
              <DialogDescription>
                Algunos productos del archivo CSV ya existen en tu lista actual. Elige cómo deseas resolver estos conflictos.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 my-4">
              <div className="flex gap-2 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-2 text-slate-900 dark:text-slate-100">Acciones Masivas</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => resolveConflict('merge', true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                      Sumar Cantidades (Recomendado)
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => resolveConflict('replace', true)}>
                      Reemplazar Todo (Usar datos del CSV)
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => resolveConflict('keep_existing', true)}>
                      Ignorar CSV (Conservar actuales)
                    </Button>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 space-y-1">
                    <p>• <strong>Sumar:</strong> Suma la cantidad del CSV a la actual y actualiza el costo al del CSV.</p>
                    <p>• <strong>Reemplazar:</strong> Descarta la cantidad actual y usa solo la del CSV.</p>
                    <p>• <strong>Ignorar:</strong> No realiza cambios en estos productos.</p>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-2 text-xs font-bold text-slate-500 uppercase grid grid-cols-12 gap-2">
                  <div className="col-span-4">Producto</div>
                  <div className="col-span-4 text-center">Actual en Lista</div>
                  <div className="col-span-4 text-center">Nuevo en CSV</div>
                </div>
                {conflictItems.map((conflict, idx) => (
                  <div key={idx} className="p-4 grid grid-cols-12 gap-2 items-center text-sm bg-white dark:bg-slate-950">
                    <div className="col-span-4 font-medium flex items-center gap-2">
                      {conflict.existing.product_image && (
                        <img src={conflict.existing.product_image} className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-800" />
                      )}
                      <div className="min-w-0">
                        <div className="line-clamp-1 text-slate-700 dark:text-slate-200">{conflict.existing.product_name}</div>
                      </div>
                    </div>
                    <div className="col-span-4 text-center bg-slate-50 dark:bg-slate-900 p-2 rounded">
                      <div className="font-bold text-slate-700 dark:text-slate-200">{conflict.existing.quantity} un.</div>
                      <div className="text-xs text-slate-500">{formatCurrency(conflict.existing.unit_cost)}</div>
                    </div>
                    <div className="col-span-4 text-center bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-2 rounded border border-blue-100 dark:border-blue-800/30">
                      <div className="font-bold">{conflict.incoming.quantity} un.</div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">{formatCurrency(conflict.incoming.unit_cost)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConflictDialog(false)}>Cancelar Importación</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Products Dialog */}
        <Dialog open={showNewProductsDialog} onOpenChange={setShowNewProductsDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Productos Nuevos Detectados ({newProducts.length})</DialogTitle>
              <DialogDescription>
                Se encontraron SKUs en el archivo que no existen en el sistema. ¿Deseas crearlos y agregarlos a la compra?
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[50vh] overflow-y-auto border rounded-md my-4 divide-y divide-slate-100 dark:divide-slate-800">
              <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-2 text-xs font-bold text-slate-500 uppercase grid grid-cols-12 gap-2 sticky top-0">
                <div className="col-span-3">SKU</div>
                <div className="col-span-5">Descripción (Automática)</div>
                <div className="col-span-2 text-center">Cantidad</div>
                <div className="col-span-2 text-right">Costo</div>
              </div>
              {newProducts.map((p, idx) => (
                <div key={idx} className="p-3 grid grid-cols-12 gap-2 text-sm items-center hover:bg-slate-50 dark:hover:bg-slate-900">
                  <div className="col-span-3 font-mono text-xs">{p.sku}</div>
                  <div className="col-span-5 line-clamp-1 font-medium">{p.description || `Nuevo Producto ${p.sku}`}</div>
                  <div className="col-span-2 text-center bg-slate-100 dark:bg-slate-800 rounded px-1">{p.qty}</div>
                  <div className="col-span-2 text-right font-mono">{formatCurrency(p.cost)}</div>
                </div>
              ))}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowNewProductsDialog(false);
                  setNewProducts([]);
                  if (items.length > 0) alert('Se agregaron solo los productos coincidentes.');
                }}
              >
                Ignorar Nuevos
              </Button>
              <Button onClick={handleCreateNewProducts} className="bg-violet-600 hover:bg-violet-700 text-white">
                Crear {newProducts.length} Productos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>



        {/* History Section */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <Clock className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </div>
              Historial Reciente
            </h2>
            <span className="text-xs text-slate-400 font-medium px-3 py-1 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-100 dark:border-slate-800">
              Últimas transacciones
            </span>
          </div>

          {loadingHistory ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
          ) : recentPurchases && recentPurchases.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentPurchases.map((tx: any) => (
                <Card key={tx.id} className="group overflow-hidden border-slate-200 dark:border-slate-800 hover:border-violet-200 dark:hover:border-violet-900/50 transition-all hover:shadow-md bg-white dark:bg-slate-900">
                  <CardContent className="p-0">
                    <div className="p-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-700 dark:text-slate-200 text-sm line-clamp-2 leading-snug">
                            {tx.description}
                          </div>
                          <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-2">
                            <span>{formatDateTime(tx.created_at)}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-red-600 dark:text-red-400 whitespace-nowrap bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded text-sm">
                            {formatCurrency(-Math.abs(tx.amount))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {tx.payment_method}
                      </span>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 px-2"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                            Revertir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Revertir esta compra?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción eliminará la transacción de <span className="font-bold text-slate-900">{formatCurrency(tx.amount)}</span> y descontará el stock de los productos involucrados.
                              <br /><br />
                              <span className="text-red-500 font-medium">Esta acción no se puede deshacer.</span>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletePurchase(tx.id)}
                              className="bg-red-600 hover:bg-red-700 text-white"
                            >
                              {isDeleting ? 'Revirtiendo...' : 'Sí, Revertir Compra'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center bg-slate-50/50 dark:bg-slate-900/50">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                <Clock className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">No hay compras recientes</p>
              <p className="text-sm text-slate-400">Las compras de inventario aparecerán aquí.</p>
            </div>
          )}
        </div>

        {/* Pricing Configuration Dialog */}
        <Dialog open={showPricingDialog} onOpenChange={setShowPricingDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Configuración de Precios</DialogTitle>
              <DialogDescription>
                Define los porcentajes de IVA y ganancia para calcular el precio de venta de los productos.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 my-4">
              <div>
                <Label htmlFor="ivaTax" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  IVA (%)
                </Label>
                <Input
                  id="ivaTax"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={ivaTax}
                  onChange={(e) => setIvaTax(e.target.value)}
                  className="mt-1"
                  placeholder="15"
                />
                <p className="text-xs text-slate-500 mt-1">Porcentaje del Impuesto al Valor Agregado</p>
              </div>

              <div>
                <Label htmlFor="profitMargin" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Margen de Ganancia (%)
                </Label>
                <Input
                  id="profitMargin"
                  type="number"
                  step="0.1"
                  min="0"
                  max="1000"
                  value={profitMargin}
                  onChange={(e) => setProfitMargin(e.target.value)}
                  className="mt-1"
                  placeholder="65"
                />
                <p className="text-xs text-slate-500 mt-1">Margen de ganancia sobre el costo con IVA incluido</p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Vista Previa del Cálculo</p>
                <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                  <p>Si el costo es <span className="font-bold">$100.00</span>:</p>
                  <p className="ml-3">• Con IVA: <span className="font-mono">${(100 * (1 + parseFloat(ivaTax || '0') / 100)).toFixed(2)}</span></p>
                  <p className="ml-3">• Precio Venta: <span className="font-mono font-bold text-violet-600 dark:text-violet-400">
                    ${(100 * (1 + parseFloat(ivaTax || '0') / 100) * (1 + parseFloat(profitMargin || '0') / 100)).toFixed(2)}
                  </span></p>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPricingDialog(false);
                  setPendingFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handlePricingConfirm} className="bg-violet-600 hover:bg-violet-700 text-white">
                Continuar con Importación
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>

    </div>
  );
}
