
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) { console.error('Missing Creds'); process.exit(1); }

async function checkColumn() {
    console.log('Checking for group_id column...');
    try {
        const response = await fetch(`${url}/rest/v1/transactions?select=group_id&limit=1`, {
            headers: {
                'apikey': key as string,
                'Authorization': `Bearer ${key}`
            }
        });

        console.log('Status:', response.status);
        const text = await response.text();
        if (response.status === 200) {
            console.log('✅ group_id exists!');
        } else {
            console.log('❌ Check failed:', text.substring(0, 200));
        }
    } catch (err: any) {
        console.error('Fetch error:', err.message);
    }
}

checkColumn();
