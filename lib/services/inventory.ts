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
    // BPMN: Product_Creation with Equity/Opening Balance
    const { data, error } = await supabase.rpc('create_product_v2', {
      p_sku: product.sku,
      p_name: product.name,
      p_category: product.category,
      p_cost_price: product.cost_price,
      p_selling_price: product.selling_price,
      p_current_stock: product.current_stock,
      p_min_stock: product.min_stock_level,
      p_max_stock: product.max_stock_level,
      p_target_margin: product.target_margin,
      // p_user_id handling - we might need to fetch it or pass it. 
      // For now, let the RPC handle null if allowed or fetch current user here.
      // But inventoryService is often used in client components where we auth.
      p_image_url: product.image_url,
      p_description: product.description,
      p_brand: product.brand
    } as any);

    if (error) throw error;
    return data;
  },

  async createProducts(products: ProductoInsertar[]) {
    // Legacy upsert - keeping for reference, but prefer metadata alignment for batch
    const { data, error } = await (supabase as any)
      .from('products')
      .upsert(products, { onConflict: 'sku' })
      .select();

    if (error) throw error;
    return data;
  },

  async updateProductMetadata(products: any[]) {
    const { data, error } = await (supabase as any).rpc('process_metadata_alignment', {
      p_products: products,
      p_user_id: (await supabase.auth.getUser()).data.user?.id
    });

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
