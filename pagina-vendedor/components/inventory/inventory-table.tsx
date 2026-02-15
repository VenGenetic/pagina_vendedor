'use client';

import { memo } from 'react';
import { Producto } from '@/types';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Minus, Plus, Trash2, TrendingUp, MoreHorizontal, Pencil } from 'lucide-react';
import { formatCurrency, isLowStock } from '@/lib/utils';
import { RestockDialog } from '@/components/inventory/restock-dialog';
import { ProductDialog } from '@/components/inventory/product-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface InventoryTableProps {
    products: Producto[];
    onUpdateStock: (product: Producto, change: number) => void;
    onDelete: (product: Producto) => void;
    onSuccess: (data: any) => void;
}

export const InventoryTable = memo(function InventoryTable({
    products,
    onUpdateStock,
    onDelete,
    onSuccess
}: InventoryTableProps) {

    return (
        <div className="rounded-md border bg-white dark:bg-slate-900 shadow-sm">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[100px]">SKU</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Categoría / Marca</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-center">Stock</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {products.map((product) => {
                        const lowStock = isLowStock(product.current_stock, 5);
                        const outOfStock = product.current_stock <= 0;

                        return (
                            <TableRow key={product.id}>
                                <TableCell className="font-medium text-xs text-slate-500">
                                    {product.sku}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className={`font-medium ${outOfStock ? 'text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                                            {product.name}
                                        </span>
                                        {outOfStock && (
                                            <span className="text-[10px] text-rose-500 font-bold uppercase">Agotado</span>
                                        )}
                                        {lowStock && !outOfStock && (
                                            <span className="text-[10px] text-amber-500 font-bold uppercase">Stock Bajo</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                                    {product.category || '-'}
                                    {product.brand && <span className="text-xs text-slate-400 ml-1">({product.brand})</span>}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                    {formatCurrency(product.selling_price)}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center justify-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => onUpdateStock(product, -1)}
                                            disabled={product.current_stock <= 0}
                                        >
                                            <Minus className="h-3 w-3" />
                                        </Button>
                                        <span className={`w-8 text-center font-bold ${outOfStock ? 'text-rose-500' :
                                                lowStock ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'
                                            }`}>
                                            {product.current_stock}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => onUpdateStock(product, 1)}
                                        >
                                            <Plus className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <RestockDialog
                                            product={product}
                                            trigger={
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                                                    <TrendingUp className="h-4 w-4" />
                                                </Button>
                                            }
                                        />

                                        <ProductDialog
                                            product={product}
                                            onSuccess={onSuccess}
                                            trigger={
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900">
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            }
                                        />

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                            onClick={() => onDelete(product)}
                                            disabled={product.current_stock > 0}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
});
