import { supabase } from '@/lib/supabase/client';

export interface PriceProposal {
    id: string;
    product_id: string;
    product_name?: string; // We might need to join or fetch this
    current_cost: number;
    current_stock: number;
    new_quantity: number;
    new_unit_cost: number;
    proposed_cost: number;
    proposed_price: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED';
    created_at: string;
    products?: {
        name: string;
        sku: string;
        image_url: string | null;
        needs_price_review?: boolean;
    };
}

export interface ValuationSummary {
    current_total_value: number;
    potential_total_value: number;
    value_diff: number;
    count: number;
}

export async function getPendingProposals() {
    const { data, error } = await supabase
        .from('price_proposals')
        .select(`
      *,
      products (
        name,
        sku,
        image_url,
        needs_price_review
      )
    `)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data as PriceProposal[];
}

export async function getPotentialValuation() {
    const { data, error } = await supabase
        .from('view_potential_inventory_valuation')
        .select('*');

    if (error) throw error;

    // Aggregate locally for valid summary
    const summary: ValuationSummary = (data || []).reduce((acc, item: any) => ({
        current_total_value: acc.current_total_value + (Number(item.current_total_value) || 0),
        potential_total_value: acc.potential_total_value + (Number(item.potential_total_value) || 0),
        value_diff: acc.value_diff + (Number(item.value_diff) || 0),
        count: acc.count + 1
    }), { current_total_value: 0, potential_total_value: 0, value_diff: 0, count: 0 });

    return summary;
}

export async function approveProposal(proposalId: string, finalPrice?: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not found');

    const { data, error } = await supabase.rpc('approve_price_proposal', {
        p_proposal_id: proposalId,
        p_user_id: user.id,
        p_final_price: finalPrice || null
    } as any);

    if (error) throw error;
    return data;
}

export async function rejectProposal(proposalId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not found');

    const { data, error } = await supabase.rpc('reject_price_proposal', {
        p_proposal_id: proposalId,
        p_user_id: user.id
    } as any);

    if (error) throw error;
    return data;
}
