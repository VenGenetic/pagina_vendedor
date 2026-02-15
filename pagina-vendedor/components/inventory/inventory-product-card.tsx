'use client';

import { memo } from 'react';
import { Producto } from '@/types';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Trash2, TrendingUp, Package, Search } from 'lucide-react';
import Image from 'next/image';
import { formatCurrency, isLowStock, calculateStockPercentage } from '@/lib/utils';
import { RestockDialog } from '@/components/inventory/restock-dialog';
import { ProductDialog } from '@/components/inventory/product-dialog';

interface InventoryProductCardProps {
    product: Producto;
    onUpdateStock: (product: Producto, change: number) => void;
    onDelete: (product: Producto) => void;
    onSuccess: (data: any) => void;
}

export const InventoryProductCard = memo(function InventoryProductCard({
    product,
    onUpdateStock,
    onDelete,
    onSuccess
}: InventoryProductCardProps) {
    const lowStock = isLowStock(product.current_stock, 5);
    const outOfStock = product.current_stock <= 0;
    const stockPercentage = calculateStockPercentage(
        product.current_stock,
        0,
        100
    );

    return (
        <div
            className={`group relative bg-white dark:bg-slate-900 rounded-2xl border transition-all hover:shadow-lg hover:-translate-y-0.5 duration-300 flex flex-col ${outOfStock
                ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50'
                : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                }`}
        >
            {/* Status Badge */}
            <div className="absolute top-3 left-3 z-10">
                {outOfStock ? (
                    <span className="px-2 py-1 rounded-md bg-slate-900 text-white text-[10px] font-bold shadow-sm uppercase tracking-wide">Agotado</span>
                ) : lowStock ? (
                    <span className="px-2 py-1 rounded-md bg-amber-500 text-white text-[10px] font-bold shadow-sm uppercase tracking-wide animate-pulse">Stock Bajo</span>
                ) : null}
            </div>

            <div className="p-4 flex-1">
                {/* Header Section with Image & Price */}
                <div className="flex gap-4 mb-3">
                    <div className={`shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center ${outOfStock ? 'opacity-50 grayscale' : ''}`}>
                        {product.image_url ? (
                            <div className="relative w-full h-full">
                                <Image
                                    src={product.image_url}
                                    alt={product.name}
                                    fill
                                    sizes="80px"
                                    className="object-cover"
                                />
                            </div>
                        ) : (
                            <Package className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                        )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-start">
                        <div>
                            <h4 className={`font-semibold text-sm leading-tight mb-1 ${outOfStock ? 'text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
                                {product.name}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-mono truncate bg-slate-50 dark:bg-slate-800/50 inline-block px-1.5 py-0.5 rounded">
                                {product.sku}
                            </p>
                        </div>
                        <div className="mt-auto pt-2 text-right">
                            <span className={`block text-lg font-bold leading-none ${outOfStock ? 'text-slate-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                                {formatCurrency(product.selling_price)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                                Costo: {formatCurrency(product.cost_price)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Stock Control */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                            <span>Disponible:</span>
                            <span className={outOfStock ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-900 dark:text-slate-200 font-bold'}>
                                {product.current_stock}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
                                onClick={() => onUpdateStock(product, -1)}
                                disabled={product.current_stock <= 0}
                            >
                                <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                                onClick={() => onUpdateStock(product, 1)}
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${outOfStock ? 'bg-slate-300 dark:bg-slate-700' :
                                lowStock ? 'bg-amber-500' :
                                    'bg-emerald-500'
                                }`}
                            style={{ width: `${Math.min(100, Math.max(5, stockPercentage))}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Footer / Meta Data */}
            <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 rounded-b-2xl flex items-center justify-between">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[50%]">
                    {product.category || 'Sin categoría'}
                    {product.brand && <span className="mx-1 opacity-50">•</span>}
                    {product.brand}
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <RestockDialog
                        product={product}
                        trigger={
                            <button
                                title="Surtir Inventario"
                                className="p-1 text-slate-400 hover:text-violet-600 transition-colors"
                                type="button"
                            >
                                <TrendingUp className="h-4 w-4" />
                            </button>
                        }
                    />
                    <ProductDialog product={product} onSuccess={onSuccess} />
                    <button
                        onClick={() => onDelete(product)}
                        disabled={product.current_stock > 0}
                        title={product.current_stock > 0 ? "No se puede eliminar productos con stock" : "Eliminar producto"}
                        className={`p-1 transition-colors ${product.current_stock > 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-rose-600'}`}
                        type="button"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
                {/* Show simplified actions on mobile always */}
                <div className="flex md:hidden items-center gap-2">
                    <RestockDialog
                        product={product}
                        trigger={
                            <button
                                className="text-slate-400 p-1"
                                type="button"
                            >
                                <TrendingUp className="h-4 w-4" />
                            </button>
                        }
                    />
                    <ProductDialog product={product} onSuccess={onSuccess} />
                    {product.current_stock <= 0 && (
                        <button
                            onClick={() => onDelete(product)}
                            className="text-slate-400 p-1"
                            type="button"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});
