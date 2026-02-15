import { z } from 'zod';

// 1. Business Profile Schema
export const businessProfileSchema = z.object({
    name: z.string().min(1, 'El nombre del negocio es requerido'),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    website: z.string().url().optional().or(z.literal('')),
    tax_id: z.string().optional(), // RUC
});

// 2. Financial Config Schema
export const financialConfigSchema = z.object({
    tax_rate: z.number().min(0).max(1), // e.g. 0.15 for 15%
    currency: z.string().min(1), // e.g. "USD"
    currency_symbol: z.string().min(1), // e.g. "$"
    tax_enabled: z.boolean().default(true),
});

// 3. Inventory Preferences Schema
export const inventoryPrefsSchema = z.object({
    low_stock_threshold: z.number().min(0),
    allow_stock_negative: z.boolean().default(false), // Block sales without stock
});

// Types inferred from Zod
export type BusinessProfile = z.infer<typeof businessProfileSchema>;
export type FinancialConfig = z.infer<typeof financialConfigSchema>;
export type InventoryPrefs = z.infer<typeof inventoryPrefsSchema>;

// Global Settings Map
export const SETTINGS_KEYS = {
    BUSINESS: 'business_profile',
    FINANCE: 'financial_config',
    INVENTORY: 'inventory_prefs',
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

// Default Values (Safe Fallbacks)
export const DEFAULT_SETTINGS: {
    [SETTINGS_KEYS.BUSINESS]: BusinessProfile;
    [SETTINGS_KEYS.FINANCE]: FinancialConfig;
    [SETTINGS_KEYS.INVENTORY]: InventoryPrefs;
} = {
    [SETTINGS_KEYS.BUSINESS]: {
        name: 'Mi Negocio',
        address: '',
        phone: '',
        email: '',
        website: '',
        tax_id: '',
    },
    [SETTINGS_KEYS.FINANCE]: {
        tax_rate: 0.15, // 15% Default
        currency: 'USD',
        currency_symbol: '$',
        tax_enabled: true,
    },
    [SETTINGS_KEYS.INVENTORY]: {
        low_stock_threshold: 5,
        allow_stock_negative: false,
    },
};
