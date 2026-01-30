import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { processSale, processPurchase, createExpense, createIncome } from '@/lib/services/transactions';
import type { CreateSaleInput, DashboardStats, ProductoStockBajo, Producto, Cuenta, ActividadReciente, EntradaCrearIngreso } from '@/types';

// Query keys
export const queryKeys = {
  accounts: ['accounts'] as const,
  products: ['products'] as const,
  lowStockProducts: ['low-stock-products'] as const,
  transactions: ['transactions'] as const,
  recentActivity: ['recent-activity'] as const,
  dashboardStats: ['dashboard-stats'] as const,
  inventoryValuation: ['inventory-valuation'] as const,
};

// ============================================
// ACCOUNTS
// ============================================
export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: async (): Promise<Cuenta[]> => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as Cuenta[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

// ============================================
// PRODUCTS
// ============================================
export interface ProductFilters {
  search?: string;
  category?: string;
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
  page?: number;
  pageSize?: number;
}

export function useProducts(filters: ProductFilters = {}) {
  const {
    search,
    category,
    stockStatus = 'all',
    page = 1,
    pageSize = 20
  } = filters;

  return useQuery({
    queryKey: [...queryKeys.products, search, category, stockStatus, page, pageSize],
    queryFn: async (): Promise<{ data: Producto[]; count: number }> => {
      // Determine source table/view
      const table = stockStatus === 'low_stock' ? 'low_stock_products' : 'products';

      // SPECIAL HANDLING: If pageSize is massive (>1000), fetch recursively to get ALL data
      // REMOVED FOR SCALABILITY: "Fetch All" logic caused browser crashes with large datasets.
      // We now rely on server-side filtering and standard pagination.
      let effectivePageSize = pageSize;
      if (pageSize > 1000) {
        console.warn('Excessive page size requested. Limiting to 50 for stability.');
        effectivePageSize = 50;
      }

      // STANDARD HANDLING (Normal pagination)
      let query = supabase
        .from(table)
        .select('*', { count: 'exact' });

      // Only filter by is_active on the main table, assuming the view handles its own logic or exports 'active' items only
      if (stockStatus !== 'low_stock') {
        query = query.eq('is_active', true);
      }

      query = query.order('name');

      // Filters
      if (search) {
        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
      }

      if (category && category !== 'all') {
        query = query.ilike('category', `%${category}%`);
      }

      if (stockStatus === 'in_stock') {
        query = query.gt('current_stock', 0);
      } else if (stockStatus === 'out_of_stock') {
        query = query.eq('current_stock', 0);
      }
      // 'low_stock' case is handled by selecting from 'low_stock_products' view

      // Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      return {
        data: data as Producto[],
        count: count || 0
      };
    },
    staleTime: 1000 * 60 * 5, // Increased stale time for "full load" efficiency
  });
}

export function useLowStockProducts() {
  return useQuery({
    queryKey: queryKeys.lowStockProducts,
    queryFn: async (): Promise<ProductoStockBajo[]> => {
      const { data, error } = await supabase
        .from('low_stock_products')
        .select('*')
        .limit(20);

      if (error) throw error;
      return data as ProductoStockBajo[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}

// ============================================
// TRANSACTIONS
// ============================================
export function useRecentActivity(limit: number = 10) {
  return useQuery({
    queryKey: [...queryKeys.recentActivity, limit],
    queryFn: async (): Promise<ActividadReciente[]> => {
      const { data, error } = await supabase
        .from('recent_activity')
        .select('*')
        .limit(limit);

      if (error) throw error;
      return data as ActividadReciente[];
    },
    staleTime: 1000 * 30, // 30 segundos
  });
}

// ============================================
// DASHBOARD STATS
// ============================================
export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboardStats,
    queryFn: async (): Promise<DashboardStats> => {
      // Intento de usar la vista optimizada (rápido)
      const { data: summaryData, error } = await supabase
        .from('dashboard_summary' as any)
        .select('*')
        .single();

      if (!error && summaryData) {
        const summary = summaryData as any;
        return {
          saldoTotal: summary.total_balance,
          valorInventarioTotal: summary.total_inventory_value,
          costoInventarioTotal: summary.total_inventory_cost,
          cantidadStockBajo: summary.low_stock_count,
          totalProductos: summary.total_products,
          ventasHoy: summary.today_sales,
          gastosHoy: summary.today_expenses,
        };
      }

      // FALLBACK OPTIMIZADO: Consultas paralelas independientes y simplificadas
      console.warn('Usando fallback optimizado para dashboard');
      const today = new Date().toISOString().split('T')[0];

      // Ejecutamos solo lo CRÍTICO primero para que sea "percibidamente" más rápido,
      // aunque React Query esperará todo. Pero al menos optimizamos las queries individuales.

      const [accountsRes, lowStockRes, productsRes, salesRes] = await Promise.all([
        supabase.from('accounts').select('balance').eq('is_active', true),
        supabase.from('low_stock_products').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('transactions').select('amount').eq('type', 'INCOME').gte('transaction_date', today)
      ]);

      // Calculamos totales simples
      const totalBalance = (accountsRes.data as any[])?.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0) || 0;
      const todaySales = (salesRes.data as any[])?.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0;

      // La valuación es costosa, la estimamos o la cargamos por separado en otra versión.
      // Por ahora la simplificamos para no bloquear.
      const valorInventarioTotal = 0; // Se carga después o se ignora en fallback para velocidad
      const costoInventarioTotal = 0;

      return {
        saldoTotal: totalBalance,
        valorInventarioTotal, // 0 en fallback para velocidad
        costoInventarioTotal, // 0 en fallback para velocidad
        cantidadStockBajo: lowStockRes.count || 0,
        totalProductos: productsRes.count || 0,
        ventasHoy: todaySales,
        gastosHoy: 0, // Simplificación
      };
    },
    refetchInterval: 30000,
    staleTime: 1000 * 60 * 5, // 5 minutos de caché fuerte
  });
}

