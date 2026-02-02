
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase Environment Variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyDoubleEntry() {
    console.log('--- Verifying Double Entry System ---');

    // 1. Check Total Balance (Should be 0)
    const { data: sumData, error: sumError } = await supabase
        .from('transactions')
        .select('amount.sum()') as any;

    if (sumError) {
        console.error('Error fetching sum:', sumError);
    } else {
        // Note: Supabase .select('amount.sum()') might not work directly without casting or simplified query.
        // Let's use RPC or just raw fetch if possible, but JS client is limited.
        // We'll fetch all and sum manually for safety in this script, or use a count if too large.
        // Given it's a dev env, fetch all is fine for now.

        // Better: Filter by type to check sub-balances if needed, but Global Sum is the key.
        const { data: allTx, error: fetchError } = await supabase
            .from('transactions')
            .select('amount');

        if (fetchError) {
            console.error('Error fetching transactions:', fetchError);
        } else {
            const total = allTx.reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
            console.log(`Global Net Balance: ${total.toFixed(2)} (Expected: 0.00)`);

            if (Math.abs(total) < 0.01) {
                console.log('✅ Balance is Verified (Zero-Sum)');
            } else {
                console.error('❌ Balance Imbalance Detected!');
            }
        }
    }

    // 2. Check for Orphans (Transactions without group_id)
    const { count: orphanCount, error: orphanError } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .is('group_id', null);

    if (orphanError) console.error('Error checking orphans:', orphanError);
    else {
        console.log(`Orphan Transactions (No group_id): ${orphanCount}`);
        if (orphanCount === 0) console.log('✅ No Orphans Found');
        else console.warn('⚠️ Orphans Found - Migration might not have run or failed.');
    }

}

verifyDoubleEntry().catch(console.error);
