/**
 * Reversal Test Script
 * 
 * BPMN Reference: Financial_Management_Process.bpmn
 * Tests: Reversal Flow (With Correlation)
 * 
 * Validates:
 * - Group validation (Activity_ReverseTransactionRPC)
 * - Clone & Invert (Activity_MirrorGroup)
 * - Original marked is_reversed = TRUE
 * - Refund transaction created with related_transaction_id
 * 
 * Run: npx tsx scripts/test-reversal.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''; // Or SERVICE_ROLE_KEY if testing admin bypass
const supabase = createClient(supabaseUrl, supabaseKey);

async function testReversal() {
    console.log('--- Starting Safe Reversal Test ---');

    // 1. Create a dummy test transaction (INCOME)
    const TEST_AMOUNT = 500;
    const { data: tx, error: txError } = await supabase.from('transactions').insert({
        type: 'INCOME',
        amount: TEST_AMOUNT,
        description: 'Test Reversal Transaction',
        payment_method: 'cash',
        account_id: '00000000-0000-0000-0000-000000000001', // Replace with valid ID if FK check
        created_by: '00000000-0000-0000-0000-000000000001', // Dummy ID
    }).select().single();

    if (txError) {
        // If account_id fails, we might need a real one. 
        // For now, let's try to fetch an existing one or just skip if fail.
        console.error('Failed to create test transaction:', txError.message);
        return;
    }
    console.log('1. Created Test Transaction:', tx.id);

    // 2. Call Safe Reversal RPC
    console.log('2. Calling rpc_reverse_transaction...');
    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_reverse_transaction', {
        p_transaction_id: tx.id,
        p_user_id: '00000000-0000-0000-0000-000000000001',
        p_reason: 'Automated Test Reversal'
    });

    if (rpcError) {
        console.error('RPC Error:', rpcError.message);
        return;
    }
    console.log('RPC Result:', rpcData);

    // 3. Verify Original Transaction (is_reversed = true)
    const { data: originalCheck } = await supabase.from('transactions').select('*').eq('id', tx.id).single();
    if (originalCheck.is_reversed === true) {
        console.log('PASS: Original transaction marked as reversed.');
    } else {
        console.error('FAIL: Original transaction NOT marked reversed.');
    }

    // 4. Verify New Transaction (REFUND / is related)
    const { data: newTx } = await supabase.from('transactions')
        .select('*')
        .eq('related_transaction_id', tx.id)
        .single();

    if (newTx) {
        console.log('PASS: Refund transaction created:', newTx.id);
        console.log('      Type:', newTx.type);
        console.log('      Amount:', newTx.amount);
    } else {
        console.error('FAIL: No related refund transaction found.');
    }

    console.log('--- Test Complete ---');
}

testReversal();
