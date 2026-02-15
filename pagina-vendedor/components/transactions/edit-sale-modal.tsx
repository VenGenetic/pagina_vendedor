'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateSaleDetails } from '@/hooks/use-queries';
import { Loader2 } from 'lucide-react';

interface EditSaleModalProps {
    isOpen: boolean;
    onClose: () => void;
    sale: {
        id: string;
        sale_number: string;
        customer_name?: string;
        customer_document?: string; // CI/RUC
        customer_phone?: string;
        customer_email?: string;
        customer_city?: string;
        customer_address?: string;
    } | null;
}

export function EditSaleModal({ isOpen, onClose, sale }: EditSaleModalProps) {
    const updateMutation = useUpdateSaleDetails();

    const [name, setName] = useState('');
    const [doc, setDoc] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [city, setCity] = useState('');
    const [address, setAddress] = useState('');

    // Reset form
    useEffect(() => {
        if (sale) {
            setName(sale.customer_name || '');
            setDoc(sale.customer_document || '');
            setPhone(sale.customer_phone || '');
            setEmail(sale.customer_email || '');
            setCity(sale.customer_city || '');
            setAddress(sale.customer_address || '');
        }
    }, [sale]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sale) return;

        await updateMutation.mutateAsync({
            saleId: sale.id,
            customer_name: name,
            customer_document: doc,
            customer_phone: phone,
            customer_email: email,
            customer_city: city,
            customer_address: address
        });

        onClose();
    };

    if (!sale) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Editar Detalles de Venta #{sale.sale_number}</DialogTitle>
                    <DialogDescription>
                        Modifica la información del cliente. Los productos y montos no son editables.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="customerName">Nombre del Cliente</Label>
                        <Input
                            id="customerName"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="doc">CI / RUC</Label>
                            <Input
                                id="doc"
                                value={doc}
                                onChange={(e) => setDoc(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Teléfono</Label>
                            <Input
                                id="phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="city">Ciudad</Label>
                            <Input
                                id="city"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address">Dirección</Label>
                        <Input
                            id="address"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
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
