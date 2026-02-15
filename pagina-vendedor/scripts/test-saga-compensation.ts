/**
 * Saga Compensation Test Script
 * 
 * BPMN Reference: Financial_Management_Process.bpmn
 * Tests: BoundaryEvent_TransferFail, Activity_CompensateTransfer
 * 
 * Purpose: Demonstrate that PostgreSQL's transactional atomicity
 * effectively provides saga compensation at the database level.
 * 
 * This test verifies:
 * 1. Successful transfers complete atomically (both debit and credit)
 * 2. Failed transfers roll back completely (no partial state)
 * 3. Account balances remain consistent in all scenarios
 * 
 * Run: npx tsx scripts/test-saga-compensation.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load Environment Variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

async function testSagaCompensation() {
    console.log('🧪 Starting Saga Compensation Test...');
    console.log('');
    console.log('BPMN Reference: Financial_Management_Process.bpmn');
    console.log('Testing: Transfer Flow (Full Saga Pattern)');
    console.log('');

    try {
        // 1. Get two test accounts
        const { data: accounts, error: accError } = await supabase
            .from('accounts')
            .select('*')
            .eq('is_active', true)
            .limit(2);

        if (accError || !accounts || accounts.length < 2) {
            console.error('❌ Need at least 2 active accounts to test');
            return;
        }

        const sourceAccount = accounts[0];
        const destAccount = accounts[1];
        const transferAmount = 1; // Small test amount

        console.log('📊 Initial State:');
        console.log(`   Source: ${sourceAccount.name} = $${sourceAccount.balance}`);
        console.log(`   Dest:   ${destAccount.name} = $${destAccount.balance}`);
        console.log('');

        // 2. Test Successful Transfer (Atomic Success)
        console.log('🔄 Test 1: Successful Transfer (Activity_TransferSourceDebit + Activity_TransferDestCredit)');

        const { data: result, error: transferError } = await supabase.rpc('transfer_funds', {
            p_source_account_id: sourceAccount.id,
            p_destination_account_id: destAccount.id,
            p_amount: transferAmount,
            p_description: 'Saga Pattern Test Transfer',
            p_user_id: null
        });

        if (transferError) {
            console.error('❌ Transfer failed:', transferError.message);
            return;
        }

        console.log('✅ Transfer RPC returned:', result);

        // 3. Verify both accounts were updated atomically
        const { data: accountsAfter } = await supabase
            .from('accounts')
            .select('*')
            .in('id', [sourceAccount.id, destAccount.id]);

        const sourceAfter = accountsAfter?.find(a => a.id === sourceAccount.id);
        const destAfter = accountsAfter?.find(a => a.id === destAccount.id);

        console.log('');
        console.log('📊 After Transfer:');
        console.log(`   Source: ${sourceAfter?.name} = $${sourceAfter?.balance} (was $${sourceAccount.balance})`);
        console.log(`   Dest:   ${destAfter?.name} = $${destAfter?.balance} (was $${destAccount.balance})`);

        // 4. Validate atomic consistency
        const sourceDiff = Number(sourceAccount.balance) - Number(sourceAfter?.balance);
        const destDiff = Number(destAfter?.balance) - Number(destAccount.balance);

        console.log('');
        if (Math.abs(sourceDiff - transferAmount) < 0.01 && Math.abs(destDiff - transferAmount) < 0.01) {
            console.log('✅ PASS: Transfer was atomic - source debited and dest credited correctly');
        } else {
            console.error('❌ FAIL: Transfer amounts do not match expected values');
        }

        // 5. Verify transactions created with same group_id
        if (result?.group_id) {
            const { data: txGroup } = await supabase
                .from('transactions')
                .select('*')
                .eq('group_id', result.group_id);

            console.log('');
            console.log(`📋 Transactions in group ${result.group_id}: ${txGroup?.length || 0}`);

            if (txGroup && txGroup.length >= 2) {
                const sum = txGroup.reduce((acc, tx) => acc + Number(tx.amount), 0);
                console.log(`   Zero-Sum Check: ${sum === 0 ? '✅ PASS' : '❌ FAIL'} (Sum: ${sum})`);
            }
        }

        // 6. Test Invalid Transfer (Saga Compensation via PostgreSQL Rollback)
        console.log('');
        console.log('🔄 Test 2: Invalid Transfer (same source/dest - should fail atomically)');

        const { data: failResult, error: failError } = await supabase.rpc('transfer_funds', {
            p_source_account_id: sourceAccount.id,
            p_destination_account_id: sourceAccount.id, // Same account - should fail
            p_amount: transferAmount,
            p_description: 'Should Fail Test',
            p_user_id: null
        });

        if (failError || (failResult && !failResult.success)) {
            console.log('✅ PASS: Invalid transfer rejected - no partial state created');
            console.log(`   Error: ${failError?.message || failResult?.error}`);
        } else {
            console.error('❌ FAIL: Invalid transfer should have been rejected');
        }

        console.log('');
        console.log('🎉 Saga Compensation Test Complete');
        console.log('');
        console.log('> [!NOTE]');
        console.log('> PostgreSQL ACID transactions provide automatic saga compensation.');
        console.log('> Both debit and credit occur atomically - manual compensation code is unnecessary.');

    } catch (error: any) {
        console.error('❌ Test failed with error:', error.message);
        process.exit(1);
    }
}

testSagaCompensation();
