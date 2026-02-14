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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Producto } from '@/types';
import { supabase } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, Loader2, CreditCard, Building2, Sparkles, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, useAccounts } from '@/hooks/use-queries';

// Updated schema with account and provider fields (BPMN-aligned)
const restockSchema = z.object({
    quantity: z.coerce.number().int().min(1, 'La cantidad debe ser mayor a 0'),
    unit_cost: z.coerce.number().min(0.01, 'El costo debe ser mayor a 0'),
    account_id: z.string().min(1, 'Seleccione una cuenta'),
    provider_name: z.string().optional(),
    payment_method: z.enum(['CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER']).default('CASH'),
    tax_percent: z.coerce.number().min(0).max(100).default(15),           // BPMN: Activity_RecordFinancial
    margin_target: z.coerce.number().min(1).max(99).default(65),          // BPMN: Activity_ApplyPrices
    discount_percent: z.coerce.number().min(0).max(100).default(0),       // BPMN: C2.6.1 Discount Earnings
    negotiated_cost: z.coerce.number().min(0).optional(),                // BPMN: Negotiated Cost Override
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

    // BPMN: Activity_QueryDemandStudy - Demand suggestion state
    const [demandData, setDemandData] = useState<{
        suggestedQty: number;
        velocity30d: number;
        priceDropDetected: boolean;
        previousCost: number | null;
    } | null>(null);
    const [loadingDemand, setLoadingDemand] = useState(false);

    // Fetch accounts for the dropdown
    const { data: accounts, isLoading: accountsLoading } = useAccounts();

    // Create form with default values
    const { register, handleSubmit, watch, formState: { errors }, reset, setValue } = useForm<RestockFormValues>({
        resolver: zodResolver(restockSchema) as any,
        defaultValues: {
            quantity: 1,
            unit_cost: product.cost_price,
            account_id: '',
            provider_name: '',
            payment_method: 'CASH',
            tax_percent: 15,
            margin_target: product.target_margin ? product.target_margin * 100 : 65,
            discount_percent: 0,
            negotiated_cost: undefined,
        }
    });

    // Set default account when accounts load
    useEffect(() => {
        if (accounts && accounts.length > 0 && !watch('account_id')) {
            // Try to find "Caja Grande" or use first account
            const defaultAccount = accounts.find(a =>
                a.name.toLowerCase().includes('caja grande') ||
                a.name.toLowerCase().includes('principal')
            ) || accounts[0];
            if (defaultAccount) {
                setValue('account_id', defaultAccount.id);
            }
        }
    }, [accounts, setValue, watch]);

    // BPMN: Activity_QueryDemandStudy - Fetch demand suggestions when dialog opens
    useEffect(() => {
        if (open && product.id) {
            setLoadingDemand(true);
            (supabase.rpc as any)('query_demand_study', {
                p_product_ids: [product.id]
            }).then(({ data, error }: any) => {
                if (!error && data && data.length > 0) {
                    const item = data[0];
                    const velocity = item.velocity_30d || 0;
                    // Suggest 30 days of stock based on velocity
                    const suggested = Math.max(1, Math.ceil(velocity * 30));
                    setDemandData({
                        suggestedQty: suggested,
                        velocity30d: velocity,
                        priceDropDetected: item.previous_cost > product.cost_price,
                        previousCost: item.previous_cost || null
                    });
                }
            }).finally(() => setLoadingDemand(false));
        }
    }, [open, product.id, product.cost_price]);

    const watchedCost = watch('unit_cost');
    const watchedNegotiated = watch('negotiated_cost');
    const watchedMargin = watch('margin_target');
    const watchedTax = watch('tax_percent');
    const watchedDiscount = watch('discount_percent');

    const [previewPrice, setPreviewPrice] = useState<number | null>(null);
    const [systemEarning, setSystemEarning] = useState<number | null>(null);

    // Calculate preview price and earnings when inputs change (BPMN: Activity_CalculateWAC / Activity_ApplyPrices)
    useEffect(() => {
        if (watchedCost > 0) {
            // NEW RULE: Selling Price = Cost * 1.65 (65% Markup)
            const suggestedPrice = watchedCost * 1.65;
            setPreviewPrice(Math.round(suggestedPrice * 100) / 100);

            // Calculate Earning (Gap between List Price and Negotiated/Real Cost)
            if (watchedNegotiated && watchedNegotiated > 0 && watchedNegotiated < watchedCost) {
                const earning = (watchedCost - watchedNegotiated) * watch('quantity');
                setSystemEarning(earning);
            } else {
                setSystemEarning(null);
            }
        } else {
            setPreviewPrice(null);
            setSystemEarning(null);
        }
    }, [watchedCost, watchedNegotiated, watchedMargin, watchedTax, watchedDiscount, watch('quantity')]);

    const onSubmit = async (data: RestockFormValues) => {
        setIsSubmitting(true);
        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();

            const total_amount = data.quantity * data.unit_cost;

            // Call the BPMN-aligned RPC (process_restock_v3)
            // Using (supabase.rpc as any) to bypass local TS types that might be outdated with the DB
            const { data: result, error } = await (supabase.rpc as any)('process_restock_v3', {
                p_account_id: data.account_id,
                p_provider_name: data.provider_name || null,
                p_payment_method: data.payment_method,
                p_total_amount: total_amount,
                p_reference_number: null,
                p_notes: null,
                p_user_id: user?.id || null,
                p_tax_percent: data.tax_percent,
                p_margin_percent: data.margin_target,
                p_discount_percent: data.discount_percent,
                p_items: [{
                    product_id: product.id,
                    quantity: data.quantity,
                    unit_cost: data.unit_cost,
                    discount_rate: (data.discount_percent || 0) / 100,
                    negotiated_cost: data.negotiated_cost
                }]
            }) as { data: { success: boolean; error?: string } | null; error: any };

            if (error) throw error;

            if (result && !result.success) {
                throw new Error(result.error || 'Error al procesar reabastecimiento');
            }

            toast.success('Producto reabastecido exitosamente');
            toast.info('Se creó una propuesta de precio pendiente de aprobación', {
                description: 'Revise en Control de Precios'
            });

            // Invalidate queries to refresh lists
            queryClient.invalidateQueries({ queryKey: queryKeys.products });
            queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
            queryClient.invalidateQueries({ queryKey: ['price-proposals'] });

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
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Reabastecer Producto</DialogTitle>
                    <DialogDescription>
                        {product.name} - SKU: {product.sku}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4 py-4">
                    {/* Quantity and Cost Row */}
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

                    {/* Negotiated Cost (Optional Override) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="negotiated_cost" className="text-violet-600 dark:text-violet-400 font-medium">
                                Costo Negociado (Real)
                                <span className="ml-1 text-xs font-normal text-slate-500">(Opcional)</span>
                            </Label>
                            <Input
                                id="negotiated_cost"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Si es diferente al costo unitario..."
                                {...register('negotiated_cost')}
                                className="text-right border-violet-200 focus:border-violet-500"
                            />
                            {systemEarning && systemEarning > 0 && (
                                <p className="text-xs text-emerald-600 font-medium text-right">
                                    Ganancia Sistema: {formatCurrency(systemEarning)}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* BPMN: Activity_QueryDemandStudy - Demand Suggestions */}
                    {loadingDemand ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Consultando historial de demanda...
                        </div>
                    ) : demandData && (
                        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 border border-blue-200 dark:border-blue-800 space-y-2">
                            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
                                <Sparkles className="h-4 w-4" />
                                Sugerencia de Demanda
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">Ventas/día:</span>
                                    <span className="ml-2 font-medium">{demandData.velocity30d.toFixed(2)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">Sugerido (30d):</span>
                                    <button
                                        type="button"
                                        onClick={() => setValue('quantity', demandData.suggestedQty)}
                                        className="ml-2 font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        {demandData.suggestedQty} unidades
                                    </button>
                                </div>
                            </div>
                            {demandData.priceDropDetected && demandData.previousCost && (
                                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                                    <TrendingDown className="h-4 w-4" />
                                    ¡Precio bajó! Antes: {formatCurrency(demandData.previousCost)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Financial Information (BPMN: Activity_RecordFinancial) */}
                    <div className="border-t pt-4 space-y-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                            <CreditCard className="h-4 w-4" />
                            Información de Pago
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Cuenta de Pago *</Label>
                                <Select
                                    value={watch('account_id')}
                                    onValueChange={(value) => setValue('account_id', value)}
                                    disabled={accountsLoading}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={accountsLoading ? "Cargando..." : "Seleccionar cuenta"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {accounts?.map((account) => (
                                            <SelectItem key={account.id} value={account.id}>
                                                {account.name} ({formatCurrency(account.balance)})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {errors.account_id && <p className="text-xs text-red-500">{errors.account_id.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label>Método de Pago</Label>
                                <Select
                                    value={watch('payment_method')}
                                    onValueChange={(value: any) => setValue('payment_method', value)}
                                >
                                    <SelectTrigger>
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

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Building2 className="h-4 w-4" />
                                Proveedor (Opcional)
                            </Label>
                            <Input
                                placeholder="Nombre del proveedor..."
                                {...register('provider_name')}
                            />
                        </div>

                        {/* Financial Correction Fields - BPMN Phase 2 */}
                        <div className="grid grid-cols-3 gap-3 pt-2 border-t mt-2">
                            <div className="space-y-1">
                                <Label className="text-[10px] uppercase font-bold text-slate-500">IVA %</Label>
                                <Input
                                    type="number"
                                    {...register('tax_percent')}
                                    className="h-8 text-xs text-right"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] uppercase font-bold text-slate-500">Margen %</Label>
                                <Input
                                    type="number"
                                    {...register('margin_target')}
                                    className="h-8 text-xs text-right bg-slate-100"
                                    disabled
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] uppercase font-bold text-slate-500">Desc %</Label>
                                <Input
                                    type="number"
                                    {...register('discount_percent')}
                                    className="h-8 text-xs text-right"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Smart Pricing Preview */}
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 border border-slate-100 dark:border-slate-800 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Margen Objetivo:</span>
                            <span className="font-medium">
                                {product.target_margin
                                    ? `${(product.target_margin * 100).toFixed(0)}%`
                                    : <span className="text-slate-400 italic">65% (Default)</span>}
                            </span>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Precio Sugerido:</span>
                            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                {previewPrice ? formatCurrency(previewPrice) : '---'}
                            </span>
                        </div>

                        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                            ⚠️ El precio final debe aprobarse en <strong>Control de Precios</strong>
                        </p>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || !watch('account_id')}
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                        >
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar Ingreso
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
