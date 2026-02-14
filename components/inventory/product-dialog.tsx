'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProductForm } from './product-form';
import { Producto } from '@/types';
import { Plus, Pencil } from 'lucide-react';
import { inventoryService } from '@/lib/services/inventory';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/use-queries';
import { toast } from 'sonner';

interface ProductDialogProps {
  product?: Producto;
  trigger?: React.ReactNode;
  onSuccess?: (newProduct: any) => void;
}

export function ProductDialog({ product, trigger, onSuccess }: ProductDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (data: any) => {
    try {
      console.log('Submitting product data:', data);

      let result;
      if (product) {
        result = await inventoryService.updateProduct(product.id, data);
      } else {
        result = await inventoryService.createProduct(data);
      }

      setOpen(false);

      // Invalidate queries without awaiting to keep UI responsive
      queryClient.invalidateQueries({ queryKey: queryKeys.products });

      toast.success(product ? 'Producto actualizado' : 'Producto creado');

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Error al guardar: ' + (error as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      ) : (
        <Button
          variant={product ? "ghost" : "default"}
          size={product ? "sm" : "default"}
          onClick={() => setOpen(true)}
        >
          {product ? <Pencil className="h-4 w-4" /> : <><Plus className="h-4 w-4 mr-2" /> Agregar Producto</>}
        </Button>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
        </DialogHeader>
        <ProductForm
          initialData={product}
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
