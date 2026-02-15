'use client';

import { useSettings } from '@/hooks/use-settings';
import { SETTINGS_KEYS, BusinessProfile, FinancialConfig, InventoryPrefs } from '@/lib/validators/settings';
import { ResetSection } from './reset-section';

import { Loader2, Store, DollarSign, Package, Save, CheckCircle2, AlertTriangle, ShieldCheck, LogOut, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cerrarSesionAdmin } from '@/lib/supabase/auth';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
    // Fetch all settings
    const business = useSettings<BusinessProfile>(SETTINGS_KEYS.BUSINESS);
    const finance = useSettings<FinancialConfig>(SETTINGS_KEYS.FINANCE);
    const inventory = useSettings<InventoryPrefs>(SETTINGS_KEYS.INVENTORY);

    // Local state for forms
    const [formBusiness, setFormBusiness] = useState<BusinessProfile>(business.settings);
    const [formFinance, setFormFinance] = useState<FinancialConfig>(finance.settings);
    const [formInventory, setFormInventory] = useState<InventoryPrefs>(inventory.settings);
    const router = useRouter();

    const handleLogout = async () => {
        await cerrarSesionAdmin();
        router.push('/login');
    };

    // Sync local state when remote data changes (Realtime)
    useEffect(() => { setFormBusiness(business.settings) }, [business.settings]);
    useEffect(() => { setFormFinance(finance.settings) }, [finance.settings]);
    useEffect(() => { setFormInventory(inventory.settings) }, [inventory.settings]);

    const isLoading = business.isLoading || finance.isLoading || inventory.isLoading;

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen bg-slate-50 dark:bg-slate-950">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 px-4 py-4 shadow-sm flex items-center gap-3">
                <Button
                    onClick={() => router.back()}
                    variant="ghost"
                    size="icon"
                    className="-ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    Configuración
                </h1>
            </div>

            <div className="max-w-2xl mx-auto p-4 space-y-6">

                <Accordion type="single" collapsible className="space-y-4" defaultValue="business">

                    {/* 1. BUSINESS PROFILE */}
                    <AccordionItem value="business" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 shadow-sm">
                        <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600 dark:text-blue-400">
                                    <Store className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Perfil de Negocio</h3>
                                    <p className="text-xs text-slate-500 font-normal">Nombre, Logo e Información</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4 space-y-4 pt-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nombre del Negocio</label>
                                <Input
                                    value={formBusiness.name}
                                    onChange={(e) => setFormBusiness({ ...formBusiness, name: e.target.value })}
                                    className="bg-slate-50 dark:bg-slate-950"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Dirección</label>
                                <Input
                                    value={formBusiness.address || ''}
                                    onChange={(e) => setFormBusiness({ ...formBusiness, address: e.target.value })}
                                    className="bg-slate-50 dark:bg-slate-950"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">RUC / ID</label>
                                    <Input
                                        value={formBusiness.tax_id || ''}
                                        onChange={(e) => setFormBusiness({ ...formBusiness, tax_id: e.target.value })}
                                        className="bg-slate-50 dark:bg-slate-950"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Teléfono</label>
                                    <Input
                                        value={formBusiness.phone || ''}
                                        onChange={(e) => setFormBusiness({ ...formBusiness, phone: e.target.value })}
                                        className="bg-slate-50 dark:bg-slate-950"
                                    />
                                </div>
                            </div>

                            <Button
                                onClick={() => business.update(formBusiness)}
                                disabled={business.isUpdating}
                                className="w-full bg-blue-600 hover:bg-blue-700 mt-2"
                            >
                                {business.isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Guardar Perfil
                            </Button>
                        </AccordionContent>
                    </AccordionItem>

                    {/* 2. FINANCE & TAX */}
                    <AccordionItem value="finance" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 shadow-sm">
                        <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-lg text-emerald-600 dark:text-emerald-400">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Finanzas e Impuestos</h3>
                                    <p className="text-xs text-slate-500 font-normal">IVA, Moneda y Cálculos</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4 space-y-5 pt-2">
                            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800">
                                <div className="space-y-0.5">
                                    <label className="text-sm font-medium text-slate-900 dark:text-slate-100">Habilitar IVA</label>
                                    <p className="text-xs text-slate-500">Aplica impuestos a las ventas</p>
                                </div>
                                <Switch
                                    checked={formFinance.tax_enabled}
                                    onCheckedChange={(c) => setFormFinance({ ...formFinance, tax_enabled: c })}
                                />
                            </div>

                            {formFinance.tax_enabled && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tasa de IVA (0.00 - 1.00)</label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="1"
                                            value={formFinance.tax_rate}
                                            onChange={(e) => setFormFinance({ ...formFinance, tax_rate: parseFloat(e.target.value) })}
                                            className="pl-4 pr-12 bg-slate-50 dark:bg-slate-950 font-mono"
                                        />
                                        <div className="absolute right-3 top-2 text-sm text-slate-400 font-bold">
                                            {Math.round(formFinance.tax_rate * 100)}%
                                        </div>
                                    </div>
                                    <p className="text-xs text-amber-600 dark:text-amber-500 flex gap-1 items-center">
                                        <AlertTriangle className="w-3 h-3" />
                                        Cambiar esto actualizará el cálculo en todas las ventas nuevas.
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Moneda</label>
                                    <Input value={formFinance.currency} onChange={(e) => setFormFinance({ ...formFinance, currency: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Símbolo</label>
                                    <Input value={formFinance.currency_symbol} onChange={(e) => setFormFinance({ ...formFinance, currency_symbol: e.target.value })} />
                                </div>
                            </div>

                            <Button
                                onClick={() => finance.update(formFinance)}
                                disabled={finance.isUpdating}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 mt-2"
                            >
                                {finance.isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Guardar Finanzas
                            </Button>
                        </AccordionContent>
                    </AccordionItem>

                    {/* 3. INVENTORY & SYSTEM */}
                    <AccordionItem value="inventory" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 shadow-sm">
                        <AccordionTrigger className="hover:no-underline py-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-lg text-amber-600 dark:text-amber-400">
                                    <Package className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Inventario y Sistema</h3>
                                    <p className="text-xs text-slate-500 font-normal">Alertas y Bloqueos</p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4 space-y-5 pt-2">
                            <div className="flex items-start justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
                                <div className="space-y-0.5 pr-4">
                                    <label className="text-sm font-medium text-red-900 dark:text-red-200">Permitir Ventas sin Stock</label>
                                    <p className="text-xs text-red-700 dark:text-red-400">
                                        Si se activa, el stock podrá quedar en números negativos.
                                    </p>
                                </div>
                                <Switch
                                    checked={formInventory.allow_stock_negative}
                                    onCheckedChange={(c) => setFormInventory({ ...formInventory, allow_stock_negative: c })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Umbral de Alerta (Stock Bajo)</label>
                                <Input
                                    type="number"
                                    value={formInventory.low_stock_threshold}
                                    onChange={(e) => setFormInventory({ ...formInventory, low_stock_threshold: parseInt(e.target.value) })}
                                    className="bg-slate-50 dark:bg-slate-950"
                                />
                            </div>

                            {/* AUDIT LOG PREVIEW (Static Link for now) */}
                            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                                    <ShieldCheck className="w-4 h-4" />
                                    <span>Auditoría de Cambios activa</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">Version del sistema: {business.meta?.version || 1}</p>
                            </div>

                            <Button
                                onClick={() => inventory.update(formInventory)}
                                disabled={inventory.isUpdating}
                                className="w-full bg-amber-600 hover:bg-amber-700 mt-2"
                            >
                                {inventory.isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                Guardar Preferencias
                            </Button>
                        </AccordionContent>
                    </AccordionItem>

                    {/* 4. DANGER ZONE */}
                    <ResetSection />


                </Accordion>

            </div>

            <div className="max-w-2xl mx-auto px-4 pb-8">
                <Button
                    onClick={handleLogout}
                    variant="destructive"
                    className="w-full flex items-center justify-center gap-2 py-6 text-lg font-medium shadow-sm hover:translate-y-0.5 transition-all"
                >
                    <LogOut className="w-5 h-5" />
                    Cerrar Sesión
                </Button>
            </div>
        </div>
    );
}
