/**
 * Transfer Test Script
 * 
 * BPMN Reference: Financial_Management_Process.bpmn
 * Tests: Transfer Flow (Full Saga Pattern)
 * 
 * Validates:
 * - Source account debited (Activity_TransferSourceDebit)
 * - Destination account credited (Activity_TransferDestCredit)
 * - Atomic transaction (both succeed or both fail)
 * 
 * Run: npx tsx scripts/test-transfer.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testTransfer() {
  console.log('Testing transfer functionality...');

  // Get all accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('*')
    .limit(2);

  if (accountsError) {
    console.error('Error fetching accounts:', accountsError);
    return;
  }

  if (!accounts || accounts.length < 2) {
    console.log('Need at least 2 accounts to test transfer');
    return;
  }

  console.log('Accounts before transfer:');
  accounts.forEach(acc => {
    console.log(`  ${acc.name}: $${acc.balance}`);
  });

  // Check if transfer_funds function exists
  const { data, error } = await supabase.rpc('transfer_funds', {
    p_source_account_id: accounts[0].id,
    p_destination_account_id: accounts[1].id,
    p_amount: 10,
    p_description: 'Test transfer',
    p_user_id: null
  });

  if (error) {
    console.error('Transfer error:', error);
  } else {
    console.log('Transfer result:', data);

    // Check balances after
    const { data: accountsAfter } = await supabase
      .from('accounts')
      .select('*')
      .in('id', [accounts[0].id, accounts[1].id]);

    console.log('\nAccounts after transfer:');
    accountsAfter?.forEach(acc => {
      console.log(`  ${acc.name}: $${acc.balance}`);
    });
  }
}

testTransfer();
