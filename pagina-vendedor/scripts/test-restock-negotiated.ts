
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // Using anon key, assuming RLS allows or we use service role if available locallly
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testNegotiatedCost() {
    console.log('--- TEST: Negotiated Cost Logic ---');

    // 1. Setup Data
    // We need a product ID. Let's fetch one random product.
    // If not, we could insert one, but fetching is safer.
    console.log('Fetching a product...');
    const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name, cost_price')
        .limit(1);

    if (prodError || !products || products.length === 0) {
        console.error('Error fetching product or no products found:', prodError);
        return;
    }

    const product = products[0];
    const PRODUCT_ID = product.id;
    const LIST_PRICE = 100; // Force a predictable list price for the test
    const NEGOTIATED_COST = 80; // The "Real" price
    const QUANTITY = 5;
    const EXPECTED_EARNING = (LIST_PRICE - NEGOTIATED_COST) * QUANTITY; // (100 - 80) * 5 = 100

    console.log(`Product: ${product.name} (${product.id})`);
    console.log(`Scenario: List Price=${LIST_PRICE}, Negotiated=${NEGOTIATED_COST}, Qty=${QUANTITY}`);

    // 2. Call process_restock_v3
    console.log('Calling process_restock_v3...');
    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_restock_v3', {
        p_provider_name: 'TEST_PROVIDER',
        p_payment_method: 'CASH',
        p_items: [{
            product_id: PRODUCT_ID,
            quantity: QUANTITY,
            unit_cost: LIST_PRICE,
            discount_rate: 0,
            negotiated_cost: NEGOTIATED_COST
        }],
        p_notes: 'TEST: Negotiated Cost Verification'
    });

    if (rpcError) {
        console.error('RPC Error:', rpcError);
        return;
    }

    const transactionGroupId = rpcResult;
    console.log('Success! Transaction Group ID:', transactionGroupId);

    // 3. Verify Ledger Entries
    console.log('Verifying Transactions...');
    const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('transaction_group_id', transactionGroupId);

    if (txError) {
        console.error('Error fetching transactions:', txError);
        return;
    }

    // Check Debit (Bank)
    const debitTx = transactions?.find(t => t.amount < 0);
    const expectedDebit = -(NEGOTIATED_COST * QUANTITY); // -400

    // Check Credit (Earning)
    const creditTx = transactions?.find(t => t.amount > 0 && t.description.includes('Profit')); // Or just > 0 if only one credit line

    console.log('Transactions Found:', transactions?.length);

    // Validation
    let allPassed = true;

    if (debitTx && Math.abs(debitTx.amount - expectedDebit) < 0.01) {
        console.log(`✅ BANK DEBIT correct: ${debitTx.amount} (Expected ${expectedDebit})`);
    } else {
        console.error(`❌ BANK DEBIT incorrect. Found ${debitTx?.amount}, Expected ${expectedDebit}`);
        allPassed = false;
    }

    if (creditTx) {
        if (Math.abs(creditTx.amount - EXPECTED_EARNING) < 0.01) {
            console.log(`✅ SYSTEM EARNING correct: ${creditTx.amount} (Expected ${EXPECTED_EARNING})`);
        } else {
            console.error(`❌ SYSTEM EARNING amount incorrect. Found ${creditTx.amount}, Expected ${EXPECTED_EARNING}`);
            allPassed = false;
        }
    } else {
        console.error(`❌ SYSTEM EARNING transaction MISSING.`);
        allPassed = false;
    }

    if (allPassed) {
        console.log('--- TEST PASSED ---');
    } else {
        console.log('--- TEST FAILED ---');
    }
}

testNegotiatedCost();
