import { describe, expect, it } from 'vitest';
import { createBrowserSupabaseClient } from './supabase-client';

describe('createBrowserSupabaseClient', () => {
  it('fails when the Supabase URL is missing', () => {
    const result = createBrowserSupabaseClient({
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_url');
  });

  it('fails when the Supabase URL is an empty string', () => {
    const result = createBrowserSupabaseClient({
      VITE_SUPABASE_URL: '  ',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_url');
  });

  it('fails when the anon key is missing', () => {
    const result = createBrowserSupabaseClient({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_anon_key');
  });

  it('builds a client when both browser-safe vars are present', () => {
    const result = createBrowserSupabaseClient({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.client).toBeDefined();
      expect(typeof result.client.auth.getSession).toBe('function');
    }
  });

  it('never references the service-role key or AI keys', () => {
    // The BrowserSupabaseEnv contract exposes only the two VITE_ vars; server
    // secrets (SUPABASE_SERVICE_ROLE_KEY, ZAI_API_KEY, DEEPSEEK_API_KEY) are not
    // part of the type and cannot be passed to the browser factory.
    const browserEnv: Parameters<typeof createBrowserSupabaseClient>[0] = {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    };
    // Compile-time guarantee: the env type carries no service/AI key fields.
    // @ts-expect-error -- SUPABASE_SERVICE_ROLE_KEY is not a browser env var.
    browserEnv.SUPABASE_SERVICE_ROLE_KEY = 'must-not-be-accepted';
    const result = createBrowserSupabaseClient(browserEnv);
    expect(result.ok).toBe(true);
  });
});
