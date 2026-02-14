
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('URL:', url);
console.log('Service Key exists:', !!serviceKey);
console.log('Anon Key exists:', !!anonKey);

if (serviceKey && serviceKey.trim().length > 0) {
    console.log('Using Service Key (First 5 chars):', serviceKey.substring(0, 5));
} else {
    console.log('Using Anon Key (First 5 chars):', anonKey ? anonKey.substring(0, 5) : 'NONE');
}

const supabase = createClient(url!, serviceKey || anonKey!, {
    auth: { persistSession: false },
    db: { schema: 'public' }
});

async function check() {
    try {
        console.log('Attempting basic query...');
        const { data, error, count } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.log('Connection Error:', JSON.stringify(error));
        } else {
            console.log('Connection Success! Products Count:', count);

            // Check columns of 'products'
            const { data: columns, error: colError } = await supabase
                .from('information_schema.columns')
                .select('column_name, data_type')
                .eq('table_name', 'products')
                .eq('table_schema', 'public');

            console.log('Products Columns:', JSON.stringify(columns));
            if (colError) console.log('Columns Info Error:', JSON.stringify(colError));

            // Test Write Access
            console.log('Testing Write Access...');
            const testCode = 'CONNECTION-TEST-' + Date.now();
            const { data: insertData, error: insertError } = await supabase
                .from('products')
                .insert({
                    code: testCode,
                    name: 'Connection Test Item',
                    cost_price: 10,
                    sale_price: 20,
                    current_stock: 0,
                    min_stock: 0,
                    category: 'TEST'
                })
                .select()
                .single();

            if (insertError) {
                console.log('❌ Write Verification Failed:', JSON.stringify(insertError));
                // If schema cache error, it might be due to missing permissions even for service role? Unlikely.
            } else {
                console.log('✅ Write Verified. Created ID:', insertData.id);
                // Cleanup
                await supabase.from('products').delete().eq('id', insertData.id);
                console.log('✅ Cleanup Verified.');
            }
        }
    } catch (err: any) {
        console.log('Exception:', err);
    }
}

check();
