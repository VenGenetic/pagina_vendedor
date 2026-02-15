'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod'; // Ensure this is available, assuming standard shadcn setup
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea'
import { Cuenta } from '@/types';
import { useUpdateAccountWithAdjustment } from '@/hooks/use-queries';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const formSchema = z.object({
    name: z.string().min(1, 'El nombre es requerido'),
    balance: z.coerce.number(),
    reason: z.string().min(5, 'La justificación debe tener al menos 5 caracteres'),
});

type FormValues = z.infer<typeof formSchema>;

interface EditAccountDrawerProps {
    account: Cuenta;
    isOpen: boolean;
    onClose: () => void;
}

export function EditAccountDrawer({ account, isOpen, onClose }: EditAccountDrawerProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const updateAccount = useUpdateAccountWithAdjustment();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: account.name,
            balance: account.balance,
            reason: '',
        },
    });

    // Reset form when account changes or drawer opens
    useEffect(() => {
        if (isOpen) {
            form.reset({
                name: account.name,
                balance: account.balance,
                reason: '',
            });
        }
    }, [account, isOpen, form]);

    const onSubmit = async (data: FormValues) => {
        try {
            setIsSubmitting(true);
            await updateAccount.mutateAsync({
                accountId: account.id,
                name: data.name,
                balance: data.balance,
                reason: data.reason
            });

            toast.success('Cuenta actualizada correctamente');
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('Error al actualizar la cuenta');
        } finally {
            setIsSubmitting(false);
        }
    };

    const currentBalance = form.watch('balance');
    const isBalanceChanged = currentBalance !== account.balance;
    const delta = currentBalance - account.balance;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Editar Cuenta</DialogTitle>
                    <DialogDescription>
                        Modificar nombre o ajustar saldo inicial.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nombre de la Cuenta</Label>
                        <Input id="name" {...form.register('name')} />
                        {form.formState.errors.name && (
                            <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="balance">Saldo Actual (Ajuste)</Label>
                        <Input
                            id="balance"
                            type="number"
                            step="0.01"
                            {...form.register('balance')}
                        />
                        {isBalanceChanged && (
                            <div className="flex items-center gap-2 text-xs p-2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                <AlertCircle className="h-4 w-4" />
                                <span>
                                    Se generará un ajuste de: <strong>{delta > 0 ? '+' : ''}{delta.toFixed(2)}</strong>
                                </span>
                            </div>
                        )}
                        {form.formState.errors.balance && (
                            <p className="text-xs text-red-500">{form.formState.errors.balance.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="reason">Justificación del Ajuste <span className="text-red-500">*</span></Label>
                        <Textarea
                            id="reason"
                            placeholder="Ej: Corrección de saldo inicial..."
                            {...form.register('reason')}
                        />
                        {form.formState.errors.reason && (
                            <p className="text-xs text-red-500">{form.formState.errors.reason.message}</p>
                        )}
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
