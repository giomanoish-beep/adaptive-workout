import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requestEmailSignIn } from './use-email-sign-in';

/**
 * Minimal Supabase auth mock. Only the surface the sign-in action touches.
 * `signInWithOtp` is a Vitest spy so tests can assert the call shape.
 */
function mockClient(error: { readonly message: string } | null): {
  readonly client: SupabaseClient;
  readonly signInWithOtp: ReturnType<typeof vi.fn>;
} {
  const signInWithOtp = vi
    .fn()
    .mockResolvedValue({ data: {}, error });
  const client = { auth: { signInWithOtp } } as unknown as SupabaseClient;
  return { client, signInWithOtp };
}

describe('requestEmailSignIn', () => {
  it('calls signInWithOtp with the normalized email', async () => {
    const { client, signInWithOtp } = mockClient(null);
    await requestEmailSignIn(client, 'athlete@example.com');
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(signInWithOtp).toHaveBeenCalledWith({ email: 'athlete@example.com' });
  });

  it('returns null error when Supabase succeeds', async () => {
    const { client } = mockClient(null);
    await expect(requestEmailSignIn(client, 'athlete@example.com')).resolves.toEqual({
      error: null,
    });
  });

  it('returns the provider error message when Supabase fails', async () => {
    const { client } = mockClient({ message: 'Rate limit exceeded.' });
    await expect(requestEmailSignIn(client, 'athlete@example.com')).resolves.toEqual({
      error: 'Rate limit exceeded.',
    });
  });

  it('uses a fallback message when the error has none', async () => {
    const client = {
      auth: {
        signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: {} }),
      },
    } as unknown as SupabaseClient;
    await expect(requestEmailSignIn(client, 'athlete@example.com')).resolves.toEqual({
      error: 'Unable to send sign-in link.',
    });
  });
});
