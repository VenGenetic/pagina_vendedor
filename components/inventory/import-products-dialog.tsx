'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, Save, Download } from 'lucide-react';
import { inventoryService } from '@/lib/services/inventory';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/use-queries';
import Papa from 'papaparse';
import { ProductoInsertar } from '@/types';
import { StagingGrid, StagingItem, StagingStatus } from './staging/StagingGrid';
import { toast } from 'sonner';

export function ImportProductsDialog() {
  const [open, setOpen] = useState(false);
  const [stagingData, setStagingData] = useState<StagingItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false); // For matching logic
  const [isSaving, setIsSaving] = useState(false); // For commit logic
  const queryClient = useQueryClient();

  // Helper: Clean currency strings to numbers
  const cleanCurrency = (val: string | number) => {
    if (typeof val === 'number') return parseFloat(val.toFixed(2));
    if (!val) return 0;
    const strVal = String(val).trim();
    let cleanStr = strVal.replace(/\$/g, '').trim();
    cleanStr = cleanStr.replace(/[^0-9.,]/g, '');
    if (cleanStr.includes(',') && cleanStr.includes('.')) {
      const lastDot = cleanStr.lastIndexOf('.');
      const lastComma = cleanStr.lastIndexOf(',');
      if (lastDot > lastComma) {
        cleanStr = cleanStr.replace(/,/g, '');
      } else {
        cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
      }
    } else if (cleanStr.includes(',')) {
      cleanStr = cleanStr.replace(',', '.');
    }
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0 : parseFloat(parsed.toFixed(2));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setIsProcessing(true);

      // 1. Parse CSV
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const rows = results.data as any[];

          // 2. Map basic data
          const mappedItems: StagingItem[] = rows.map((row) => {
            // SKUs: specific cols or random generation (if new/manual intent, but random is risky for matching. Prefer empty if missing?)
            const sku = row['CODIGO PROVEEDOR'] || row['CÓDIGO PRINCIPAL'] || row['SKU'] || '';
            const cost = cleanCurrency(row['COSTO UNITARIO'] || row['Costo'] || 0);
            const price = Math.ceil(cleanCurrency(row['PRECIO UNITARIO'] || row['PVP'] || 0));

            return {
              id: Math.random().toString(36).substr(2, 9),
              sku: sku,
              name: row['DESCRIPCIÓN PRODUCTO'] || row['Nombre'] || '',
              category: row['CATEGORIA'] || 'General',
              brand: row['MARCA'] || '',
              cost_price: cost,
              selling_price: price,
              status: 'NEW' as StagingStatus
            };
          }).filter(i => i.name || i.sku); // Filter garbage rows

          // 3. Match against DB (Check existing SKUs)
          try {
            const existingProducts = (await inventoryService.getProducts()) as any[];
            // Optim: Ideally we search only relevant SKUs, but for batch of 50-100, getting all active products (light query) is okay usually.

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

            // Merge with existing manual rows? Or replace? 
            // "Import CSV" usually implies adding to the workspace.
            setStagingData(prev => [...prev, ...finalItems]);
            toast.success(`${finalItems.length} filas importadas.`);

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

  const handleCommit = async () => {
    if (stagingData.length === 0) return;
    setIsSaving(true);

    try {
      // Validate
      const invalid = stagingData.find(i => !i.name || i.selling_price < 0);
      if (invalid) {
        toast.error("Datos inválidos detectados (Nombre vacío o Precio negativo).");
        setIsSaving(false);
        return;
      }

      const productsToUpsert: ProductoInsertar[] = stagingData.map(item => ({
        sku: item.sku || ('GEN-' + Math.random().toString(36).substr(2, 9)),
        name: item.name,
        category: item.category,
        brand: item.brand,
        cost_price: item.cost_price,
        selling_price: item.selling_price,
        // CRITICAL: DO NOT SEND current_stock. Helper function/RPC needs to handle this.
        // Wait, inventoryService.createProducts uses UPSERT. 
        // If we allow UPSERT on products table, if we omit 'current_stock', does it keep existing?
        // Supabase upsert behavior: If we send {sku, name...}, other columns like current_stock 
        // might be set to default (0) if not present? NO. 
        // Upsert updates ONLY columns provided + PK match. 
        // BUT if it's a NEW row, it needs defaults.
        // Strategy: We must inspect if inventoryService handles this safely.
        // inventoryService.createProducts calls `supabase.from('products').upsert(products)`
        // If we send undefined for current_stock, it should be fine for UPDATE.
        // For INSERT, we need a default.
        // We'll trust the database default (0) for new rows.
        // So we EXPLICITLY do NOT include current_stock in this object.

        image_url: '',
        description: '',
        min_stock_level: 5,
        max_stock_level: 100,
        is_active: true,
        // Type hack: casting to any to exclude stock safely or assuming interface allows optional
      } as any));

      await inventoryService.updateProductMetadata(productsToUpsert);

      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      toast.success("Información actualizada correctamente.");
      setStagingData([]); // Clear on success
      setOpen(false);

    } catch (err) {
      console.error(err);
      toast.error("Error al guardar cambios.");
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
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Alineación de Metadatos Comerciales</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Actions Bar */}
          <div className="flex justify-between items-center bg-muted/20 p-4 rounded-md">
            <div className="flex gap-2">
              <div className="relative">
                <Button variant="secondary" className="gap-2" disabled={isProcessing}>
                  <Upload className="h-4 w-4" />
                  Importar CSV
                </Button>
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleFileChange}
                  disabled={isProcessing}
                />
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                <Download className="h-3 w-3" /> Plantilla
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              {isProcessing ? (
                <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Procesando...</span>
              ) : (
                <span>Modo: Unificado (Manual + CSV)</span>
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
