import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * The Supabase client, or null when no project is configured. Only imported by
 * the lazy-loaded discussion chunk, so supabase-js never weighs down the feed.
 * The anon key is a public client credential — safe to ship; Row-Level Security
 * (see supabase/schema.sql) is what protects the data.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

/** Where OAuth/magic-link should return to — works on any host or base path. */
export function redirectTo(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}
