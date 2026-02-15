'use client';

import { useState, useMemo } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    flexRender,
    ColumnDef,
    SortingState,
    ColumnFiltersState
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, AlertCircle, CheckCircle, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StagingStatus = 'MATCH' | 'NEW' | 'DISCREPANCY';

export interface StagingItem {
    id: string; // Internal ID for the grid
    sku: string;
    name: string;
    category: string;
    brand: string;
    cost_price: number;
    selling_price: number;
    initial_stock: number; // New field for Ledger-First import
    db_price?: number; // Previous price for comparison
    status: StagingStatus;
}

interface StagingGridProps {
    data: StagingItem[];
    onDataChange: (data: StagingItem[]) => void;
}

export function StagingGrid({ data, onDataChange }: StagingGridProps) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState('');

    const handleEdit = (id: string, field: keyof StagingItem, value: any) => {
        const newData = data.map(item => {
            if (item.id === id) {
                return { ...item, [field]: value };
            }
            return item;
        });
        onDataChange(newData);
    };

    const handleDelete = (id: string) => {
        onDataChange(data.filter(item => item.id !== id));
    };

    const handleAddRow = () => {
        const newItem: StagingItem = {
            id: Math.random().toString(36).substr(2, 9),
            sku: '',
            name: '',
            category: 'General',
            brand: '',
            cost_price: 0,
            selling_price: 0,
            initial_stock: 0,
            status: 'NEW'
        };
        onDataChange([newItem, ...data]);
    };

    const columns = useMemo<ColumnDef<StagingItem>[]>(() => [
        {
            accessorKey: 'status',
            header: 'Estado',
            cell: ({ row }) => {
                const status = row.getValue('status') as StagingStatus;
                return (
                    <div className={cn(
                        "flex items-center gap-1 font-medium",
                        status === 'NEW' && "text-blue-600",
                        status === 'DISCREPANCY' && "text-yellow-600",
                        status === 'MATCH' && "text-green-600"
                    )}>
                        {status === 'DISCREPANCY' && <AlertCircle className="h-4 w-4" />}
                        {status === 'MATCH' && <CheckCircle className="h-4 w-4" />}
                        {status}
                    </div>
                )
            }
        },
        {
            accessorKey: 'sku',
            header: 'SKU',
            cell: ({ row }) => (
                <Input
                    value={row.getValue('sku')}
                    onChange={(e) => handleEdit(row.original.id, 'sku', e.target.value)}
                    className="h-8 w-[120px]"
                />
            )
        },
        {
            accessorKey: 'name',
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                    Producto <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => (
                <Input
                    value={row.getValue('name')}
                    onChange={(e) => handleEdit(row.original.id, 'name', e.target.value)}
                    className="h-8"
                />
            )
        },
        {
            accessorKey: 'initial_stock',
            header: 'Stock Inicial',
            cell: ({ row }) => (
                <Input
                    type="number"
                    value={row.getValue('initial_stock')}
                    onChange={(e) => handleEdit(row.original.id, 'initial_stock', parseFloat(e.target.value))}
                    className="h-8 w-[80px]"
                />
            )
        },
        {
            accessorKey: 'selling_price',
            header: 'Precio Venta',
            cell: ({ row }) => {
                const item = row.original;
                const isDiscrepancy = item.db_price !== undefined && item.selling_price !== item.db_price;

                return (
                    <div className="flex flex-col">
                        <Input
                            type="number"
                            value={row.getValue('selling_price')}
                            onChange={(e) => handleEdit(item.id, 'selling_price', parseFloat(e.target.value))}
                            className={cn("h-8 w-[100px]", isDiscrepancy && "bg-yellow-100 border-yellow-400")}
                        />
                        {isDiscrepancy && (
                            <span className="text-[10px] text-muted-foreground">
                                Actual: ${item.db_price}
                            </span>
                        )}
                    </div>
                )
            }
        },
        {
            accessorKey: 'category',
            header: 'Categoría',
            cell: ({ row }) => (
                <Input
                    value={row.getValue('category')}
                    onChange={(e) => handleEdit(row.original.id, 'category', e.target.value)}
                    className="h-8 w-[100px]"
                />
            )
        },
        {
            id: 'actions',
            cell: ({ row }) => (
                <Button variant="ghost" size="icon" onClick={() => handleDelete(row.original.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
            )
        }
    ], [data]);

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        state: {
            sorting,
            columnFilters,
            globalFilter,
        }
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <Input
                    placeholder="Buscar en tabla..."
                    value={globalFilter ?? ''}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className="max-w-sm"
                />
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => onDataChange([])} disabled={data.length === 0}>
                        Limpiar Todo
                    </Button>
                    <Button onClick={handleAddRow} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Agregar Fila Manual
                    </Button>
                </div>
            </div>

            <div className="rounded-md border h-[400px] overflow-auto">
                <table className="w-full caption-bottom text-sm relative">
                    <thead className="sticky top-0 bg-background z-10 shadow-sm">
                        {table.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                {headerGroup.headers.map(header => (
                                    <th key={header.id} className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map(row => (
                                <tr key={row.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                    {row.getVisibleCells().map(cell => (
                                        <td key={cell.id} className="p-4 align-middle">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="h-24 text-center">
                                    No hay datos. Importa un CSV o agrega filas manualmente.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="text-xs text-muted-foreground">
                Total de filas: {data.length}
            </div>
        </div>
    );
}
