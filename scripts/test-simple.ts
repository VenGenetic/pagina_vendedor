
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error('Missing Creds');
    process.exit(1);
}

const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false }
});

async function listTables() {
    console.log('Listing tables...');
    const { data, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

    if (error) {
        console.error('Error listing tables:', JSON.stringify(error));
    } else {
        console.log('Tables found:', data?.map(t => t.table_name).join(', '));
    }
}

listTables();
