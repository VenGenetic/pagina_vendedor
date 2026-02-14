
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local from project root
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { supabase } from '../lib/supabase/client';

async function testReservation() {
    console.log('--- STARTING RESERVATION TEST ---');

    // 1. Create Test Product
    const sku = 'TEST-RES-' + Date.now();
    console.log(`Creating product ${sku}...`);
    const { data: product, error: prodError } = await (supabase as any)
        .from('products')
        .insert({
            sku,
            name: 'Test Reservation Product',
            cost_price: 10,
            selling_price: 20,
            current_stock: 10,
            reserved_stock: 0
        })
        .select()
        .single();

    if (prodError) {
        console.error('Failed to create product:', prodError);
        return;
    }
    console.log('Product created:', product.id);

    // 2. Reserve Stock
    console.log('Reserving 5 units...');
    const { data: resData, error: resError } = await supabase.rpc('reserve_stock', {
        p_product_id: product.id,
        p_quantity: 5
    });

    if (resError) {
        console.error('Reservation failed:', resError);
        return;
    }
    console.log('Reservation result:', resData);

    // 3. Verify Reserved Stock
    const { data: prodAfterReserve } = await supabase
        .from('products')
        .select('current_stock, reserved_stock')
        .eq('id', product.id)
        .single();

    console.log('Product State (Reserved):', prodAfterReserve);
    if (prodAfterReserve.reserved_stock !== 5) {
        console.error('FAIL: Reserved stock should be 5');
    } else {
        console.log('PASS: Reserved stock is 5');
    }

    // 4. Commit Reservation
    console.log('Committing reservation...');
    const { data: commitData, error: commitError } = await supabase.rpc('commit_reservation', {
        p_reservation_id: resData.reservation_id
    });

    if (commitError) {
        console.error('Commit failed:', commitError);
        return;
    }
    console.log('Commit result:', commitData);

    // 5. Verify Final Stock
    const { data: prodFinal } = await supabase
        .from('products')
        .select('current_stock, reserved_stock')
        .eq('id', product.id)
        .single();

    console.log('Product State (Final):', prodFinal);
    if (prodFinal.current_stock !== 5 || prodFinal.reserved_stock !== 0) {
        console.error('FAIL: Current stock should be 5, Reserved 0');
    } else {
        console.log('PASS: Final stock states are correct');
    }

    // Cleanup
    await supabase.from('products').delete().eq('id', product.id);
    console.log('--- TEST COMPLETE ---');
}

testReservation();
