
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

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
    console.log('🛡️ Starting Strict Enforcement & Reversal Test...');
    // Fix User ID fetch
    let userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) {
        // Try to get a user from existing transactions
        const { data: tx } = await supabase.from('transactions').select('created_by').limit(1).maybeSingle();
        if (tx) userId = tx.created_by;
    }
    const dummyUserId = userId || '00000000-0000-0000-0000-000000000000'; // Fallback only if empty DB

    try {
        // 1. Get Accounts
        const outputAccountName = `TestBank-${Date.now()}`;
        const inputAccountName = 'CRÉDITOS'; // Nominal

        // Create a temp bank account
        const { data: bankAcc, error: accError } = await supabase
            .from('accounts')
            .insert({ name: outputAccountName, type: 'BANK', balance: 0, currency: 'USD', is_active: true })
            .select()
            .single();

        if (accError) throw new Error(`Account Setup Failed: ${accError.message}`);

        const { data: creditAcc, error: credError } = await supabase
            .from('accounts')
            .select()
            .eq('name', 'CRÉDITOS')
            .single();

        if (credError || !creditAcc) throw new Error('Could not find CRÉDITOS account for balancing');

        console.log('✅ Setup Complete. Testing Constraints...');

        // 2. Test Hard-Stop: Unbalanced Write
        const groupIdFail = crypto.randomUUID();
        console.log(`🔸 Attempting Single Entry Insert (Should FAIL)... Group: ${groupIdFail}`);

        const { error: failError } = await supabase
            .from('transactions')
            .insert({
                type: 'INCOME',
                amount: 100,
                description: 'Unbalanced Test',
                account_id: bankAcc.id,
                group_id: groupIdFail,
                payment_method: 'CASH',
                created_by: dummyUserId
            });

        if (failError) {
            console.log('✅ Constraint Worked! Blocked unbalanced insert:', failError.message);
        } else {
            console.error('❌ FAILURE: Unbalanced insert was ALLOWED. Constraint is not active!');
            throw new Error('Constraint Verification Failed');
        }

        // 3. Test Hard-Stop: Balanced Write
        const groupIdSuccess = crypto.randomUUID();
        console.log(`🔸 Attempting Balanced Group Insert (Should SUCCEED)... Group: ${groupIdSuccess}`);

        const { data: successData, error: successError } = await supabase
            .from('transactions')
            .insert([
                {
                    type: 'INCOME',
                    amount: 100,
                    description: 'Balanced Part A',
                    account_id: bankAcc.id,
                    group_id: groupIdSuccess,
                    payment_method: 'CASH',
                    created_by: dummyUserId
                },
                {
                    type: 'INCOME',
                    amount: -100, // Balance
                    description: 'Balanced Part B',
                    account_id: creditAcc.id,
                    group_id: groupIdSuccess,
                    payment_method: 'CASH',
                    created_by: dummyUserId
                }
            ])
            .select();

        if (successError) {
            throw new Error(`❌ Blocked VALID insert: ${successError.message}`);
        }
        console.log('✅ Balanced Insert Allowed. Rows:', successData.length);


        // 4. Test Reversal RPC
        console.log('🔄 Testing RPC Reverse Transaction...');
        const txToReverse = successData.find(t => t.description === 'Balanced Part A');
        if (!txToReverse) throw new Error('Lost transaction data');

        const { data: rpcResult, error: rpcError } = await supabase
            .rpc('rpc_reverse_transaction', {
                p_transaction_id: txToReverse.id,
                p_user_id: dummyUserId,
                p_reason: 'Automated Test Reversal'
            });

        if (rpcError) throw new Error(`RPC Failed: ${rpcError.message}`);
        console.log('✅ RPC Returned:', rpcResult);

        // 5. Verify Reversal Integrity
        const reversalGroupId = rpcResult.reversal_group_id;
        console.log(`🔍 Verifying Reversal Group: ${reversalGroupId}`);

        const { data: revTxs, error: loadRevError } = await supabase
            .from('transactions')
            .select('*')
            .eq('group_id', reversalGroupId);

        if (loadRevError) throw new Error(`Fetch Failed: ${loadRevError.message}`);

        console.log(`📊 Found ${revTxs.length} reversal transactions.`);

        if (revTxs.length !== 2) throw new Error('❌ Reversal group must have 2 entries');

        const sum = revTxs.reduce((acc, t) => acc + Number(t.amount), 0);
        console.log(`💰 Net Reversal Sum: ${sum}`);

        if (Math.abs(sum) > 0.001) throw new Error(`❌ Reversal Group is Unbalanced! Sum: ${sum}`);

        console.log('✅ Reversal Group Validation Passed.');

        // Cleanup
        await supabase.from('transactions').delete().in('group_id', [groupIdFail, groupIdSuccess, reversalGroupId]); // Note: Fail ID won't exist but OK
        await supabase.from('accounts').delete().eq('id', bankAcc.id);
        console.log('✅ Cleanup Done.');

    } catch (e: any) {
        console.error('❌ Test Execution Failed:', e.message);
        process.exit(1);
    }
}

runTest();
