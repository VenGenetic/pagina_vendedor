
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error('Missing Creds');
    process.exit(1);
}

async function testFetch() {
    console.log('Testing raw fetch to:', url);
    try {
        const response = await fetch(`${url}/rest/v1/accounts?select=count`, {
            headers: {
                'apikey': key as string,
                'Authorization': `Bearer ${key}`
            } as Record<string, string>
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Body:', text.substring(0, 500));
    } catch (err: any) {
        console.error('Fetch error:', err.message);
    }
}

testFetch();
