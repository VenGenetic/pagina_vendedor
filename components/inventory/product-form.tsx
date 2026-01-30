'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Producto, ProductoInsertar } from '@/types';
import { useState } from 'react';

const productSchema = z.object({
  sku: z.string().min(1, 'El SKU es requerido'),
  name: z.string().min(1, 'El nombre es requerido'),
  brand: z.string().optional(),
  category: z.string().optional(),
  cost_price: z.coerce.number().min(0, 'El costo debe ser mayor o igual a 0'),
  selling_price: z.coerce.number().min(0, 'El precio debe ser mayor o igual a 0'),
  current_stock: z.coerce.number().int().min(0, 'El stock debe ser mayor o igual a 0'),
  min_stock_level: z.coerce.number().int().min(0, 'El stock mínimo debe ser mayor o igual a 0'),
  max_stock_level: z.coerce.number().int().min(0, 'El stock máximo debe ser mayor o igual a 0'),
  description: z.string().optional(),
  image_url: z.string().url('URL inválida').optional().or(z.literal('')),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormProps {
  initialData?: Producto;
  onSubmit: (data: ProductFormValues) => Promise<void>;
  onCancel: () => void;
}

export function ProductForm({ initialData, onSubmit, onCancel }: ProductFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { register, handleSubmit, formState: { errors } } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: initialData ? {
      sku: initialData.sku,
      name: initialData.name,
      brand: initialData.brand || '',
      category: initialData.category || '',
      cost_price: initialData.cost_price,
      selling_price: initialData.selling_price,
      current_stock: initialData.current_stock,
      min_stock_level: initialData.min_stock_level,
      max_stock_level: initialData.max_stock_level,
      description: initialData.description || '',
      image_url: initialData.image_url || '',
    } : {
      cost_price: 0,
      selling_price: 0,
      current_stock: 0,
      min_stock_level: 5,
      max_stock_level: 100,
    }
  });

  const onSubmitForm = async (data: ProductFormValues) => {
    setIsSubmitting(true);
    try {
      // Redondear el precio de venta hacia arriba
      const processedData = {
        ...data,
        selling_price: Math.ceil(data.selling_price)
      };
      await onSubmit(processedData);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" {...register('sku')} placeholder="COD-001" />
          {errors.sku && <p className="text-sm text-red-500">{errors.sku.message}</p>}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="brand">Marca</Label>
          <Input id="brand" {...register('brand')} placeholder="Ej. Yamaha" />
          {errors.brand && <p className="text-sm text-red-500">{errors.brand.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Nombre del Producto</Label>
        <Input id="name" {...register('name')} placeholder="Ej. Aceite 20W50" />
        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Categoría</Label>
        <Input id="category" {...register('category')} placeholder="Ej. Lubricantes" />
        {errors.category && <p className="text-sm text-red-500">{errors.category.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cost_price">Costo</Label>
          <Input id="cost_price" type="number" step="0.01" {...register('cost_price')} />
          {errors.cost_price && <p className="text-sm text-red-500">{errors.cost_price.message}</p>}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="selling_price">Precio Venta</Label>
          <Input id="selling_price" type="number" step="0.01" {...register('selling_price')} />
          {errors.selling_price && <p className="text-sm text-red-500">{errors.selling_price.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="current_stock">Stock</Label>
          <Input id="current_stock" type="number" {...register('current_stock')} />
          {errors.current_stock && <p className="text-sm text-red-500">{errors.current_stock.message}</p>}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="min_stock_level">Min</Label>
          <Input id="min_stock_level" type="number" {...register('min_stock_level')} />
          {errors.min_stock_level && <p className="text-sm text-red-500">{errors.min_stock_level.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="max_stock_level">Max</Label>
          <Input id="max_stock_level" type="number" {...register('max_stock_level')} />
          {errors.max_stock_level && <p className="text-sm text-red-500">{errors.max_stock_level.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="image_url">URL Imagen</Label>
        <Input id="image_url" {...register('image_url')} placeholder="https://..." />
        {errors.image_url && <p className="text-sm text-red-500">{errors.image_url.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <textarea 
          id="description" 
          {...register('description')} 
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Detalles del producto..."
        />
        {errors.description && <p className="text-sm text-red-500">{errors.description.message}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : initialData ? 'Actualizar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
