'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link2, Unlink2 } from 'lucide-react';

// ─── Props ───────────────────────────────────────────────────────
export interface PriceCalculatorValues {
    cost: number;
    margin: number;
    sellingPrice: number;
}

interface PriceCalculatorProps {
    /** Base cost (con IVA — what you pay the supplier). */
    cost: number;
    /** If true, the cost input is read-only. Defaults to false. */
    readOnlyCost?: boolean;
    /** Fires whenever a derived value changes. */
    onChange?: (values: PriceCalculatorValues) => void;
    /** Optional initial margin (0-99). Defaults to 30. */
    initialMargin?: number;
    /** Optional initial selling price. Used to derive margin in edit mode. */
    initialSellingPrice?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────
function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// ─── Component ───────────────────────────────────────────────────
// ─── Component ───────────────────────────────────────────────────
export function PriceCalculator({
    cost: externalCost,
    readOnlyCost = false,
    onChange,
    initialMargin = 30,
    initialSellingPrice,
}: PriceCalculatorProps) {
    // ── Internal State ──────────────────────────────────────────
    const [netCost, setNetCost] = useState(0);
    const [ivaRate, setIvaRate] = useState(15);
    const [grossCost, setGrossCost] = useState(externalCost || 0);
    const [margin, setMargin] = useState(initialMargin);
    const [sellingPrice, setSellingPrice] = useState(initialSellingPrice || 0);
    const [linked, setLinked] = useState(true);

    // Track which field was last edited to avoid infinite update loops
    type Source = 'netCost' | 'grossCost' | 'margin' | 'sellingPrice' | 'external' | 'ivaRate';
    const sourceRef = useRef<Source>('external');
    const initializedRef = useRef(false);

    // ── Initialization & External Sync ──────────────────────────
    useEffect(() => {
        if (!initializedRef.current) {
            const cost = externalCost || 0;
            const iva = 15; // default
            const net = round2(cost / (1 + iva / 100));
            setGrossCost(cost);
            setNetCost(net);
            setIvaRate(iva);

            if (initialSellingPrice && initialSellingPrice > 0) {
                setSellingPrice(initialSellingPrice);
                if (cost > 0) {
                    const m = round2(((initialSellingPrice / cost) - 1) * 100);
                    setMargin(Math.max(0, m));
                }
            } else {
                setSellingPrice(round2(cost * (1 + initialMargin / 100)));
            }
            initializedRef.current = true;
        } else if (externalCost !== grossCost && sourceRef.current === 'external') {
            const net = round2(externalCost / (1 + ivaRate / 100));
            setGrossCost(externalCost);
            setNetCost(net);
        }
    }, [externalCost, initialMargin, initialSellingPrice, grossCost, ivaRate]);

    // ── Bidirectional Logic ─────────────────────────────────────
    useEffect(() => {
        if (!linked) return;

        // Safety check to prevent infinite loops or NaN propagation
        if (isNaN(netCost) || isNaN(ivaRate) || isNaN(grossCost) || isNaN(margin) || isNaN(sellingPrice)) return;

        const src = sourceRef.current;

        if (src === 'netCost' || src === 'ivaRate') {
            const newGross = round2(netCost * (1 + ivaRate / 100));
            const newSP = round2(newGross * (1 + margin / 100));
            // Prevent redundant updates
            if (newGross !== grossCost || newSP !== sellingPrice) {
                setGrossCost(newGross);
                setSellingPrice(newSP);
            }
        } else if (src === 'grossCost') {
            const newNet = round2(grossCost / (1 + ivaRate / 100));
            const newSP = round2(grossCost * (1 + margin / 100));
            if (newNet !== netCost || newSP !== sellingPrice) {
                setNetCost(newNet);
                setSellingPrice(newSP);
            }
        } else if (src === 'margin') {
            const newSP = round2(grossCost * (1 + margin / 100));
            if (newSP !== sellingPrice) setSellingPrice(newSP);
        } else if (src === 'sellingPrice') {
            if (grossCost > 0) {
                const newMargin = round2(((sellingPrice / grossCost) - 1) * 100);
                // Clamp margin to avoid crazy values
                const safeMargin = Math.max(0, Math.min(newMargin, 999));
                if (safeMargin !== margin) setMargin(safeMargin);
            }
        }
    }, [netCost, ivaRate, grossCost, margin, sellingPrice, linked]);

    // Keep a stable ref to the onChange callback
    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

    // ── Notify Parent ───────────────────────────────────────────
    useEffect(() => {
        onChangeRef.current?.({ cost: grossCost, margin, sellingPrice });
    }, [grossCost, margin, sellingPrice]);

    // ── Handlers ────────────────────────────────────────────────
    const handleNetCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        sourceRef.current = 'netCost';
        setNetCost(Number(e.target.value) || 0);
    };

