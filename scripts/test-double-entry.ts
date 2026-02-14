
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load Environment Variables
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error('Missing Supabase Credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
});

async function runTest() {
    console.log('🧪 Starting Double-Entry Verification Test...');

    try {
        // 1. Setup: Create a Test Product
        const testSku = `TEST-${Date.now()}`;
        const { data: product, error: prodError } = await supabase
            .from('products')
            .insert({
                sku: testSku,
                name: 'Unidad de Prueba Double-Entry',
                cost_price: 50,
                selling_price: 100,
                current_stock: 10,
                category: 'TEST'
            })
            .select()
            .single();

        if (prodError) throw new Error(`Product Creation Failed: ${prodError.message}`);
        console.log(`✅ Test Product Created: ${product.name} (${product.id})`);

        // 2. Setup: Create a Test Bank Account (Asset)
        // We need a valid account to pay INTO.
        const { data: account, error: accError } = await supabase
            .from('accounts')
            .insert({
                name: `Banco Prueba ${Date.now()}`,
                type: 'BANK',
                balance: 1000,
                is_active: true,
                currency: 'USD',
                is_nominal: false
            })
            .select()
            .single();

        if (accError) throw new Error(`Account Creation Failed: ${accError.message}`);
        console.log(`✅ Test Account Created: ${account.name} (${account.id})`);

        // 3. Execute Sale (RPC)
        // This should trigger the Double Entry logic
        const salePayload = {
            p_sale_number: `SALE-${Date.now()}`,
            p_customer_name: 'Cliente Test',
            p_customer_id_number: '999999999',
            p_subtotal: 100,
            p_tax: 0,
            p_discount: 0,
            p_total: 100, // We expect +100 Debit (Asset) and -100 Credit (Revenue)
            p_shipping_cost: 0,
            p_account_id: account.id,
            p_payment_method: 'CASH',
            p_items: [
                {
                    product_id: product.id,
                    quantity: 1,
                    price: 100,
                    discount: 0,
                    cost_unit: 50
                }
            ],
            p_user_id: (await supabase.auth.getUser()).data.user?.id || product.created_by || '00000000-0000-0000-0000-000000000000', // Use dummy or valid UUID
            p_user_name: 'Tester',
            p_notes: 'Test Double Entry'
        };

        console.log('🔄 Executing process_sale_transaction...');
        const { data: rpcResult, error: rpcError } = await supabase.rpc('process_sale_transaction', salePayload);

        if (rpcError) throw new Error(`RPC Failed: ${rpcError.message}`);
        console.log('✅ RPC Success:', rpcResult);

        if (!rpcResult.group_id) {
            throw new Error('❌ RPC returned no group_id! Migration might not be applied correctly.');
        }

        const groupId = rpcResult.group_id;
        console.log(`🔍 Verifying Transactions for Group ID: ${groupId}`);

        // 4. Verify Transactions
        const { data: transactions, error: txError } = await supabase
            .from('transactions')
            .select('*')
            .eq('group_id', groupId);

        if (txError) throw new Error(`Fetch Transactions Failed: ${txError.message}`);

        console.log(`📊 Found ${transactions.length} transactions.`);

        // Check Count
        if (transactions.length !== 2) {
            console.error('❌ Expected 2 transactions, found:', transactions.length);
            console.table(transactions);
            process.exit(1);
        } else {
            console.log('✅ Count Check Passed: 2 rows.');
        }

        // Check Sum
        const sum = transactions.reduce((acc, tx) => acc + Number(tx.amount), 0);
        console.log(`💰 Net Sum (Debit + Credit): ${sum}`);

        if (Math.abs(sum) > 0.001) { // Float tolerance
            console.error('❌ Zero-Sum Check Failed!');
            console.table(transactions);
            process.exit(1);
        } else {
            console.log('✅ Zero-Sum Check Passed.');
        }

        // Check Structure
        const debitTx = transactions.find(tx => Number(tx.amount) > 0);
        const creditTx = transactions.find(tx => Number(tx.amount) < 0);

        if (debitTx && creditTx) {
            console.log(`✅ Debit (Asset) Row Detected: ID=${debitTx.id}, Amount=${debitTx.amount}, Account=${debitTx.account_id}`);
            console.log(`✅ Credit (Revenue) Row Detected: ID=${creditTx.id}, Amount=${creditTx.amount}, Account=${creditTx.account_id}`);

            // Verify Accounts
            if (debitTx.account_id !== account.id) console.warn('⚠️ Debit Account mismatch!');
            // Ideally verify credit account is "Ingresos por Ventas" but we'd need to fetch its ID again.
        } else {
            console.error('❌ Could not identify Debit/Credit pair properly.');
            console.table(transactions);
        }

        // Cleanup
        console.log('🧹 Cleaning up test data...');
        // Delete transactions, sales, items, inventory, customer, account, product
        // Usually cascades handle some, but we should be careful.
        // For verification script, maybe leaving data isn't terrible if identified as TEST.
        // But let's try to minimal cleanup.
        await supabase.from('transactions').delete().eq('group_id', groupId);
        await supabase.from('sales').delete().eq('id', rpcResult.sale_id);
        await supabase.from('inventory_movements').delete().eq('notes', 'Venta ' + salePayload.p_sale_number);
        await supabase.from('products').delete().eq('id', product.id);
        await supabase.from('accounts').delete().eq('id', account.id);

        console.log('✅ Test Complete & Verified.');

    } catch (error: any) {
        console.error('❌ Test Failed:', error.message);
        process.exit(1);
    }
}

runTest();
