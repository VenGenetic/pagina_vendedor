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

interface ProductDialogProps {
  product?: Producto;
  trigger?: React.ReactNode;
}

export function ProductDialog({ product, trigger }: ProductDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (data: any) => {
    try {
      if (product) {
        await inventoryService.updateProduct(product.id, data);
      } else {
        await inventoryService.createProduct(data);
      }
      
      // Invalidate queries to refresh list
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      setOpen(false);
    } catch (error) {
      console.error('Error saving product:', error);
      // Here you might want to show a toast notification
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant={product ? "ghost" : "default"} size={product ? "sm" : "default"}>
             {product ? <Pencil className="h-4 w-4" /> : <><Plus className="h-4 w-4 mr-2" /> Agregar Producto</>}
          </Button>
        )}
      </DialogTrigger>
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
