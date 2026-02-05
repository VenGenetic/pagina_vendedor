import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
    SETTINGS_KEYS,
    DEFAULT_SETTINGS,
    SettingsKey,
    businessProfileSchema,
    financialConfigSchema,
    inventoryPrefsSchema
} from '@/lib/validators/settings';
import { z } from 'zod';

export interface SystemSetting<T> {
    key: SettingsKey;
    value: T;
    version: number;
    updated_at: string;
}

// Helper to validate and parse
function parseSetting<T>(key: SettingsKey, value: any): T {
    try {
        if (key === SETTINGS_KEYS.BUSINESS) return businessProfileSchema.parse(value) as unknown as T;
        if (key === SETTINGS_KEYS.FINANCE) return financialConfigSchema.parse(value) as unknown as T;
        if (key === SETTINGS_KEYS.INVENTORY) return inventoryPrefsSchema.parse(value) as unknown as T;
        return value;
    } catch (error) {
        console.error(`Error valdiating setting ${key}:`, error);
        // Return default if validation fails
        return DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] as unknown as T;
    }
}

export function useSettings<T>(key: SettingsKey) {
    const queryClient = useQueryClient();

    // 1. Fetch Query
    const query = useQuery({
        queryKey: ['settings', key],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('system_settings')
                .select('*')
                .eq('key', key)
                .maybeSingle(); // Use maybeSingle to avoid 406 if not found

            if (error) throw error;

            // If not found in DB, return default wrapper
            if (!data) {
                return {
                    key,
                    value: DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] as unknown as T,
                    version: 1,
                    updated_at: new Date().toISOString()
                }
            }

            // Parse JSONB value with Zod
            const parsedValue = parseSetting<T>(key, (data as any).value);

            return {
                ...(data as any),
                value: parsedValue
            } as SystemSetting<T>;
        },
        staleTime: Infinity, // Rely on Realtime for updates
    });

    // 2. Realtime Subscription
    useEffect(() => {
        const channel = supabase
            .channel(`settings-${key}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'system_settings',
                    filter: `key=eq.${key}`,
                },
                (payload: RealtimePostgresChangesPayload<any>) => {
                    console.log(`Realtime update received for ${key}:`, payload);
                    // Invalidate cache to refetch latest version & value
                    queryClient.invalidateQueries({ queryKey: ['settings', key] });
                    toast.info('Configuración actualizada externamente');
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [key, queryClient]);

    // 3. Mutation (Optimistic Update via RPC)
    const mutation = useMutation({
        mutationFn: async (newValue: T) => {
            const currentVersion = query.data?.version || 0;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuario no autenticado');

            const { data, error } = await supabase.rpc('update_system_setting', {
                p_key: key,
                p_new_value: newValue,
                p_expected_version: currentVersion,
                p_user_id: user.id
            } as any);

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings', key] });
            toast.success('Configuración guardada correctamente');
        },
        onError: (error: any) => {
            if (error.message?.includes('Concurrency Error')) {
                toast.error('Los datos han cambiado. Recargando...', { description: 'Por favor intenta de nuevo.' });
                queryClient.invalidateQueries({ queryKey: ['settings', key] });
            } else {
                toast.error('Error al guardar configuración');
                console.error(error);
            }
        }
    });

    return {
        settings: query.data?.value ?? (DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] as unknown as T),
        meta: query.data,
        isLoading: query.isLoading,
        update: mutation.mutate,
        isUpdating: mutation.isPending
    };
}
