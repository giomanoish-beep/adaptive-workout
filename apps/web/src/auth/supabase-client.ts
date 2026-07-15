import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-safe Supabase client factory. It reads ONLY the `VITE_`-prefixed
 * environment variables (docs/ARCHITECTURE.md): the Supabase URL and the
 * anonymous key. The service-role key and AI keys never enter browser code.
 *
 * Returns a typed failure when browser config is missing so the auth shell can
 * surface an error state rather than silently building an unusable client.
 */
export type SupabaseClientResult =
  | { readonly ok: true; readonly client: SupabaseClient }
  | { readonly ok: false; readonly reason: 'missing_url' | 'missing_anon_key' };

export function createBrowserSupabaseClient(env: BrowserSupabaseEnv): SupabaseClientResult {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (typeof url !== 'string' || url.trim().length === 0) {
    return { ok: false, reason: 'missing_url' };
  }
  if (typeof anonKey !== 'string' || anonKey.trim().length === 0) {
    return { ok: false, reason: 'missing_anon_key' };
  }

  const client = createClient(url, anonKey, {
    auth: {
      // Persist the auth session in Supabase's own storage so cloud sessions
      // restore across reloads. This stores ONLY the auth token, never workout
      // or fitness data (docs/ARCHITECTURE.md).
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return { ok: true, client };
}

/**
 * Minimal read of `import.meta.env` for the two browser-safe vars. Only these
 * two `VITE_`-prefixed vars are consumed; the service-role key and AI keys are
 * never read by browser code (docs/ARCHITECTURE.md).
 */
export interface BrowserSupabaseEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
