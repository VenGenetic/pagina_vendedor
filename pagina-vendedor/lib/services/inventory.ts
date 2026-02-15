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
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Insert product directly (mapping correct column names)
    // omit target_margin as it's not in the schema
    const { data: stringData, error: productError } = await supabase
      .from('products')
      .insert({
        sku: product.sku,
        name: product.name,
        category: product.category,
        cost_price: product.cost_price,
        selling_price: product.selling_price,
        target_margin: product.target_margin,
        current_stock: 0, // Initialize at 0, adjust with movement
        min_stock_level: 5, // Map min_stock -> min_stock_level (default 5)
        max_stock_level: 50, // Map max_stock -> max_stock_level (default 50)
        image_url: product.image_url,
        description: product.description,
        brand: product.brand
      })
      .select()
      .single();

    if (productError) throw productError;

    const newProduct = stringData; // Supabase returns generic data type

    // 2. Handle Initial Stock (if > 0)
    if (product.current_stock > 0 && newProduct) {
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: newProduct.id,
          type: 'IN',
          quantity_change: product.current_stock,
          unit_price: product.cost_price,
          total_value: product.current_stock * product.cost_price,
          reason: 'COUNT_ADJUSTMENT',
          notes: 'Inventario Inicial',
          created_by: user?.id
        });

      if (movementError) {
        // Log error but don't fail the whole request since product is created
        console.error('Error creating initial stock movement:', movementError);
        // You might want to notify the user or try to rollback (delete product)
      }
    }

    return newProduct;
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
    // Exclude stock from direct metadata updates to prevent RLS/trigger issues
    const { current_stock, ...metadata } = product as any;

    const { data, error } = await (supabase as any)
      .from('products')
      .update(metadata)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('InventoryService.updateProduct error:', error);
      throw error;
    }
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
  },

  async adjustStockAudit(productId: string, newQuantity: number, reason: string = 'SHRINKAGE', notes: string = 'Ajuste manual') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No authenticated user");

    const { data, error } = await (supabase as any).rpc('process_stock_adjustment', {
      p_product_id: productId,
      p_target_quantity: newQuantity,
      p_user_id: user.id,
      p_reason: reason,
      p_notes: notes
    });

    if (error) throw error;
    return data;
  },

  async resetAllNegativeStock() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No authenticated user");

    const { data, error } = await (supabase as any).rpc('reset_negative_stock_v2', {
      p_user_id: user.id
    });

    if (error) throw error;
    return data;
  },

  async importProduct(product: ProductoInsertar, initialStock: number) {
    // 1. Upsert product details (EXCLUDING current_stock to avoid direct update)
    const { current_stock, ...productData } = product;

    // Explicitly upsert based on SKU
    const { data: upsertedProduct, error: upsertError } = await (supabase as any)
      .from('products')
      .upsert(productData, { onConflict: 'sku' })
      .select()
      .single();

    if (upsertError) throw upsertError;

    // 2. If initialStock > 0, create movement (Ledger-First)
    if (initialStock > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: movementError } = await (supabase as any)
        .from('inventory_movements')
        .insert({
          product_id: upsertedProduct.id,
          type: 'IN',
          quantity_change: initialStock,
          unit_price: product.cost_price || 0,
          total_value: initialStock * (product.cost_price || 0), // Ensure total_value is set
          reason: 'COUNT_ADJUSTMENT',
          notes: 'Importación Masiva (CSV)',
          created_by: user?.id
        });

      if (movementError) {
        // Optional: revert product creation? 
        // For now, allow product to exist but throw error so UI knows stock failed
        console.error("Failed to create initial stock movement", movementError);
        throw movementError;
      }
    }

    return upsertedProduct;
  },


};
