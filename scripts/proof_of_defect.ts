
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const clientKey = serviceKey || supabaseKey;

if (!supabaseUrl || !clientKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, clientKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function runDemonstration() {
    console.log('--- STARTING PROOF OF DEFECT: REVERSAL LOGIC ---');

    try {
        // 1. Create Test Accounts (Asset + Revenue)
        const assetAccountName = `Demo Asset ${Date.now()}`;
        const revenueAccountName = `Demo Revenue ${Date.now()}`;

        const { data: assetAccount, error: accError } = await supabase
            .from('accounts')
            .insert({
                name: assetAccountName,
                type: 'CASH',
                balance: 0.00,
                currency: 'USD',
                is_active: true
            })
            .select()
            .single();

        if (accError) throw new Error(`Asset Account Creation Failed: ${accError.message}`);

        const { data: revAccount, error: revAccError } = await supabase
            .from('accounts')
            .insert({
                name: revenueAccountName,
                type: 'CASH',
                balance: 0.00,
                currency: 'USD',
                is_active: true,
                is_nominal: true
            })
            .select()
            .single();

        if (revAccError) throw new Error(`Revenue Account Creation Failed: ${revAccError.message}`);

        console.log(`1. Created Accounts: Asset(${assetAccount.id}), Revenue(${revAccount.id})`);

        // 2. Create Double Entry Transaction (Sale)
        // Group Sum must be 0.
        // Asset: +100
        // Revenue: -100
        const originalAmount = 100.00;
        const groupId = crypto.randomUUID();

        // Batch Insert (Entry 1 + Entry 2)
        const { data: txs, error: txError } = await supabase
            .from('transactions')
            .insert([
                {
                    type: 'INCOME',
                    amount: originalAmount,
                    description: 'Test Sale Asset Leg +100',
                    account_id: assetAccount.id,
                    payment_method: 'CASH',
                    group_id: groupId,
                    created_at: new Date().toISOString()
                },
                {
                    type: 'INCOME',
                    amount: -1 * originalAmount,
                    description: 'Test Sale Revenue Leg -100',
                    account_id: revAccount.id,
                    payment_method: 'CASH',
                    group_id: groupId,
                    created_at: new Date().toISOString()
                }
            ])
            .select();

        if (txError) throw new Error(`Transaction Batch Failed: ${txError.message}`);

        const txAsset = txs.find(t => t.description.includes('Asset'));
        // const txRevenue = txs.find(t => t.description.includes('Revenue'));


        // Wait for trigger
        await new Promise(r => setTimeout(r, 1000));

        const { data: accAfterTx } = await supabase.from('accounts').select('balance').eq('id', assetAccount.id).single();
        console.log(`2. Transaction Created. Asset Account Balance: ${accAfterTx?.balance} (Expected: 100)`);

        // 3. Execute Reversal via RPC on the ASSET Transaction (or any in group)
        console.log('3. Executing Reversal RPC...');

        // Get user for log
        const { data: userData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
        const userId = userData.users[0]?.id || txAsset.createdBy; // Fallback

        const { data: reversalResult, error: revError } = await supabase.rpc('rpc_reverse_transaction', {
            p_transaction_id: txAsset.id,
            p_user_id: userId,
            p_reason: 'Proof of Defect Demo'
        });

        if (revError) throw new Error(`Reversal RPC Failed: ${revError.message}`);
        console.log('Reversal RPC Result:', reversalResult);

        // Wait for trigger
        await new Promise(r => setTimeout(r, 1000));

        // 4. Check Final Balance
        const { data: accFinal } = await supabase.from('accounts').select('balance').eq('id', assetAccount.id).single();

        console.log('---------------------------------------------------');
        console.log(`4. FINAL Asset Account Balance: ${accFinal?.balance}`);

        const finalBalance = Number(accFinal?.balance);

        if (finalBalance === 0) {
            console.log('RESULT: SUCCESS. The Mirror is Good.');
        } else if (finalBalance === 200) {
            console.log('RESULT: FAILURE. BALANCE DOUBLED (200). The Mirror is Distorted.');
            console.log('EXPLANATION: Reversal(-100) + Trigger(Subtract -100) = +200.');
        } else {
            console.log(`RESULT: UNEXPECTED. Balance is ${finalBalance}`);
        }
        console.log('---------------------------------------------------');

    } catch (err: any) {
        console.error('Demo Failed:', err.message);
    }
}

runDemonstration();
