export type Database = {
  public: {
    Tables: {
      admins: {
        Row: {
          id: string;
          auth_id: string;
          email: string;
          full_name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_id: string;
          email: string;
          full_name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_id?: string;
          email?: string;
          full_name?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      accounts: {
        Row: {
          id: string;
          name: string;
          type: 'CASH' | 'BANK' | 'DIGITAL_WALLET' | 'ASSET' | 'INCOME' | 'EXPENSE';
          balance: number;
          currency: string;
          is_active: boolean;
          is_nominal: boolean; // Double-Entry
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: 'CASH' | 'BANK' | 'DIGITAL_WALLET' | 'ASSET' | 'INCOME' | 'EXPENSE';
          balance?: number;
          currency?: string;
          is_active?: boolean;
          is_nominal?: boolean; // Double-Entry
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: 'CASH' | 'BANK' | 'DIGITAL_WALLET' | 'ASSET' | 'INCOME' | 'EXPENSE';
          balance?: number;
          currency?: string;
          is_active?: boolean;
          is_nominal?: boolean; // Double-Entry
          created_at?: string;
          updated_at?: string;
        };
      };
      commission_rules: {
        Row: {
          id: string;
          user_id: string;
          percentage: number;
          start_date: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          percentage: number;
          start_date?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          percentage?: number;
          start_date?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      commission_ledger: {
        Row: {
          id: string;
          sale_id: string;
          user_id: string;
          profit_basis: number;
          commission_percentage: number;
          amount: number;
          status: 'PENDING' | 'PAID' | 'CANCELLED';
          created_at: string;
          paid_at: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          sale_id: string;
          user_id: string;
          profit_basis: number;
          commission_percentage: number;
          amount: number;
          status?: 'PENDING' | 'PAID' | 'CANCELLED';
          created_at?: string;
          paid_at?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          sale_id?: string;
          user_id?: string;
          profit_basis?: number;
          commission_percentage?: number;
          amount?: number;
          status?: 'PENDING' | 'PAID' | 'CANCELLED';
          created_at?: string;
          paid_at?: string | null;
          notes?: string | null;
        };
      };
      payment_methods: {
        Row: {
          slug: string;
          name: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          slug?: string;
          name?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          category: string | null;
          brand: string | null;
          cost_price: number;
          selling_price: number;
          target_margin: number | null;
          current_stock: number;

          image_url: string | null;
          additional_images: string[] | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          description?: string | null;
          category?: string | null;
          brand?: string | null;
          cost_price?: number;
          selling_price?: number;
          target_margin?: number | null;
          current_stock?: number;

          image_url?: string | null;
          additional_images?: string[] | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sku?: string;
          name?: string;
          description?: string | null;
          category?: string | null;
          brand?: string | null;
          cost_price?: number;
          selling_price?: number;
          target_margin?: number | null;
          current_stock?: number;

          image_url?: string | null;
          additional_images?: string[] | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          type: 'INCOME' | 'EXPENSE';
          amount: number;
          description: string;
          account_id: string;
          inventory_movement_id: string | null;
          payment_method: 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK' | 'OTHER' | null;
          reference_number: string | null;
          transaction_date: string;
          created_at: string;
          created_by?: string;
          created_by_name?: string;
          notes: string | null;
          group_id: string | null; // Double-Entry
          account_in_id: string | null;
          account_out_id: string | null;
          is_reversed: boolean;
        };
        Insert: {
          id?: string;
          type: 'INCOME' | 'EXPENSE';
          amount: number;
          description: string;
          account_id: string;
          inventory_movement_id?: string | null;
          payment_method?: 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK' | 'OTHER' | null;
          reference_number?: string | null;
          transaction_date?: string;
          created_at?: string;
          created_by?: string;
          created_by_name?: string;
          notes?: string | null;
          group_id?: string | null; // Double-Entry
          account_in_id?: string | null;
          account_out_id?: string | null;
          is_reversed?: boolean;
        };
        Update: {
          id?: string;
          type?: 'INCOME' | 'EXPENSE';
          amount?: number;
          description?: string;
          account_id?: string;
          inventory_movement_id?: string | null;
          payment_method?: 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK' | 'OTHER' | null;
          reference_number?: string | null;
          transaction_date?: string;
          created_at?: string;
          notes?: string | null;
          group_id?: string | null; // Double-Entry
          account_in_id?: string | null;
          account_out_id?: string | null;
          is_reversed?: boolean;
        };
      };
      inventory_movements: {
        Row: {
          id: string;
          product_id: string;
          type: 'IN' | 'OUT' | 'ADJUSTMENT';
          quantity_change: number;
          unit_price: number | null;
          total_value: number | null;
          transaction_id: string | null;
          reason: 'SALE' | 'PURCHASE' | 'RETURN' | 'DAMAGE' | 'THEFT' | 'COUNT_ADJUSTMENT' | 'OTHER' | null;
          notes: string | null;
          movement_date: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          type: 'IN' | 'OUT' | 'ADJUSTMENT';
          quantity_change: number;
          unit_price?: number | null;
          total_value?: number | null;
          transaction_id?: string | null;
          reason?: 'SALE' | 'PURCHASE' | 'RETURN' | 'DAMAGE' | 'THEFT' | 'COUNT_ADJUSTMENT' | 'OTHER' | null;
          notes?: string | null;
          movement_date?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          product_id?: string;
          type?: 'IN' | 'OUT' | 'ADJUSTMENT';
          quantity_change?: number;
          unit_price?: number | null;
          total_value?: number | null;
          transaction_id?: string | null;
          reason?: 'SALE' | 'PURCHASE' | 'RETURN' | 'DAMAGE' | 'THEFT' | 'COUNT_ADJUSTMENT' | 'OTHER' | null;
          notes?: string | null;
          movement_date?: string;
          created_at?: string;
          created_by?: string | null;
        };
      };
      sales: {
        Row: {
          id: string;
          sale_number: string;
          customer_name: string | null;
          customer_phone: string | null;
          customer_email: string | null;
          subtotal: number;
          tax: number;
          discount: number;
          total: number;
          account_id: string;
          payment_status: 'PAID' | 'PENDING' | 'PARTIAL' | 'CANCELLED';
          sale_date: string;
          created_at: string;
          created_by?: string;
          created_by_name?: string;
          notes: string | null;
          transaction_id?: string | null;
        };
        Insert: {
          id?: string;
          sale_number: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          customer_email?: string | null;
          subtotal: number;
          tax?: number;
          discount?: number;
          total: number;
          account_id: string;
          payment_status?: 'PAID' | 'PENDING' | 'PARTIAL' | 'CANCELLED';
          sale_date?: string;
          created_at?: string;
          created_by?: string;
          created_by_name?: string;
          notes?: string | null;
          transaction_id?: string | null;
        };
        Update: {
          id?: string;
          sale_number?: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          customer_email?: string | null;
          subtotal?: number;
          tax?: number;
          discount?: number;
          total?: number;
          account_id?: string;
          payment_status?: 'PAID' | 'PENDING' | 'PARTIAL' | 'CANCELLED';
          sale_date?: string;
          created_at?: string;
          notes?: string | null;
          transaction_id?: string | null;
        };
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          discount: number;
          subtotal: number;
          inventory_movement_id: string | null;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          discount?: number;
          subtotal: number;
          inventory_movement_id?: string | null;
        };
        Update: {
          id?: string;
          sale_id?: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
          discount?: number;
          subtotal?: number;
          inventory_movement_id?: string | null;
        };
      };
      system_settings: {
        Row: {
          key: string;
          value: any;
          version: number;
          updated_at: string;
          updated_by: string | null;
          description: string | null;
        };
        Insert: {
          key: string;
          value: any;
          version?: number;
          updated_at?: string;
          updated_by?: string | null;
          description?: string | null;
        };
        Update: {
          key?: string;
          value?: any;
          version?: number;
          updated_at?: string;
          updated_by?: string | null;
          description?: string | null;
        };
      };
    };
    Views: {
      low_stock_products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          current_stock: number;

          selling_price: number;
          category: string | null;
          brand: string | null;
        };
      };
      inventory_valuation: {
        Row: {
          id: string;
          sku: string;
          name: string;
          current_stock: number;
          cost_price: number;
          selling_price: number;
          total_cost_value: number;
          total_selling_value: number;
          potential_profit: number;
        };
      };
      recent_activity: {
        Row: {
          id: string;
          type: 'INCOME' | 'EXPENSE';
          amount: number;
          description: string;
          transaction_date: string;
          account_name: string;
          payment_method: string | null;
          reference_number: string | null;
        };
      };
    };
    Functions: {
      transfer_funds: {
        Args: {
          p_source_account_id: string;
          p_destination_account_id: string;
          p_amount: number;
          p_description: string;
          p_user_id?: string;
        };
        Returns: {
          success: boolean;
          transaction_id: string;
          message: string;
        };
      };
      update_system_setting: {
        Args: {
          p_key: string;
          p_new_value: any;
          p_expected_version: number;
          p_user_id: string;
        };
        Returns: any;
      };
      update_account_with_adjustment: {
        Args: {
          p_account_id: string;
          p_new_name: string;
          p_new_balance: number;
          p_description: string;
        };
        Returns: void;
      };
      process_restock: {
        Args: {
          p_product_id: string;
          p_quantity: number;
          p_unit_cost: number;
        };
        Returns: {
          success: boolean;
          message: string;
          new_cost?: number;
          new_price?: number;
          movement_id?: string;
        };
      };
    };
    Enums: {};
  };
};
