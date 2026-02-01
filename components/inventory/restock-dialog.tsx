'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Producto } from '@/types';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/use-queries';

const restockSchema = z.object({
    quantity: z.coerce.number().int().min(1, 'La cantidad debe ser mayor a 0'),
    unit_cost: z.coerce.number().min(0.01, 'El costo debe ser mayor a 0'),
});

type RestockFormValues = z.infer<typeof restockSchema>;

interface RestockDialogProps {
    product: Producto;
    trigger?: React.ReactNode;
}

export function RestockDialog({ product, trigger }: RestockDialogProps) {
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const queryClient = useQueryClient();

    // Create form
    const { register, handleSubmit, watch, formState: { errors }, reset } = useForm<RestockFormValues>({
        resolver: zodResolver(restockSchema),
        defaultValues: {
            quantity: 1,
            unit_cost: product.cost_price, // Default to current cost
        }
    });

    const watchedCost = watch('unit_cost');
    const [previewPrice, setPreviewPrice] = useState<number | null>(null);

    // Calculate preview price when cost changes
    useEffect(() => {
        if (product.target_margin && watchedCost > 0) {
            // Formula: Cost / (1 - Margin)
            // Margin is stored as decimal e.g. 0.30
            const margin = product.target_margin;
            if (margin >= 1) return; // Should not happen due to constraint, but safety first

            const newPrice = watchedCost / (1 - margin);
            setPreviewPrice(newPrice);
        } else {
            setPreviewPrice(null);
        }
    }, [watchedCost, product.target_margin]);

    const onSubmit = async (data: RestockFormValues) => {
        setIsSubmitting(true);
        try {
            const { data: result, error } = await supabase.rpc('process_restock', {
                p_product_id: product.id,
                p_quantity: data.quantity,
                p_unit_cost: data.unit_cost
            } as any);

            if (error) throw error;

            toast.success('Producto reabastecido exitosamente');
            if (previewPrice) {
                toast.info(`Nuevo precio de venta: ${formatCurrency(previewPrice)}`);
            }

            // Invalidate queries to refresh list
            queryClient.invalidateQueries({ queryKey: queryKeys.products });
            setOpen(false);
            reset();
        } catch (error: any) {
            console.error('Error restocking:', error);
            toast.error(error.message || 'Error al procesar reabastecimiento');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm" className="gap-2 text-violet-600 border-violet-200 hover:bg-violet-50">
                        <TrendingUp className="h-4 w-4" />
                        Surtir
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Reabastecer Producto</DialogTitle>
                    <DialogDescription>
                        {product.name} - SKU: {product.sku}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="quantity">Cantidad a Ingresar</Label>
                            <Input
                                id="quantity"
                                type="number"
                                min="1"
                                step="1"
                                {...register('quantity')}
                                className="text-right"
                            />
                            {errors.quantity && <p className="text-xs text-red-500">{errors.quantity.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="unit_cost">Costo Unitario</Label>
                            <Input
                                id="unit_cost"
                                type="number"
                                min="0.01"
                                step="0.01"
                                {...register('unit_cost')}
                                className="text-right"
                            />
                            {errors.unit_cost && <p className="text-xs text-red-500">{errors.unit_cost.message}</p>}
                        </div>
                    </div>

                    {/* Smart Pricing Preview */}
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 border border-slate-100 dark:border-slate-800 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Margen Objetivo:</span>
                            <span className="font-medium">
                                {product.target_margin
                                    ? `${(product.target_margin * 100).toFixed(0)}%`
                                    : <span className="text-slate-400 italic">No configurado</span>}
                            </span>
                        </div>

                        {product.target_margin ? (
                            <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Nuevo Precio Venta:</span>
                                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                    {previewPrice ? formatCurrency(previewPrice) : '---'}
                                </span>
                            </div>
                        ) : (
                            <div className="text-xs text-slate-500 italic pt-1">
                                El precio de venta no se actualizará automáticamente porque no hay margen configurado.
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isSubmitting} className="bg-violet-600 hover:bg-violet-700 text-white">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar Ingreso
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
