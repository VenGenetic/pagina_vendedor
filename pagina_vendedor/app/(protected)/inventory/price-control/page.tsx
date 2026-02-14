'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPendingProposals, getPotentialValuation, approveProposal, rejectProposal, type PriceProposal } from '@/lib/services/pricing';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { Loader2, Check, X, Edit, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function PriceControlPage() {
    const queryClient = useQueryClient();
    const [editingProposal, setEditingProposal] = useState<PriceProposal | null>(null);
    const [editPrice, setEditPrice] = useState<string>('');

    // Queries
    const { data: proposals, isLoading: isLoadingProposals } = useQuery({
        queryKey: ['price-proposals'],
        queryFn: getPendingProposals
    });

    const { data: valuation, isLoading: isLoadingValuation } = useQuery({
        queryKey: ['valuation-potential'],
        queryFn: getPotentialValuation
    });

    // Mutations
    const approveMutation = useMutation({
        mutationFn: async ({ id, price }: { id: string, price?: number }) => {
            return await approveProposal(id, price);
        },
        onSuccess: () => {
            toast.success('Propuesta aprobada correctamente');
            queryClient.invalidateQueries({ queryKey: ['price-proposals'] });
            queryClient.invalidateQueries({ queryKey: ['valuation-potential'] });
            setEditingProposal(null);
        },
        onError: (error) => {
            toast.error('Error al aprobar: ' + error.message);
        }
    });

    const rejectMutation = useMutation({
        mutationFn: async (id: string) => {
            return await rejectProposal(id);
        },
        onSuccess: () => {
            toast.info('Propuesta rechazada (Precios anteriores mantenidos)');
            queryClient.invalidateQueries({ queryKey: ['price-proposals'] });
            queryClient.invalidateQueries({ queryKey: ['valuation-potential'] });
        },
        onError: (error) => {
            toast.error('Error al rechazar: ' + error.message);
        }
    });

    const handleEditOpen = (proposal: PriceProposal) => {
        setEditingProposal(proposal);
        setEditPrice(proposal.proposed_price.toString());
    };

    const handleEditConfirm = () => {
        if (!editingProposal) return;
        const finalPrice = parseFloat(editPrice);
        if (isNaN(finalPrice) || finalPrice < 0) {
            toast.error('Por favor ingrese un precio válido');
            return;
        }
        approveMutation.mutate({ id: editingProposal.id, price: finalPrice });
    };

    if (isLoadingProposals) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 p-2 md:p-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Control de Precios</h1>
                <p className="text-muted-foreground text-sm">
                    Revise y apruebe cambios de costos basados en nuevas compras.
                </p>
            </div>

            {/* Valuation Summary Card */}
            {valuation && valuation.count > 0 && (
                <Card className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950 dark:to-background border-indigo-200 dark:border-indigo-900">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                            <TrendingUp className="h-5 w-5" />
                            Impacto Potencial
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Propuestas Pendientes</p>
                                <p className="text-2xl font-bold">{valuation.count}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Valorización (Diferencia)</p>
                                <p className={`text-2xl font-bold ${valuation.value_diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {valuation.value_diff >= 0 ? '+' : ''}{formatCurrency(valuation.value_diff)}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Si aprueba todo, el valor del inventario pasará de {formatCurrency(valuation.current_total_value)} a {formatCurrency(valuation.potential_total_value)}.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Empty State */}
            {(!proposals || proposals.length === 0) && (
                <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed">
                    <Check className="h-12 w-12 mx-auto text-green-500 mb-4 opacity-50" />
                    <h3 className="text-lg font-medium">Todo al día</h3>
                    <p className="text-muted-foreground">No hay propuestas de precios pendientes de revisión.</p>
                </div>
            )}

            {/* List of Proposals */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {proposals?.map((proposal) => (
                    <Card key={proposal.id} className="overflow-hidden border-l-4 border-l-yellow-500 shadow-sm">
                        <CardHeader className="pb-3 bg-muted/5">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <Badge variant="outline" className="mb-1 border-yellow-500 text-yellow-600 bg-yellow-50">
                                        Cambio de Costo Detectado
                                    </Badge>
                                    <CardTitle className="text-base line-clamp-2 flex items-center gap-2">
                                        {proposal.products?.name || 'Producto Desconocido'}
                                        {proposal.products?.needs_price_review && (
                                            <Badge variant="destructive" className="h-5 px-1.5 animate-pulse">
                                                <AlertCircle className="h-3 w-3 mr-1" />
                                                Revisión Necesaria
                                            </Badge>
                                        )}
                                    </CardTitle>
                                    <CardDescription className="font-mono text-xs">
                                        SKU: {proposal.products?.sku}
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">

                            {/* Cost Comparison */}
                            <div className="grid grid-cols-2 gap-2 text-sm border-b pb-3">
                                <div className="space-y-1">
                                    <span className="text-xs text-muted-foreground block">Costo Actual</span>
                                    <span className="font-medium text-slate-500 line-through">
                                        {formatCurrency(proposal.current_cost)}
                                    </span>
                                </div>
                                <div className="space-y-1 text-right">
                                    <span className="text-xs text-muted-foreground block font-bold text-yellow-700">Nuevo Costo (PMP)</span>
                                    <div className="flex items-center justify-end gap-1 text-yellow-700 font-bold">
                                        <span>{formatCurrency(proposal.proposed_cost)}</span>
                                        {(proposal.proposed_cost - proposal.current_cost) !== 0 && (
                                            <span className={`text-xs ${proposal.proposed_cost > proposal.current_cost ? 'text-red-500' : 'text-green-500'}`}>
                                                ({proposal.proposed_cost > proposal.current_cost ? '+' : ''}
                                                {((proposal.proposed_cost - proposal.current_cost) / (proposal.current_cost || 1) * 100).toFixed(1)}%)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Price Action Area */}
                            <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-semibold uppercase text-muted-foreground">Precio de Venta Sugerido</span>
                                    <Edit
                                        className="h-4 w-4 text-violet-500 cursor-pointer hover:text-violet-700"
                                        onClick={() => handleEditOpen(proposal)}
                                    />
                                </div>
                                <div className="flex items-end justify-between">
                                    <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                                        {formatCurrency(proposal.proposed_price)}
                                    </div>
                                    {/* Margin Indicator */}
                                    <div className="text-xs text-muted-foreground text-right">
                                        Margin: {((1 - (proposal.proposed_cost / proposal.proposed_price)) * 100).toFixed(1)}%
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <Button
                                    variant="outline"
                                    className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => rejectMutation.mutate(proposal.id)}
                                    disabled={approveMutation.isPending || rejectMutation.isPending}
                                >
                                    <X className="mr-2 h-4 w-4" /> Rechazar
                                </Button>
                                <Button
                                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => approveMutation.mutate({ id: proposal.id })}
                                    disabled={approveMutation.isPending || rejectMutation.isPending}
                                >
                                    <Check className="mr-2 h-4 w-4" /> Aprobar
                                </Button>
                            </div>

                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Edit Dialog */}
            <Dialog open={!!editingProposal} onOpenChange={(open) => !open && setEditingProposal(null)}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Editar Precio de Venta</DialogTitle>
                        <DialogDescription>
                            Ajuste el precio final para <strong>{editingProposal?.products?.name}</strong> antes de aprobar.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Costo PMP Calculado (Solo Lectura)</Label>
                            <Input
                                disabled
                                value={editingProposal ? formatCurrency(editingProposal.proposed_cost) : ''}
                                className="bg-muted"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="price" className="text-violet-600 font-bold">Nuevo Precio de Venta</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                <Input
                                    id="price"
                                    type="number"
                                    step="0.01"
                                    className="pl-7 font-bold text-lg"
                                    value={editPrice}
                                    onChange={(e) => setEditPrice(e.target.value)}
                                />
                            </div>
                            {/* Dynamic Margin Calc in Modal */}
                            {editingProposal && parseFloat(editPrice) > 0 && (
                                <p className="text-sm text-right text-muted-foreground">
                                    Nuevo Margen: {((1 - (editingProposal.proposed_cost / parseFloat(editPrice))) * 100).toFixed(1)}%
                                </p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingProposal(null)}>Cancelar</Button>
                        <Button className="bg-violet-600 hover:bg-violet-700" onClick={handleEditConfirm}>
                            Aprobar con Nuevo Precio
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
