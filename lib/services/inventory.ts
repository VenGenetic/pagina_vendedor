import { supabase } from '@/lib/supabase/client';
import { ProductoInsertar, ProductoActualizar } from '@/types';

export const inventoryService = {
  async getProducts(search?: string, onlyInStock: boolean = false) {
    let query = supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (onlyInStock) {
      query = query.gt('current_stock', 0);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getProductById(id: string) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async createProduct(product: ProductoInsertar) {
    const { data, error } = await (supabase as any)
      .from('products')
      .insert(product)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async createProducts(products: ProductoInsertar[]) {
    const { data, error } = await (supabase as any)
      .from('products')
      .upsert(products, { onConflict: 'sku' })
      .select();

    if (error) throw error;
    return data;
  },

  async updateProduct(id: string, product: ProductoActualizar) {
    const { data, error } = await (supabase as any)
      .from('products')
      .update(product)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteProduct(id: string) {
    // Soft delete
    const { error } = await (supabase as any)
      .from('products')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;
    return true;
  },

  async updateStock(id: string, newStock: number) {
    const { data, error } = await (supabase as any)
      .from('products')
      .update({ current_stock: newStock })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
