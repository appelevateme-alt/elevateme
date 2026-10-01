import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  // Build-safe warning; runtime will throw on actual auth use if missing.
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing');
}

export const supabase = createClient(url ?? 'http://localhost:54321', anon ?? 'anon-placeholder', {
  auth: { persistSession: true, autoRefreshToken: true }
});

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
