import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requestEmailSignIn, translateEmailSignInError } from './use-email-sign-in';

/**
 * Minimal Supabase auth mock. Only the surface the sign-in action touches.
 * `signInWithOtp` is a Vitest spy so tests can assert the call shape.
 */
function mockClient(error: { readonly message: string } | null): {
  readonly client: SupabaseClient;
  readonly signInWithOtp: ReturnType<typeof vi.fn>;
} {
  const signInWithOtp = vi.fn().mockResolvedValue({ data: {}, error });
  const client = { auth: { signInWithOtp } } as unknown as SupabaseClient;
  return { client, signInWithOtp };
}

describe('requestEmailSignIn', () => {
  it('calls signInWithOtp with the normalized email', async () => {
    const { client, signInWithOtp } = mockClient(null);
    await requestEmailSignIn(client, 'athlete@example.com');
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'athlete@example.com',
      options: { shouldCreateUser: true },
    });
  });

  it('returns null error when Supabase succeeds', async () => {
    const { client } = mockClient(null);
    await expect(requestEmailSignIn(client, 'athlete@example.com')).resolves.toEqual({
      error: null,
    });
  });

  it('returns a sanitized provider error message when Supabase fails', async () => {
    const { client } = mockClient({ message: 'Provider internal detail.' });
    await expect(requestEmailSignIn(client, 'athlete@example.com')).resolves.toEqual({
      error: 'Unable to send verification code. Please try again.',
    });
  });

  it('uses a fallback message when the error has none', async () => {
    const client = {
      auth: {
        signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: {} }),
      },
    } as unknown as SupabaseClient;
    await expect(requestEmailSignIn(client, 'athlete@example.com')).resolves.toEqual({
      error: 'Unable to send verification code. Please try again.',
    });
  });
});

describe('translateEmailSignInError', () => {
  it('shows a resend rate-limit message without raw provider details', () => {
    expect(translateEmailSignInError({ status: 429, message: 'rate limit exceeded' })).toBe(
      'Too many attempts. Please wait before requesting another code.',
    );
  });

  it('shows a network failure message', () => {
    expect(translateEmailSignInError({ message: 'Failed to fetch' })).toBe(
      'Network problem. Check your connection and try again.',
    );
  });

  it('uses a generic unknown error message', () => {
    expect(translateEmailSignInError({ message: 'database internals' })).toBe(
      'Unable to send verification code. Please try again.',
    );
  });
});
