'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, Save, Download, RefreshCw } from 'lucide-react';
import { inventoryService } from '@/lib/services/inventory';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/use-queries';
import * as XLSX from 'xlsx';

// Fix: We don't need to self-import.
// Standard imports
import { ProductoInsertar } from '@/types';
import { StagingGrid, StagingItem, StagingStatus } from './staging/StagingGrid';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function ImportProductsDialog() {
  const [open, setOpen] = useState(false);
  const [stagingData, setStagingData] = useState<StagingItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  // Helper: Clean currency strings to numbers
  const cleanCurrency = (val: string | number) => {
    if (typeof val === 'number') return parseFloat(val.toFixed(2));
    if (!val) return 0;
    const strVal = String(val).trim();
    // Remove currency symbols ($, €, etc)
    let cleanStr = strVal.replace(/[$€£]/g, '').trim();
    // Remove chars that are not digits, dots, commas, or minus
    cleanStr = cleanStr.replace(/[^0-9.,-]/g, '');

    // Handle specific locale formats
    // If we have both dot and comma, assume the last one is the decimal separator
    if (cleanStr.includes(',') && cleanStr.includes('.')) {
      const lastDot = cleanStr.lastIndexOf('.');
      const lastComma = cleanStr.lastIndexOf(',');
      if (lastDot > lastComma) {
        // 1,000.50 -> remove comma
        cleanStr = cleanStr.replace(/,/g, '');
      } else {
        // 1.000,50 -> remove dot, replace comma with dot
        cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
      }
    } else if (cleanStr.includes(',')) {
      // If only comma, assume it's decimal if it looks like a decimal (2 chars after?) 
      // OR assume it's thousands if 3 chars 000? 
      // Standard approach in this region (LatAm): comma is often decimal.
      // But standard CSV export might be US English.
      // Let's assume comma replacement if it results in a valid float?
      cleanStr = cleanStr.replace(',', '.');
    }

    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0.00 : parseFloat(parsed.toFixed(2));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setIsProcessing(true);

      // 1. Parse CSV
      (await import('papaparse')).default.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const rows = results.data as any[];

          // 2. Map basic data
          const mappedItems: StagingItem[] = rows.map((row) => {
            // SKUs: specific cols or random generation
            const sku = row['CODIGO PROVEEDOR'] || row['CÓDIGO PRINCIPAL'] || row['SKU'] || '';
            const cost = cleanCurrency(row['COSTO UNITARIO'] || row['Costo'] || 0);
            const price = Math.ceil(cleanCurrency(row['PRECIO UNITARIO'] || row['PVP'] || row['Precio Venta'] || 0));

            // NEW: Parse stock
            // Common headers: Stock, Existencia, Cantidad, Inventory
            const rawStock = row['Stock'] || row['Existencia'] || row['Cantidad'] || row['STOCK'] || 0;
            const stock = Math.floor(cleanCurrency(rawStock)); // Stock is int

            return {
              id: Math.random().toString(36).substr(2, 9),
              sku: sku,
              name: row['DESCRIPCIÓN PRODUCTO'] || row['Nombre'] || '',
              category: row['CATEGORIA'] || 'General',
              brand: row['MARCA'] || '',
              cost_price: cost,
              selling_price: price,
              initial_stock: stock < 0 ? 0 : stock, // Prevent negative initial stock
              status: 'NEW' as StagingStatus
            };
          }).filter(i => i.name || i.sku); // Filter garbage rows

          // 3. Match against DB (Check existing SKUs)
          try {
            const existingProducts = (await inventoryService.getProducts()) as any[];

            const finalItems = mappedItems.map(item => {
              if (!item.sku) return { ...item, status: 'NEW' as StagingStatus };

              const match = existingProducts.find((p: any) => p.sku === item.sku);
              if (match) {
                const isDiscrepancy = match.selling_price !== item.selling_price;
                return {
                  ...item,
                  db_price: match.selling_price,
                  status: isDiscrepancy ? 'DISCREPANCY' : ('MATCH' as StagingStatus)
                };
              }
              return { ...item, status: 'NEW' as StagingStatus };
            });

            setStagingData(prev => [...prev, ...finalItems]);
            toast.success(`${finalItems.length} filas preparadas.`);

          } catch (err) {
            console.error(err);
            toast.error("Error al validar contra base de datos.");
          } finally {
            setIsProcessing(false);
          }
        },
        error: (err) => {
          console.error(err);
          toast.error("Error al leer archivo CSV.");
          setIsProcessing(false);
        }
      });

      // Reset input
      e.target.value = '';
    }
  };

  const handleLoadCurrentInventory = async () => {
    setIsProcessing(true);
    try {
      const existingProducts = (await inventoryService.getProducts()) as any[];
      const items: StagingItem[] = existingProducts.map(p => ({
        id: Math.random().toString(36).substr(2, 9),
        sku: p.sku,
        name: p.name,
        category: p.category,
        brand: p.brand || '',
        cost_price: p.cost_price,
        selling_price: p.selling_price,
        initial_stock: 0, // Loading from inventory implies no new stock to add, just editing metadata
        db_price: p.selling_price,
        status: 'MATCH' as StagingStatus
      }));
      setStagingData(items);
      toast.success(`${items.length} productos cargados del inventario.`);
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar inventario.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const existingProducts = (await inventoryService.getProducts()) as any[];
      const headers = ['SKU', 'Nombre', 'Categoria', 'Marca', 'Costo', 'Precio Venta'];

      // If inventory is empty, provide a clean template
      const dataToExport = existingProducts.length > 0 ? existingProducts : [{
        sku: 'EJEMPLO-001',
        name: 'Producto de Ejemplo',
        category: 'General',
        brand: 'Marca',
        cost_price: 10.00,
        selling_price: 15.00
      }];

      const csvRows = [headers.join(',')];

      dataToExport.forEach((p: any) => {
        const row = [
          p.sku || '',
          p.name || '',
          p.category || 'General',
          p.brand || '',
          p.cost_price || 0,
          p.selling_price || 0
        ].map(value => {
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        });
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      const bom = '\uFEFF';
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `plantilla_precios_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      toast.error("Error al generar plantilla.");
    }
  };

  const handleCommit = async () => {
    if (stagingData.length === 0) return;
    setIsSaving(true);

    let successCount = 0;
    let failedCount = 0;
    const errors: { sku: string; error: string }[] = [];

    try {
      // Validate first
      const invalid = stagingData.find(i => !i.name || i.selling_price < 0 || i.initial_stock < 0);
      if (invalid) {
        toast.error("Datos inválidos detectados (Nombre vacío, Precio negativo, o Stock negativo).");
        setIsSaving(false);
        return;
      }



      // Process individually for resilience
      // TODO: Could be batched if backend supports transactional batch, but for now 1-by-1 is safer for detailed feedback
      for (const item of stagingData) {
        try {
          const productToUpsert: ProductoInsertar = {
            sku: item.sku || ('GEN-' + Math.random().toString(36).substr(2, 9)),
            name: item.name,
            category: item.category,
            brand: item.brand,
            cost_price: item.cost_price,
            selling_price: item.selling_price || 0,
            image_url: '',
            description: '',

            is_active: true,
            // Add any other required fields for ProductoInsertar
          } as any;

          // Call the new Ledger-First import method
          await inventoryService.importProduct(productToUpsert, item.initial_stock);
          successCount++;
        } catch (err: any) {
          console.error(`Error importing ${item.sku}:`, err);
          failedCount++;
          errors.push({ sku: item.sku, error: err.message || "Unknown error" });
        }
      }

      // Reporting
      queryClient.invalidateQueries({ queryKey: queryKeys.products });

      if (failedCount === 0) {
        toast.success(`Éxito total! ${successCount} productos procesados.`);
        setOpen(false);
        setStagingData([]);
      } else {
        toast.warning(`Proceso completado con errores. Éxitos: ${successCount}, Fallos: ${failedCount}`);
        // Keep dialog open to show errors? Or maybe log them to console/alert
        alert(`Errores en los siguientes SKUs:\n${errors.map(e => `${e.sku}: ${e.error}`).join('\n')}`);
        // Optionally remove successful ones from stagingData so user can fix failed ones
        // setStagingData(prev => prev.filter(p => errors.some(e => e.sku === p.sku)));
      }

    } catch (err) {
      console.error(err);
      toast.error("Error crítico en el proceso de importación.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Gestión Masiva / Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex justify-between items-center pr-6">
            <div>
              <DialogTitle className="text-2xl font-bold">Alineación de Metadatos Comerciales</DialogTitle>
              <p className="text-sm text-muted-foreground">Actualización masiva de nombres, categorías, marcas y precios.</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 mt-4">
          {/* Actions Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 gap-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Button variant="default" className="gap-2 bg-indigo-600 hover:bg-indigo-700" disabled={isProcessing}>
                  <Upload className="h-4 w-4" />
                  Importar CSV / Excel
                </Button>
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleFileChange}
                  disabled={isProcessing}
                />
              </div>

              <Button
                variant="outline"
                className="gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-400 dark:hover:bg-indigo-950"
                onClick={handleLoadCurrentInventory}
                disabled={isProcessing}
              >
                <RefreshCw className={cn("h-4 w-4", isProcessing && "animate-spin")} />
                Cargar Inventario Actual
              </Button>

              <Button
                variant="ghost"
                className="gap-2"
                onClick={handleDownloadTemplate}
              >
                <Download className="h-4 w-4" />
                Descargar Plantilla (CSV)
              </Button>
            </div>

            <div className="text-xs font-medium text-slate-500 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-full border shadow-sm">
              {isProcessing ? (
                <span className="flex items-center gap-2 text-indigo-600"><Loader2 className="h-3 w-3 animate-spin" /> Procesando datos...</span>
              ) : (
                <span className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  Listo para procesar {stagingData.length} filas
                </span>
              )}
            </div>
          </div>

          {/* The Grid */}
          <div className="flex-1 min-h-0 border rounded-md">
            <StagingGrid
              data={stagingData}
              onDataChange={setStagingData}
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCommit} disabled={stagingData.length === 0 || isSaving || isProcessing}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Confirmar Cambios
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
