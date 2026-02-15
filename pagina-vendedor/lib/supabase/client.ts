import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const createClient = () =>
  createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

// Singleton for client-side usage if needed, though hook usage is preferred
export const supabase = createClient();

// Helper to get typed client
export const getSupabaseClient = () => supabase;