    const handleIvaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        sourceRef.current = 'ivaRate';
        setIvaRate(Number(e.target.value) || 0);
    };

    const handleGrossCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        sourceRef.current = 'grossCost';
        setGrossCost(Number(e.target.value) || 0);
    };

    const handleMarginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        sourceRef.current = 'margin';
        setMargin(Number(e.target.value) || 0);
    };

    const handleSellingPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        sourceRef.current = 'sellingPrice';
        setSellingPrice(Number(e.target.value) || 0);
    };

    const profit = round2(sellingPrice - grossCost);

    return (
        <div className="space-y-4">
            {/* Row 1: Net Cost + IVA % */}
            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5 font-medium">
                    <Label htmlFor="calc-net-cost" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Costo sin IVA
                    </Label>
                    <Input
                        id="calc-net-cost"
                        type="number"
                        min={0}
                        step={0.01}
                        value={netCost}
                        onChange={handleNetCostChange}
                        className="h-9 text-sm tabular-nums bg-slate-50 dark:bg-slate-900 border-dashed"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="calc-iva" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        IVA %
                    </Label>
                    <Input
                        id="calc-iva"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={ivaRate}
                        onChange={handleIvaChange}
                        className="h-9 text-sm tabular-nums bg-slate-50 dark:bg-slate-900 border-dashed"
                    />
                </div>
            </div>

            {/* Row 2: Gross Cost + Margin + Link toggle */}
            <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
                    <Label htmlFor="calc-cost" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Costo con IVA (Total)
                    </Label>
                    <Input
                        id="calc-cost"
                        type="number"
                        min={0}
                        step={0.01}
                        value={grossCost}
                        onChange={handleGrossCostChange}
                        readOnly={readOnlyCost}
                        className="h-9 text-sm tabular-nums font-medium"
                    />
                </div>

                <div className="flex flex-col gap-1.5 w-20">
                    <Label htmlFor="calc-margin" className="text-xs text-muted-foreground">
                        Margen %
                    </Label>
                    <Input
                        id="calc-margin"
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        value={margin}
                        onChange={handleMarginChange}
                        className="h-9 text-sm tabular-nums"
                    />
                </div>

                <button
                    type="button"
                    onClick={() => setLinked(prev => !prev)}
                    className={`mb-0.5 p-2 rounded-md border transition-all duration-200 ${linked
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                        }`}
                >
                    {linked ? <Link2 className="h-4 w-4" /> : <Unlink2 className="h-4 w-4" />}
                </button>
            </div>

            {/* Row 3: Selling Price + Profit indicator */}
            <div className="flex flex-wrap items-end gap-3">
                {/* Selling Price */}
                <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
                    <Label htmlFor="calc-price" className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        Precio de Venta Sugerido
                    </Label>
                    <Input
                        id="calc-price"
                        type="number"
                        min={0}
                        step={0.01}
                        value={sellingPrice}
                        onChange={handleSellingPriceChange}
                        className="h-9 text-sm tabular-nums font-semibold border-indigo-200 dark:border-indigo-800 focus-visible:ring-indigo-500"
                    />
                </div>

                {/* Profit display */}
                <div className="flex flex-col gap-1.5 min-w-[90px]">
                    <Label className="text-xs text-muted-foreground">Utilidad</Label>
                    <div className={`h-9 px-3 flex items-center rounded-md border text-sm font-semibold tabular-nums ${profit > 0
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                        : profit < 0
                            ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}>
                        {profit >= 0 ? '+' : ''}{profit.toFixed(2)}
                    </div>
                </div>
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                <div className={`w-1.5 h-1.5 rounded-full ${linked ? 'bg-indigo-500 animate-pulse' : 'bg-slate-400'}`} />
                {linked ? 'Campos vinculados — se auto-calculan' : 'Campos desvinculados — edición libre'}
            </div>
        </div>
    );
}
