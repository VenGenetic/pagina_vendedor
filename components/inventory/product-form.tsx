'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Producto } from '@/types';
import { useState } from 'react';
import { useLocalDrafts, type DraftItem } from '@/hooks/use-local-drafts';
import { DraftManager } from '@/components/common/draft-manager';
import { PriceCalculator, PriceCalculatorValues } from '@/components/common/price-calculator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Schema ──────────────────────────────────────────────────────
const productSchema = z.object({
  sku: z.string().min(1, 'El SKU es requerido'),
  name: z.string().min(1, 'El nombre es requerido'),
  brand: z.string().optional(),
  category: z.string().optional(),
  cost_price: z.coerce.number().min(0, 'El costo debe ser mayor o igual a 0'),
  selling_price: z.coerce.number().min(0, 'El precio debe ser mayor o igual a 0'),
  target_margin: z.coerce.number().min(0).max(99, 'El margen no puede superar el 99%').optional().nullable(),
  current_stock: z.coerce.number().int().min(0, 'El stock debe ser mayor o igual a 0'),

  description: z.string().optional(),
  image_url: z.string().url('URL inválida').optional().or(z.literal('')),
});

type ProductFormValues = z.infer<typeof productSchema>;

// ─── Props ───────────────────────────────────────────────────────
interface ProductFormProps {
  initialData?: Producto;
  onSubmit: (data: ProductFormValues) => Promise<void>;
  onCancel: () => void;
}

// ─── Helper: conditional error border ────────────────────────────
function errorBorder(hasError: boolean) {
  return hasError ? 'border-destructive focus-visible:ring-destructive' : '';
}

// ─── Component ───────────────────────────────────────────────────
export function ProductForm({ initialData, onSubmit, onCancel }: ProductFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(undefined);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: initialData
      ? {
        sku: initialData.sku,
        name: initialData.name,
        brand: initialData.brand || '',
        category: initialData.category || '',
        cost_price: initialData.cost_price,
        selling_price: initialData.selling_price,
        target_margin: initialData.target_margin
          ? initialData.target_margin * 100
          : undefined,
        current_stock: initialData.current_stock,

        description: initialData.description || '',
        image_url: initialData.image_url || '',
      }
      : {
        cost_price: 0,
        selling_price: 0,
        current_stock: 0,

        target_margin: 30,
      },
  });

  // ── Draft integration ────────────────────────────────────────
  const { saveDraft, getLatestDraft, clearDrafts } = useLocalDrafts('product_new');
  const formValues = watch();

  // Auto-load latest draft on mount if no initialData
  useEffect(() => {
    if (!initialData) {
      const latest = getLatestDraft();
      if (latest) {
        reset(latest.data);
        setCurrentDraftId(latest.id);
      } else {
        // Start a fresh draft session
        setCurrentDraftId(crypto.randomUUID());
      }
    }
  }, [initialData, getLatestDraft, reset]);

  // Auto-save draft on every change (debounced 1s by the hook)
  useEffect(() => {
    if (currentDraftId) {
      saveDraft(formValues, undefined, currentDraftId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formValues), currentDraftId]);

  const handleDraftLoad = (draft: DraftItem) => {
    reset(draft.data);
    setCurrentDraftId(draft.id);
  };

  const handleNewDraft = () => {
    clearDrafts();
    reset({
      sku: '',
      name: '',
      brand: '',
      category: '',
      cost_price: 0,
      selling_price: 0,
      current_stock: 0,
      description: '',
      image_url: '',
      target_margin: 30,
    });
    setCurrentDraftId(crypto.randomUUID());
  };

  // ── Price Calculator sync ────────────────────────────────────
  const watchedCost = watch('cost_price');
  const watchedMargin = watch('target_margin');
  const watchedSellingPrice = watch('selling_price');

  const handlePriceChange = (values: PriceCalculatorValues) => {
    setValue('cost_price', values.cost, { shouldValidate: true });
    setValue('selling_price', Math.ceil(values.sellingPrice), { shouldValidate: true });
    setValue('target_margin', values.margin);
  };

  // ── Submit ───────────────────────────────────────────────────
  const onSubmitForm = async (data: ProductFormValues) => {
    setIsSubmitting(true);
    try {
      const processedData = {
        ...data,
        target_margin: data.target_margin ? data.target_margin / 100 : null,
      };
      await onSubmit(processedData);

      toast.success(initialData ? 'Producto actualizado correctamente' : 'Producto creado correctamente');

      // Clear draft on successful save
      clearDrafts();

    } catch (error) {
      console.error(error);
      toast.error('Ocurrió un error al guardar el producto');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
      {/* ── Header: Title + Draft Manager ─────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {initialData ? 'Editar Producto' : 'Nuevo Producto'}
        </h3>
        <DraftManager
          namespace="product_new"
          onLoad={handleDraftLoad}
          onNew={handleNewDraft}
        />
      </div>

      {/* ── Row 1: SKU + Brand ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sku" required>SKU</Label>
          <Input
            id="sku"
            {...register('sku')}
            placeholder="COD-001"
            className={cn(errorBorder(!!errors.sku))}
          />
          {errors.sku && <p className="text-sm text-destructive">{errors.sku.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand">Marca</Label>
          <Input id="brand" {...register('brand')} placeholder="Ej. Yamaha" />
          {errors.brand && <p className="text-sm text-destructive">{errors.brand.message}</p>}
        </div>
      </div>

      {/* ── Name ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="name" required>Nombre del Producto</Label>
        <Input
          id="name"
          {...register('name')}
          placeholder="Ej. Aceite 20W50"
          className={cn(errorBorder(!!errors.name))}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      {/* ── Category ──────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="category">Categoría</Label>
        <Input id="category" {...register('category')} placeholder="Ej. Lubricantes" />
        {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
      </div>

      {/* ── Pricing Card (Calculator) ─────────────────────────── */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <Label required className="text-sm font-semibold">Precios</Label>
        <PriceCalculator
          cost={watchedCost ?? 0}
          initialMargin={watchedMargin ?? 30}
          initialSellingPrice={initialData ? watchedSellingPrice : undefined}
          onChange={handlePriceChange}
        />
        {/* Hidden registered inputs to keep Zod happy on submit */}
        <input type="hidden" {...register('cost_price')} />
        <input type="hidden" {...register('selling_price')} />
        <input type="hidden" {...register('target_margin')} />
        <div className="flex gap-4 text-sm">
          {errors.cost_price && <p className="text-destructive">{errors.cost_price.message}</p>}
          {errors.selling_price && <p className="text-destructive">{errors.selling_price.message}</p>}
          {errors.target_margin && <p className="text-destructive">{errors.target_margin.message}</p>}
        </div>
      </div>

      {/* ── Stock Row ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="current_stock" required>Stock</Label>
        <Input
          id="current_stock"
          type="number"
          {...register('current_stock')}
          className={cn(errorBorder(!!errors.current_stock))}
        />
        {errors.current_stock && <p className="text-sm text-destructive">{errors.current_stock.message}</p>}
      </div>

      {/* ── Image URL ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="image_url">URL Imagen</Label>
        <Input id="image_url" {...register('image_url')} placeholder="https://..." />
        {errors.image_url && <p className="text-sm text-destructive">{errors.image_url.message}</p>}
      </div>

      {/* ── Description ───────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <textarea
          id="description"
          {...register('description')}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Detalles del producto..."
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
      </div>

      {/* ── Actions ────────────────────────────────────────────── */}
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
