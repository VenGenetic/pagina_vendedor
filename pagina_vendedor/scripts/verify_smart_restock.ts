import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing Supabase URL or Service Role Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function runTest() {
    console.log('🧪 Starting Smart Restock Verification...');

    // 1. Create a Test Product
    const testSku = `TEST-${Date.now()}`;
    const targetMargin = 0.30; // 30%

    console.log(`📝 Creating test product SKU: ${testSku} with default price $10 and Margin 30%...`);

    const { data: product, error: createError } = await supabase
        .from('products')
        .insert({
            sku: testSku,
            name: 'Smart Restock Test Item',
            cost_price: 10,
            selling_price: 15, // Initial dummy price
            target_margin: targetMargin,
            current_stock: 0,
            min_stock_level: 5,
            is_active: true
        })
        .select()
        .single();

    if (createError) {
        console.error('❌ Failed to create test product:', createError);
        return;
    }

    try {
        console.log(`✅ Product created. ID: ${product.id}`);

        // 2. Perform Restock via RPC
        const newCost = 100;
        const quantity = 10;
        // Expected Price: 100 / (1 - 0.3) = 142.86
        const expectedPrice = 142.86;

        console.log(`🔄 Calling process_restock with Cost $${newCost} and Quantity ${quantity}...`);

        const { data: rpcResult, error: rpcError } = await supabase.rpc('process_restock', {
            p_product_id: product.id,
            p_quantity: quantity,
            p_unit_cost: newCost
        });

        if (rpcError) {
            throw new Error(`RPC Failed: ${rpcError.message}`);
        }

        console.log('✅ RPC executed successfully.');
        console.log('   Result:', rpcResult);

        // 3. Verify Updates
        console.log('🔍 Verifying product updates...');
        const { data: updatedProduct, error: fetchError } = await supabase
            .from('products')
            .select('*')
            .eq('id', product.id)
            .single();

        if (fetchError) throw fetchError;

        console.log(`   New Cost: $${updatedProduct.cost_price} (Expected: $${newCost})`);
        console.log(`   New Price: $${updatedProduct.selling_price} (Expected: ~$${expectedPrice})`);
        console.log(`   New Stock: ${updatedProduct.current_stock} (Expected: ${quantity})`);

        // Validations
        let passed = true;
        if (updatedProduct.cost_price !== newCost) {
            console.error('❌ Cost Mismatch');
            passed = false;
        }

        // Check price with small epsilon for rounding
        if (Math.abs(updatedProduct.selling_price - expectedPrice) > 0.02) {
            console.error(`❌ Price Mismatch. Got ${updatedProduct.selling_price}, expected ${expectedPrice}`);
            passed = false;
        } else {
            console.log('✅ Price calculation correct!');
        }

        // Check stock (Note: The RPC relies on trigger. If trigger works, stock should range. 
        // Wait, the RPC inserts to inventory_movements. 
        // The trigger on inventory_movements updates products.current_stock.)
        if (updatedProduct.current_stock !== quantity) {
            console.error(`⚠️ Stock mismatch. Got ${updatedProduct.current_stock}, expected ${quantity}. (Trigger might be delayed or disabled?)`);
            // Note: Trigger usually runs in same transaction for RPC?
            // If RPC is atomic, trigger should have fired.
            passed = false;
        } else {
            console.log('✅ Stock updated correctly via trigger.');
        }

        if (passed) {
            console.log('🎉 VERIFICATION PASSED!');
        } else {
            console.error('💥 VERIFICATION FAILED');
        }

    } catch (error) {
        console.error('❌ Test failed with error:', error);
    } finally {
        // Cleanup
        console.log('🧹 Cleaning up test product...');
        await supabase.from('products').delete().eq('id', product.id);
    }
}

runTest();
