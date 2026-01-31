'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2, Archive, RefreshCcw, Loader2, AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
 * ResetSection Component
 * Handles the 3 tiers of system reset:
 * Tier 1: Transaction Reset (Preserves Stock)
 * Tier 2: Inventory Reset (Wipes Stock)
 * Tier 3: Hard Reset (Factory Reset)
 */
export function ResetSection() {
    const [isLoading, setIsLoading] = useState<string | null>(null); // 'tier1' | 'tier2' | 'tier3' | null
    // const supabase = createClientComponentClient(); <-- REPLACED WITH SINGLETON IMPORT


    const handleReset = async (tier: 'tier1' | 'tier2' | 'tier3') => {
        setIsLoading(tier);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No authenticated user');

            const formattedDate = new Date().toLocaleString();

            let rpcName = '';
            switch (tier) {
                case 'tier1': rpcName = 'reset_tier_1_transactions'; break;
                case 'tier2': rpcName = 'reset_tier_2_inventory'; break;
                case 'tier3': rpcName = 'reset_tier_3_hard'; break;
            }

            const { data, error } = await (supabase as any).rpc(rpcName, {
                p_user_id: user.id,
                p_formatted_date: formattedDate
            });

            if (error) throw error;

            toast.success('Reset completado exitosamente');

            // Optional: Force reload to reflect changes (e.g., cleared cache)
            window.location.reload();

        } catch (error: any) {
            console.error('Reset Error:', error);
            toast.error('Error al ejecutar el reset: ' + error.message);
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
                        <h3 className="font-semibold text-red-700 dark:text-red-400">Zona de Peligro</h3>
                        <p className="text-xs text-red-500/80 font-normal">Reinicios de Sistema y Datos</p>
                    </div>
                </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 space-y-4 pt-2">

                {/* TIER 1: TRANSACTION RESET */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md text-blue-600">
                                <RefreshCcw className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-slate-800 dark:text-slate-100">Limpieza de Transacciones</h4>
                                <p className="text-xs text-slate-500">Mantiene Productos y Stock</p>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                        Elimina todas las ventas y movimientos financieros. El stock físico se conserva como "Ajuste Inicial".
                    </p>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" className="w-full border-blue-200 hover:bg-blue-50 text-blue-700 dark:border-blue-800 dark:hover:bg-blue-900/20 dark:text-blue-400">
                                {isLoading === 'tier1' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Ejecutar Tier 1'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-red-600 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    ¿Estás absolutamente seguro?
                                </AlertDialogTitle>
                                <AlertDialogDescription className="space-y-2">
                                    <p className="font-bold text-slate-900 dark:text-slate-100">
                                        Acción: Limpieza de Transacciones (Tier 1)
                                    </p>
                                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-md border border-red-100 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
                                        Atención: Se borrará el historial de deudas de John y pagos a proveedores.
                                        El stock físico se mantiene intacto, pero aparecerá como "Ajuste de Inventario" en los reportes (valor $0.00).
                                    </div>
                                    <p>Esta acción no se puede deshacer.</p>
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => handleReset('tier1')}
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                    Sí, eliminar transacciones
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>

                {/* TIER 2: INVENTORY RESET */}
                <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-md text-amber-600">
                                <Archive className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-slate-800 dark:text-slate-100">Reinicio de Inventario</h4>
                                <p className="text-xs text-slate-500">Stock a Cero + Limpieza Ventas</p>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                        Ideal para comenzar un nuevo inventario. Elimina ventas y pone todo el stock en 0.
                    </p>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" className="w-full border-amber-200 hover:bg-amber-50 text-amber-700 dark:border-amber-800 dark:hover:bg-amber-900/20 dark:text-amber-400">
                                {isLoading === 'tier2' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Ejecutar Tier 2'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-red-600 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    Advertencia de Seguridad
                                </AlertDialogTitle>
                                <AlertDialogDescription className="space-y-2">
                                    <p className="font-bold text-slate-900 dark:text-slate-100">
                                        Acción: Reinicio de Inventario (Tier 2)
                                    </p>
                                    <p>
                                        Se eliminarán <strong>TODAS las ventas, historiales y movimientos</strong>.
                                        Además, el <strong>STOCK de todos los productos será 0</strong>.
                                    </p>
                                    <p>Esta acción no se puede deshacer.</p>
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => handleReset('tier2')}
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                    Sí, reiniciar inventario
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>

                {/* TIER 3: HARD RESET */}
                <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-100 dark:border-red-900/40">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-red-200 dark:bg-red-900/50 rounded-md text-red-700">
                                <AlertOctagon className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-red-800 dark:text-red-200">Reinicio Total (Fábrica)</h4>
                                <p className="text-xs text-red-600/80 dark:text-red-400">Elimina TODO</p>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-300 mb-4">
                        Borra cuentas, ventas, productos, clientes y deja el sistema como recién instalado.
                    </p>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="w-full bg-red-600 hover:bg-red-700 text-white">
                                {isLoading === 'tier3' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Ejecutar Tier 3'}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="border-red-500 border-2">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-red-600 font-bold uppercase flex items-center gap-2">
                                    <AlertOctagon className="w-6 h-6" />
                                    Peligro: Reset de Fábrica
                                </AlertDialogTitle>
                                <AlertDialogDescription className="space-y-4">
                                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                        ¿Estás seguro de que quieres eliminar TODO?
                                    </p>
                                    <ul className="list-disc pl-5 space-y-1 text-red-700 dark:text-red-300 text-sm font-medium">
                                        <li>Se eliminarán todas las ventas y reportes.</li>
                                        <li>Se reiniciarán todas las cuentas de caja y banco.</li>
                                        <li>El stock de todos los productos será 0.</li>
                                        <li>Se perderá toda la configuración personalizada.</li>
                                    </ul>
                                    <p className="text-xs uppercase font-bold text-red-500">
                                        Esta acción es irreversible y permanente.
                                    </p>
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>¡NO, SALVARME!</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => handleReset('tier3')}
                                    className="bg-red-700 hover:bg-red-800 text-white font-bold"
                                >
                                    SI, BORRAR TODO
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>

            </AccordionContent>
        </AccordionItem>
    );
}