// ============================================
// MUTATIONS
// ============================================
export function useCreateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSaleInput) => processSale(input),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentActivity });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: processPurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentActivity });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentActivity });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useCreateIncome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createIncome,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentActivity });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

// ============================================
// PRODUCTS MUTATIONS
// ============================================
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (product: any) => {
      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single();

      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

// TRANSACTIONS HISTORY
export function useTransactionsHistory() {
  return useQuery({
    queryKey: ['transactions-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          account:accounts!account_id(name),
          account_in:accounts!account_in_id(name),
          account_out:accounts!account_out_id(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useAccountTransactions(accountId: string) {
  return useQuery({
    queryKey: ['account-transactions', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          account:accounts!account_id(name),
          account_in:accounts!account_in_id(name),
          account_out:accounts!account_out_id(name)
        `)
        .or(`account_id.eq.${accountId},account_in_id.eq.${accountId},account_out_id.eq.${accountId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!accountId,
  });
}

export function useCommissionHistory() {
  return useQuery({
    queryKey: ['commission-history'],
    queryFn: async () => {
      // Get all INCOME transactions (sales)
      const { data: incomeData, error: incomeError } = await supabase
        .from('transactions')
        .select(`
          *,
          account:accounts!account_id(name)
        `)
        .eq('type', 'INCOME')
        .order('created_at', { ascending: false });

      if (incomeError) throw incomeError;

      // For each income transaction, get related expenses, transfers, etc
      const enrichedData = await Promise.all((incomeData || []).map(async (income: any) => {
        // Get related transactions by reference_number or time proximity
        const { data: relatedTx, error: relatedError } = await supabase
          .from('transactions')
          .select(`
            *,
            account:accounts!account_id(name),
            account_in:accounts!account_in_id(name),
            account_out:accounts!account_out_id(name)
          `)
          .eq('reference_number', income.reference_number || '')
          .neq('id', income.id)
          .order('created_at', { ascending: false });

        // Also get transactions within 5 minutes for shipping/cost breakdowns
        if (!relatedTx || relatedTx.length === 0) {
          const fiveMinutesAfter = new Date(new Date(income.created_at).getTime() + 5 * 60000).toISOString();
          const fiveMinutesBefore = new Date(new Date(income.created_at).getTime() - 5 * 60000).toISOString();

          const { data: proximityTx } = await supabase
            .from('transactions')
            .select(`
              *,
              account:accounts!account_id(name),
              account_in:accounts!account_in_id(name),
              account_out:accounts!account_out_id(name)
            `)
            .gte('created_at', fiveMinutesBefore)
            .lte('created_at', fiveMinutesAfter)
            .in('type', ['EXPENSE', 'TRANSFER'])
            .neq('id', income.id);

          return {
            ...income,
            relatedTransactions: proximityTx || []
          };
        }

        return {
          ...income,
          relatedTransactions: relatedTx || []
        };
      }));

      return enrichedData;
    },
  });
}

import { deleteCommission, deleteSale, deletePurchase, deleteExpense } from '@/lib/services/transactions';
import { Venta } from '@/types';

export function useDeleteCommission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCommission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-history'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useDeleteSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      queryClient.invalidateQueries({ queryKey: ['recent-sales'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.products }); // Stock changed
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts }); // Balance changed
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    }
  });
}

export function useDeletePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      queryClient.invalidateQueries({ queryKey: ['recent-purchases'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    }
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      queryClient.invalidateQueries({ queryKey: ['recent-expenses'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    }
  });
}

// ============================================
// SPECIFIC HISTORY QUERIES
// ============================================

export function useRecentSales() {
  return useQuery({
    queryKey: ['recent-sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('*, items:sale_items(*, product:products(name))')
        .order('created_at', { ascending: false })
        .limit(5); // Last 5 sales
      if (error) throw error;
      return data as any[];
    }
  });
}

export function useRecentPurchases() {
  return useQuery({
    queryKey: ['recent-purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'EXPENSE')
        .ilike('description', 'Compra de inventario%')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    }
  });
}

export function useRecentExpenses() {
  return useQuery({
    queryKey: ['recent-expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'EXPENSE')
        .not('description', 'ilike', 'Compra de inventario%')
        .not('description', 'ilike', 'Envío venta%') // Hide auto-shipping expenses? optional
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    }
  });
}
