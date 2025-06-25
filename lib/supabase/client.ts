import { createBrowserClient } from '@supabase/ssr';
import { Database } from './types.generated';

let supabase: ReturnType<typeof createBrowserClient<Database>> | null = null;

const createClient = () => {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
};

export const getSupabaseClient = () => {
  if (!supabase) {
    supabase = createClient();
  }

  return supabase;
};

// Force create a new client instance (useful for clearing stale sessions)
export const createFreshSupabaseClient = () => {
  return createClient();
};
