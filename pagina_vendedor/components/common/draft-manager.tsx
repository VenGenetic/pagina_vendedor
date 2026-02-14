'use client';

import React from 'react';
import { Eraser, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useLocalDrafts, type DraftItem } from '@/hooks/use-local-drafts';

// ─── Props ───────────────────────────────────────────────────────
interface DraftManagerProps {
    /** Storage namespace — e.g. 'sales-form', 'product-form'. */
    namespace: string;
    /** Called when the user picks a draft to restore. */
    onLoad: (draft: DraftItem) => void;
    /** Called when the user wants to start a fresh draft. */
    onNew?: () => void;
}

// ─── Component ───────────────────────────────────────────────────
export function DraftManager({ namespace, onLoad, onNew }: DraftManagerProps) {
    const { drafts, draftCount, loadDrafts, deleteDraft, clearDrafts } = useLocalDrafts(namespace);
    const [open, setOpen] = React.useState(false);

    const handleOpen = (nextOpen: boolean) => {
        if (nextOpen) loadDrafts(); // refresh list
        setOpen(nextOpen);
    };

    const handleSelect = (draft: DraftItem) => {
        onLoad(draft);
        setOpen(false);
    };

    const handleNew = () => {
        if (onNew) onNew();
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className="relative"
                    aria-label="Borradores guardados"
                >
                    <Eraser className="h-4 w-4" />

                    {/* Badge — red circle with count */}
                    {draftCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                            {draftCount > 99 ? '99+' : draftCount}
                        </span>
                    )}
                </Button>
            </DialogTrigger>

            <DialogContent className="max-h-[70vh] sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Borradores Guardados</DialogTitle>
                    <DialogDescription>
                        Selecciona un borrador para restaurar o crea uno nuevo.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    <Button
                        variant="secondary"
                        className="w-full justify-start gap-2"
                        onClick={handleNew}
                    >
                        <Plus className="h-4 w-4" />
                        Nuevo Borrador
                    </Button>
                </div>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Historial</span>
                    </div>
                </div>

                {drafts.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        No hay borradores guardados.
                    </p>
                ) : (
                    <ul className="max-h-60 space-y-1 overflow-y-auto pr-1">
                        {drafts.map((draft) => (
                            <li
                                key={draft.id}
                                className="group flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
                            >
                                <button
                                    type="button"
                                    className="flex flex-1 flex-col items-start gap-0.5 text-left"
                                    onClick={() => handleSelect(draft)}
                                >
                                    <span className="font-medium">{draft.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {format(new Date(draft.timestamp), "d MMM yyyy, HH:mm", {
                                            locale: es,
                                        })}
                                    </span>
                                </button>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                    aria-label={`Eliminar ${draft.name}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteDraft(draft.id);
                                    }}
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}
