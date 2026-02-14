'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Archive, RefreshCcw, Loader2, AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';

/**
 * ResetSection Component (ADMIN ONLY)
 * Handles the 3 tiers of system reset with strict security checks.
 */
export function ResetSection() {
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [checkingRole, setCheckingRole] = useState(true);

    // Tier 2 Form State
    const [tier2Form, setTier2Form] = useState({
        pichincha: '425.18', // Default seed
        guayaquil: '421.45',
        efectivo: '57.64',
        caja_grande: '0.00'
    });

    // Check Role on Mount
    useEffect(() => {
        async function checkRole() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Check public.users role
                const { data: userData } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if ((userData as any)?.role === 'admin') {
                    setIsAdmin(true);
                }
            }
            setCheckingRole(false);
        }
        checkRole();
    }, []);

    if (checkingRole) return null; // Or skeleton
    if (!isAdmin) return null; // Hide completely for non-admins

    const handleTier2Change = (field: string, value: string) => {
        setTier2Form(prev => ({ ...prev, [field]: value }));
    };

    const handleReset = async (tier: 'tier1' | 'tier2' | 'tier3') => {
        setIsLoading(tier);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No authenticated user');

            const formattedDate = new Date().toLocaleString();

            let rpcName = '';
            let payload: any = {
                p_user_id: user.id,
                p_formatted_date: formattedDate
            };

            switch (tier) {
                case 'tier1':
                    rpcName = 'reset_tier_1_transactions';
                    break;
                case 'tier2':
                    rpcName = 'reset_tier_2_inventory';
                    payload = {
                        ...payload,
                        p_balance_pichincha: parseFloat(tier2Form.pichincha || '0'),
                        p_balance_guayaquil: parseFloat(tier2Form.guayaquil || '0'),
                        p_balance_efectivo: parseFloat(tier2Form.efectivo || '0'),
                        p_balance_caja_grande: parseFloat(tier2Form.caja_grande || '0')
                    };
                    break;
                case 'tier3':
                    rpcName = 'reset_tier_3_hard';
                    break;
            }

            const { error } = await (supabase as any).rpc(rpcName, payload);

            if (error) throw error;

            toast.success('Reset completado exitosamente');

            // Hard Reload to ensure cache is wiped and fresh data is fetched
            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } catch (error: any) {
            console.error('Reset Error:', error);
            toast.error('Error Crítico: ' + error.message);
        } finally {
            setIsLoading(null);
        }
    };

    return (
        <AccordionItem value="danger_zone" className="bg-red-50 dark:bg-red-950/10 rounded-xl border border-red-200 dark:border-red-900 px-4 shadow-sm mt-8">
            <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                    <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-lg text-red-600 dark:text-red-400">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                        <h3 className="font-semibold text-red-700 dark:text-red-400">Zona de Peligro (Admin)</h3>
                        <p className="text-xs text-red-500/80 font-normal">Reinicios y Limpieza de Sistema</p>
                    </div>
                </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 space-y-4 pt-2">

                {/* TIER 1: TRANSACTION RESET */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                        <RefreshCcw className="w-4 h-4 text-blue-600" />
                        <h4 className="font-semibold text-slate-800 dark:text-slate-100">Tier 1: Limpieza de Transacciones</h4>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                        Elimina ventas y movimientos. <strong>Stock vuelve a 0</strong>. Cuentas a 0.
                    </p>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" className="w-full text-blue-600 border-blue-200 hover:bg-blue-50">
                                {isLoading === 'tier1' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ejecutar Tier 1'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-red-600">¿Confirmar Limpieza de Ledger?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Se borrarán todas las ventas y movimientos. El inventario físico se pondrá en 0.
                                    Esta acción es irreversible.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleReset('tier1')} className="bg-red-600 text-white">
                                    Sí, Ejecutar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>

                {/* TIER 2: INVENTORY RESET (DYNAMIC) */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                        <Archive className="w-4 h-4 text-amber-600" />
                        <h4 className="font-semibold text-slate-800 dark:text-slate-100">Tier 2: Reinicio con Saldos</h4>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                        Igual que Tier 1, pero establece balances iniciales personalizados.
                    </p>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="space-y-1">
                            <Label className="text-xs">B. Pichincha</Label>
                            <Input
                                type="number"
                                value={tier2Form.pichincha}
                                onChange={(e) => handleTier2Change('pichincha', e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">B. Guayaquil</Label>
                            <Input
                                type="number"
                                value={tier2Form.guayaquil}
                                onChange={(e) => handleTier2Change('guayaquil', e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Efectivo</Label>
                            <Input
                                type="number"
                                value={tier2Form.efectivo}
                                onChange={(e) => handleTier2Change('efectivo', e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Caja Grande</Label>
                            <Input
                                type="number"
                                value={tier2Form.caja_grande}
                                onChange={(e) => handleTier2Change('caja_grande', e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" className="w-full text-amber-600 border-amber-200 hover:bg-amber-50">
                                {isLoading === 'tier2' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ejecutar Tier 2'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-red-600">Reinicio de Cuentas</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Se borrará todo el historial y se establecerán los saldos ingresados.
                                    Verifica que los montos sean correctos.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleReset('tier2')} className="bg-red-600 text-white">
                                    Sí, Resetear y Cargar Saldos
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>

                {/* TIER 3: HARD RESET */}
                <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-100 dark:border-red-900/40">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertOctagon className="w-4 h-4 text-red-600" />
                        <h4 className="font-semibold text-red-800 dark:text-red-200">Tier 3: Factory Reset</h4>
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-300 mb-4">
                        Borra TODO (Ventas, Prodcutos). Cuentas se mantienen en 0.
                    </p>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="w-full bg-red-600 hover:bg-red-700 text-white">
                                {isLoading === 'tier3' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ejecutar Tier 3'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="border-red-600 border-2">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-red-600 font-bold uppercase">
                                    PELIGRO: BORRADO TOTAL
                                </AlertDialogTitle>
                                <AlertDialogDescription className="font-bold text-slate-900 dark:text-slate-100">
                                    Esto eliminará todos los PRODUCTOS y CLIENTES.
                                    El sistema quedará vacío (solo cuentas en 0).
                                    ¿Estás absolutamente seguro?
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>CANCELAR IMPOSIBLE</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleReset('tier3')} className="bg-red-700 hover:bg-red-800 text-white font-bold">
                                    BORRAR TODO AHORA
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>

            </AccordionContent>
        </AccordionItem>
    );
}
