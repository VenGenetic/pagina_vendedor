'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ─── Types ───────────────────────────────────────────────────────
export interface DraftItem {
    id: string;
    name: string;
    timestamp: string; // ISO string
    data: any;         // serialised form state
}

// ─── Helpers ─────────────────────────────────────────────────────
function storageKey(namespace: string) {
    return `drafts:${namespace}`;
}

function generateId(): string {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readDrafts(namespace: string): DraftItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(storageKey(namespace));
        return raw ? (JSON.parse(raw) as DraftItem[]) : [];
    } catch {
        return [];
    }
}

function writeDrafts(namespace: string, drafts: DraftItem[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(storageKey(namespace), JSON.stringify(drafts));
    } catch (e) {
        console.warn('Failed to save draft', e);
    }
}

// ─── Hook ────────────────────────────────────────────────────────
export function useLocalDrafts(namespace: string) {
    const [drafts, setDrafts] = useState<DraftItem[]>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Hydrate once on mount (client-only)
    useEffect(() => {
        setDrafts(readDrafts(namespace));
    }, [namespace]);

    // Derived count — reactive
    const draftCount = drafts.length;

    /** Get the most recent draft without changing state */
    const getLatestDraft = useCallback(() => {
        const current = readDrafts(namespace);
        return current.length > 0 ? current[0] : null;
    }, [namespace]);

    /**
     * Debounced save — waits 1 000 ms after the last call before writing.
     * Each call resets the timer so rapid edits collapse into one write.
     */
    const saveDraft = useCallback(
        (data: any, name?: string, id?: string) => {
            if (timerRef.current) clearTimeout(timerRef.current);

            timerRef.current = setTimeout(() => {
                setDrafts((prev) => {
                    const existingIndex = id ? prev.findIndex((d) => d.id === id) : -1;
                    let updatedDrafts: DraftItem[];

                    if (existingIndex >= 0) {
                        // Update existing
                        const updatedDraft = {
                            ...prev[existingIndex],
                            data,
                            timestamp: new Date().toISOString(),
                            name: name ?? prev[existingIndex].name,
                        };
                        // Move to top
                        updatedDrafts = [updatedDraft, ...prev.filter((_, i) => i !== existingIndex)];
                    } else {
                        // Create new
                        const newDraft: DraftItem = {
                            id: id ?? generateId(),
                            name: name ?? `Borrador ${prev.length + 1}`,
                            timestamp: new Date().toISOString(),
                            data,
                        };
                        updatedDrafts = [newDraft, ...prev.slice(0, 9)];
                    }

                    writeDrafts(namespace, updatedDrafts);
                    return updatedDrafts;
                });
            }, 1_000);
        },
        [namespace],
    );

    /** Load all drafts for the current namespace (newest first). */
    const loadDrafts = useCallback((): DraftItem[] => {
        const loaded = readDrafts(namespace);
        setDrafts(loaded);
        return loaded;
    }, [namespace]);

    /** Remove a single draft by id. */
    const deleteDraft = useCallback(
        (id: string) => {
            const remaining = readDrafts(namespace).filter((d) => d.id !== id);
            writeDrafts(namespace, remaining);
            setDrafts(remaining);
        },
        [namespace],
    );

    /** Clear all drafts for this namespace */
    const clearDrafts = useCallback(() => {
        writeDrafts(namespace, []);
        setDrafts([]);
    }, [namespace]);

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return { drafts, draftCount, saveDraft, loadDrafts, deleteDraft, getLatestDraft, clearDrafts } as const;
}
