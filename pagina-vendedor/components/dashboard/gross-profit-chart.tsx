'use client';

import React, { useState, useMemo } from 'react';
import { useGrossProfit } from '@/hooks/use-queries';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency, cn } from '@/lib/utils';
import { Calendar as CalendarIcon, Filter, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function GrossProfitChart() {
    const [range, setRange] = useState<{ from: Date; to: Date }>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });

    const { data: profitData, isLoading, isError } = useGrossProfit(range.from, range.to);

    const stats = useMemo(() => {
        if (!profitData) return { total: 0, avg: 0, growth: 0 };
        const total = profitData.reduce((sum, item) => sum + Number(item.gross_profit), 0);
        const avg = total / (profitData.length || 1);

        // Simple growth calculation compared to first half of range if possible
        const mid = Math.floor(profitData.length / 2);
        const firstHalf = profitData.slice(0, mid).reduce((sum, item) => sum + Number(item.gross_profit), 0);
        const secondHalf = profitData.slice(mid).reduce((sum, item) => sum + Number(item.gross_profit), 0);
        const growth = firstHalf === 0 ? 0 : ((secondHalf - firstHalf) / firstHalf) * 100;

        return { total, avg, growth };
    }, [profitData]);

    const chartData = useMemo(() => {
        if (!profitData) return [];
        return profitData.map(item => ({
            ...item,
            formattedDate: format(new Date(item.date + 'T12:00:00'), 'dd MMM', { locale: es }),
            fullDate: format(new Date(item.date + 'T12:00:00'), 'PP', { locale: es }),
        }));
    }, [profitData]);

    if (isError) {
        return (
            <Card className="w-full mt-6 border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
                <CardContent className="pt-6 text-center text-red-600 dark:text-red-400">
                    Error al cargar los datos de utilidad.
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full mt-6 overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
                <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-emerald-500" />
                        Utilidad Bruta Diaria
                    </CardTitle>
                    <CardDescription>
                        Ingresos - Costos de productos vendidos
                    </CardDescription>
                </div>
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                    <Button
                        variant={isSameDay(range.from, subDays(new Date(), 7)) ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setRange({ from: subDays(new Date(), 7), to: new Date() })}
                        className="h-8 text-xs"
                    >
                        7d
                    </Button>
                    <Button
                        variant={isSameDay(range.from, subDays(new Date(), 30)) ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setRange({ from: subDays(new Date(), 30), to: new Date() })}
                        className="h-8 text-xs"
                    >
                        30d
                    </Button>
                    <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1" />
                    <div className="flex items-center gap-1 px-2">
                        <input
                            type="date"
                            value={format(range.from, 'yyyy-MM-dd')}
                            onChange={(e) => setRange(prev => ({ ...prev, from: new Date(e.target.value + 'T12:00:00') }))}
                            className="bg-transparent border-none text-xs focus:ring-0 cursor-pointer dark:text-slate-300"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                            type="date"
                            value={format(range.to, 'yyyy-MM-dd')}
                            onChange={(e) => setRange(prev => ({ ...prev, to: new Date(e.target.value + 'T12:00:00') }))}
                            className="bg-transparent border-none text-xs focus:ring-0 cursor-pointer dark:text-slate-300"
                        />
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30">
                        <p className="text-[10px] items-center gap-1 uppercase font-bold text-emerald-600 dark:text-emerald-400 mb-1 flex">
                            Total Periodo
                        </p>
                        <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                            {formatCurrency(stats.total)}
                        </p>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30">
                        <p className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 mb-1">
                            Promedio Diario
                        </p>
                        <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                            {formatCurrency(stats.avg)}
                        </p>
                    </div>
                    <div className="hidden md:block p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">
                            Tendencia
                        </p>
                        <div className="flex items-center gap-2">
                            <p className={cn(
                                "text-xl font-bold",
                                stats.growth >= 0 ? "text-emerald-600" : "text-rose-600"
                            )}>
                                {stats.growth >= 0 ? '+' : ''}{stats.growth.toFixed(1)}%
                            </p>
                            {stats.growth >= 0 ? (
                                <TrendingUp className="h-4 w-4 text-emerald-600" />
                            ) : (
                                <TrendingDown className="h-4 w-4 text-rose-600" />
                            )}
                        </div>
                    </div>
                </div>

                <div className="h-[300px] w-full">
                    {isLoading ? (
                        <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="formattedDate"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    tickFormatter={(val) => `$${val}`}
                                />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg shadow-xl">
                                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{data.fullDate}</p>
                                                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                                        Utilidad: {formatCurrency(data.gross_profit)}
                                                    </p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="gross_profit"
                                    stroke="#10b981"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorProfit)"
                                    animationDuration={1500}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
