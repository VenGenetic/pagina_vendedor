import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Initialize Supabase client (Admin context if needed, but using anon for read-only public or protected)
// Here we use the environment variables directly to ensure we get a fresh client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const dynamic = 'force-dynamic'; // Disable caching to fetch real-time stock

export async function GET(request: NextRequest) {
  try {
    // Optional: Add API Key validation here if you want private access
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.API_SECRET_KEY}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // Fetch active products
    const { data: products, error } = await supabase
      .from('products')
      .select('id, sku, name, current_stock, selling_price, category, brand, updated_at')
      .eq('is_active', true);

    if (error) {
      console.error('Database Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return clean JSON
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      count: products.length,
      products: products.map(p => ({
        sku: p.sku,
        name: p.name,
        stock: p.current_stock,
        price: p.selling_price,
        category: p.category,
        brand: p.brand,
        last_updated: p.updated_at
      }))
    });

  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
