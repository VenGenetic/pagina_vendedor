'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { inventoryService } from '@/lib/services/inventory';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/use-queries';
import Papa from 'papaparse';
import { ProductoInsertar } from '@/types';

export function ImportProductsDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const queryClient = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadStatus('idle');
      setErrorMessage('');
      parseFile(selectedFile);
    }
  };

  const parseFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: '\t', // Support both CSV (comma) and TSV (tab) - Papa will auto-detect if not specified
      complete: (results) => {
        setPreview(results.data);
      },
      error: (error: any) => {
        console.error('Error parsing CSV/TSV:', error);
        setErrorMessage('Error al leer el archivo');
      }
    });
  };

  const processData = (data: any[]): ProductoInsertar[] => {
    const mapped = data.map(row => {
      // Helper to clean currency string to number
      const cleanCurrency = (val: string | number) => {
        if (typeof val === 'number') {
          return parseFloat(val.toFixed(2)); // Ensure 2 decimal places
        }
        if (!val) return 0;
        // Handle cases like "$ 1,200.00", "1,200.00", "1200.00", etc.
        const strVal = String(val).trim();
        // Remove $ and common separators
        let cleanStr = strVal.replace(/\$/g, '').trim();
        // Handle both comma and period as decimal separators
        // If there's both comma and period, assume the last one is decimal
        cleanStr = cleanStr.replace(/[^0-9.,]/g, '');
        // Replace comma with period for parseFloat
        if (cleanStr.includes(',') && cleanStr.includes('.')) {
          // Both exist: remove the one that comes first (thousands separator)
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

      const cleanInt = (val: string | number) => {
        if (typeof val === 'number') return Math.floor(val);
        if (!val) return 0;
        const strVal = String(val).trim();
        const cleanStr = strVal.replace(/[^\d.-]/g, '');
        return parseInt(cleanStr) || 0;
      };

      return {
        sku: row['CODIGO PROVEEDOR'] || row['CÓDIGO PRINCIPAL'] || row['CÓDIGO AUXILIAR'] || row['SKU'] || ('GEN-' + Math.random().toString(36).substr(2, 9)),
        name: row['DESCRIPCIÓN PRODUCTO'] || row['DESCRIPCION'] || row['Nombre'] || 'Producto Sin Nombre',
        cost_price: cleanCurrency(row['COSTO UNITARIO'] || row[' COSTO SIN IVA'] || row['Costo'] || row['Costo Unitario'] || 0),
        selling_price: Math.ceil(cleanCurrency(row[' PRECIO UNITARIO'] || row['PRECIO UNITARIO'] || row['PVP UN '] || row['Precio Venta'] || row['PVP']) || 0),
        current_stock: cleanInt(row['CANTIDAD'] || row['Cantidad'] || row['Stock'] || row['Cantidad Actual'] || row['STOCK'] || '0'),
        min_stock_level: 5, 
        max_stock_level: 100, 
        is_active: true,
        brand: row['Marca'] || row['MARCA'] || '',
        category: row['Categoria'] || row['CATEGORIA'] || 'General',
        description: row['Descripción'] || row['DESCRIPCIÓN'] || row['INFORMACIÓN ADICIONAL'] || '',
        image_url: row['Imagen'] || row['IMAGEN'] || ''
      } as ProductoInsertar;
    })
    .filter(p => p.sku && p.name);

    // Deduplicate by SKU
    const uniqueProducts = new Map();
    mapped.forEach(p => {
      if (p.sku) {
        uniqueProducts.set(p.sku, p);
      }
    });

    return Array.from(uniqueProducts.values());
  };

  const handleUpload = async () => {
    if (!file || preview.length === 0) return;

    setIsUploading(true);
    setUploadStatus('idle');

    try {
      const productsToInsert = processData(preview);
      
      console.log('Inserting products:', productsToInsert.length);
      
      const chunkSize = 50;
      for (let i = 0; i < productsToInsert.length; i += chunkSize) {
        const chunk = productsToInsert.slice(i, i + chunkSize);
        await inventoryService.createProducts(chunk);
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      setUploadStatus('success');
      setFile(null);
      setPreview([]);
      // Close dialog after a delay
      setTimeout(() => {
        setOpen(false);
        setUploadStatus('idle');
      }, 2000);
      
    } catch (error) {
      console.error('Error importing products:', error);
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Error al importar productos');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Importar CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar Productos</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
             <Input 
                type="file" 
                accept=".csv"
                onChange={handleFileChange}
                disabled={isUploading}
             />
             <p className="text-xs text-muted-foreground">
               Soporta: CSV y TSV (con tabuladores). Columnas esperadas: CODIGO PROVEEDOR/CÓDIGO PRINCIPAL (SKU), DESCRIPCION/DESCRIPCIÓN PRODUCTO, PRECIO UNITARIO/COSTO SIN IVA, Cantidad Actual (opcional)
             </p>
          </div>

          {preview.length > 0 && (
            <div className="border rounded-md p-4 bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
                <span className="font-semibold">{preview.length} filas leídas</span>
              </div>
              <div className="h-[200px] w-full overflow-auto rounded border bg-background p-2">
                <pre className="text-xs">
                  {JSON.stringify(preview.slice(0, 2), null, 2)}
                  {preview.length > 2 && `\n\n... ${preview.length - 2} más`}
                </pre>
              </div>
            </div>
          )}

          {uploadStatus === 'success' && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-md">
              <CheckCircle className="h-5 w-5" />
              <span>Importación completada con éxito</span>
            </div>
          )}

          {uploadStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-md">
              <AlertCircle className="h-5 w-5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isUploading}>
              Cerrar
            </Button>
            <Button onClick={handleUpload} disabled={!file || preview.length === 0 || isUploading}>
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importar Datos
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
