'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateTransactionDetails } from '@/hooks/use-queries';
import { Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface EditTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: {
        id: string;
        description: string;
        notes?: string;
        reference_number?: string;
        amount: number;
        type?: string;
    } | null;
}

export function EditTransactionModal({ isOpen, onClose, transaction }: EditTransactionModalProps) {
    const updateMutation = useUpdateTransactionDetails();

    const [description, setDescription] = useState('');
    const [notes, setNotes] = useState('');
    const [reference, setReference] = useState('');

    // Reset form when transaction changes
    useEffect(() => {
        if (transaction) {
            setDescription(transaction.description || '');
            setNotes(transaction.notes || '');
            setReference(transaction.reference_number || '');
        }
    }, [transaction]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transaction) return;

        await updateMutation.mutateAsync({
            transactionId: transaction.id,
            description,
            notes,
            reference_number: reference
        });

        onClose();
    };

    if (!transaction) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Editar Detalles de Transacción</DialogTitle>
                    <DialogDescription>
                        Modifica la información descriptiva. El monto ({formatCurrency(transaction.amount)}) no se puede cambiar.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="description">Descripción</Label>
                        <Input
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="reference">Número de Referencia</Label>
                        <Input
                            id="reference"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="Opcional"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notas</Label>
                        <Textarea
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Detalles adicionales..."
                            rows={3}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" disabled={updateMutation.isPending}>
                            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
