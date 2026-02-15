'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { processPartialReturn, getSaleItemsForReturn } from '@/lib/services/bpmn-aligned';
import { toast } from 'sonner';
import { ArrowLeft, Search, Package, DollarSign, AlertTriangle, Check } from 'lucide-react';
import Link from 'next/link';

interface SaleItem {
    id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    product: {
        id: string;
        name: string;
        sku: string;
    };
}

interface Sale {
    id: string;
    sale_number: string;
    customer_name: string;
    total: number;
    payment_status: string;
    created_at: string;
}

export default function ReturnPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialSaleNumber = searchParams.get('sale') || '';

    const [saleNumber, setSaleNumber] = useState(initialSaleNumber);
    const [sale, setSale] = useState<Sale | null>(null);
    const [items, setItems] = useState<SaleItem[]>([]);
    const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
    const [reason, setReason] = useState('');
    const [searching, setSearching] = useState(false);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (initialSaleNumber) {
            handleSearch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSearch = async () => {
        if (!saleNumber.trim()) {
            toast.error('Ingrese un número de venta');
            return;
        }

        setSearching(true);
        try {
            // Fetch sale
            const { data: saleData, error: saleError } = await supabase
                .from('sales')
                .select('id, sale_number, customer_name, total, payment_status, created_at')
                .eq('sale_number', saleNumber.trim())
                .single();

            if (saleError || !saleData) {
                toast.error('Venta no encontrada');
                setSale(null);
                setItems([]);
                return;
            }

            // Cast to our Sale type
            const typedSale = saleData as unknown as Sale;

            if (typedSale.payment_status !== 'PAID') {
                toast.error(`Esta venta tiene estado: ${typedSale.payment_status}. Solo se pueden devolver ventas PAID.`);
                setSale(null);
                setItems([]);
                return;
            }

            setSale(typedSale);

            // Fetch items
            const result = await getSaleItemsForReturn(typedSale.id);
            if (result.success && result.data) {
                setItems(result.data as SaleItem[]);
                setSelectedItems(new Map());
            }
        } catch (error) {
            console.error('Error searching sale:', error);
            toast.error('Error al buscar la venta');
        } finally {
            setSearching(false);
        }
    };

    const toggleItem = (itemId: string, maxQuantity: number) => {
        const newSelected = new Map(selectedItems);
        if (newSelected.has(itemId)) {
            newSelected.delete(itemId);
        } else {
            newSelected.set(itemId, maxQuantity);
        }
        setSelectedItems(newSelected);
    };

    const updateQuantity = (itemId: string, quantity: number, maxQuantity: number) => {
        const newSelected = new Map(selectedItems);
        const validQty = Math.min(Math.max(1, quantity), maxQuantity);
        newSelected.set(itemId, validQty);
        setSelectedItems(newSelected);
    };

    const calculateRefundTotal = () => {
        let total = 0;
        for (const [itemId, qty] of selectedItems) {
            const item = items.find(i => i.id === itemId);
            if (item) {
                total += item.unit_price * qty;
            }
        }
        return total;
    };

    const handleSubmit = async () => {
        if (!sale || selectedItems.size === 0) {
            toast.error('Seleccione al menos un artículo para devolver');
            return;
        }

        setProcessing(true);
        try {
            const returnItems = Array.from(selectedItems.entries()).map(([saleItemId, quantityToReturn]) => ({
                saleItemId,
                quantityToReturn
            }));

            const result = await processPartialReturn(sale.id, returnItems, reason || 'Devolución solicitada');

            if (result.success) {
                toast.success(`Devolución procesada. Reembolso: $${result.refundAmount?.toFixed(2)}`);
                router.push('/transactions/sale');
            } else {
                toast.error(result.error || 'Error al procesar la devolución');
            }
        } catch (error) {
            console.error('Error processing return:', error);
            toast.error('Error al procesar la devolución');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="container mx-auto p-4 max-w-4xl">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/transactions/sale">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Devolución de Venta</h1>
                    <p className="text-sm text-muted-foreground">
                        BPMN: Activity_CreateRefund + Activity_RestoreStock
                    </p>
                </div>
            </div>

            {/* Search Section */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Search className="h-5 w-5" />
                        Buscar Venta
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Número de venta (ej: VTA-20260205-001)"
                            value={saleNumber}
                            onChange={(e) => setSaleNumber(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                        <Button onClick={handleSearch} disabled={searching}>
                            {searching ? 'Buscando...' : 'Buscar'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Sale Info */}
            {sale && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Venta: {sale.sale_number}</CardTitle>
                        <CardDescription>
                            Cliente: {sale.customer_name || 'Sin nombre'} |
                            Fecha: {new Date(sale.created_at).toLocaleDateString('es-EC')} |
                            Total Original: ${Number(sale.total).toFixed(2)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Badge variant={sale.payment_status === 'PAID' ? 'default' : 'destructive'}>
                            {sale.payment_status}
                        </Badge>
                    </CardContent>
                </Card>
            )}

            {/* Items List */}
            {items.length > 0 && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5" />
                            Seleccionar Artículos a Devolver
                        </CardTitle>
                        <CardDescription>
                            Haga clic en un artículo para seleccionarlo
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {items.map((item) => {
                            const isSelected = selectedItems.has(item.id);
                            const returnQty = selectedItems.get(item.id) || 0;
                            const product = item.product as { id: string; name: string; sku: string } | null;

                            return (
                                <div
                                    key={item.id}
                                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                                        }`}
                                    onClick={() => toggleItem(item.id, item.quantity)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-6 h-6 rounded border flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground'
                                                }`}>
                                                {isSelected && <Check className="h-4 w-4 text-primary-foreground" />}
                                            </div>
                                            <div>
                                                <p className="font-medium">{product?.name || 'Producto'}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    SKU: {product?.sku || 'N/A'} | Cantidad: {item.quantity} | Precio: ${Number(item.unit_price).toFixed(2)}
                                                </p>
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                <span className="text-sm">Devolver:</span>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={item.quantity}
                                                    value={returnQty}
                                                    onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1, item.quantity)}
                                                    className="w-20 text-center"
                                                />
                                                <span className="text-sm font-medium text-green-600">
                                                    = ${(Number(item.unit_price) * returnQty).toFixed(2)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}

            {/* Reason & Submit */}
            {selectedItems.size > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Confirmar Devolución
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">Motivo de la devolución</label>
                            <Textarea
                                placeholder="Describe el motivo de la devolución..."
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </div>

                        <div className="bg-muted p-4 rounded-lg">
                            <div className="flex justify-between items-center">
                                <span className="text-lg font-medium">Total a Reembolsar:</span>
                                <span className="text-2xl font-bold text-green-600">
                                    ${calculateRefundTotal().toFixed(2)}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">
                                {selectedItems.size} artículo(s) seleccionado(s)
                            </p>
                        </div>

                        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium text-yellow-800">Esta acción no se puede deshacer</p>
                                <p className="text-yellow-700">
                                    Se creará una transacción REFUND y se restaurará el inventario.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => router.push('/transactions/sale')}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={handleSubmit}
                                disabled={processing}
                            >
                                {processing ? 'Procesando...' : 'Procesar Devolución'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
