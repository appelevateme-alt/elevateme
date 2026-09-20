import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// TEMPORARY-DEPLOY-URL: force auth email links to the Vercel deployment until
// told otherwise. Revert to window.location.origin when local dev resumes.
export const SITE_URL = 'https://elevateme-swart.vercel.app';

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Supabase queries will fail until .env is configured. See .env.example.',
  );
}

// Placeholder values keep createClient from throwing when env is missing.
// All queries will fail with a normalized network/config error until real
// credentials are provided.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
);
