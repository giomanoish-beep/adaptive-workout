import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { VerifyOtp } from './VerifyOtp';
import {
  createOtpVerificationGate,
  isCompleteOtpToken,
  normalizeOtpToken,
  requestVerifyEmailOtp,
  translateVerifyError,
} from './verify-otp-utils';
import verifyOtpSource from './VerifyOtp.tsx?raw';

function mockClient(error: { readonly message?: string; readonly status?: number } | null): {
  readonly client: SupabaseClient;
  readonly verifyOtp: ReturnType<typeof vi.fn>;
} {
  const verifyOtp = vi.fn().mockResolvedValue({ data: {}, error });
  const client = { auth: { verifyOtp } } as unknown as SupabaseClient;
  return { client, verifyOtp };
}

describe('VerifyOtp rendering', () => {
  it('renders the OTP form cleanly with accessible status text', () => {
    const { client } = mockClient(null);

    const html = renderToStaticMarkup(
      createElement(VerifyOtp, {
        client,
        email: 'athlete@example.com',
        cooldownSeconds: 12,
        onVerified: vi.fn(),
        onResend: vi.fn(),
        onBack: vi.fn(),
      }),
    );

    expect(html).toContain('Enter verification code');
    expect(html).toContain('athlete@example.com');
    expect(html).toContain('aria-label="6-digit verification code"');
    expect(html).toContain('Resend in 12s');
    expect(html).toContain('Verify code');
  });

  it('does not log OTP codes', () => {
    expect(verifyOtpSource).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });
});

describe('numeric OTP input', () => {
  it('filters non-numeric characters', () => {
    expect(normalizeOtpToken('1a2 b3-4.5')).toBe('12345');
  });

  it('normalizes pasted or autofilled codes to six digits', () => {
    expect(normalizeOtpToken('Your code is 654321.')).toBe('654321');
    expect(normalizeOtpToken('123456789')).toBe('123456');
  });

  it('requires exactly six digits', () => {
    expect(isCompleteOtpToken('12345')).toBe(false);
    expect(isCompleteOtpToken('123456')).toBe(true);
  });
});

describe('OTP verification requests', () => {
  it('uses the expected email, token, and email type', async () => {
    const { client, verifyOtp } = mockClient(null);

    await requestVerifyEmailOtp(client, 'athlete@example.com', '123456');

    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'athlete@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('allows exactly one verify request for one completed code until the user edits', () => {
    const gate = createOtpVerificationGate();

    expect(gate.start('12345')).toBe(false);
    expect(gate.start('123456')).toBe(true);
    expect(gate.start('123456')).toBe(false);
    gate.finish();
    expect(gate.start('123456')).toBe(false);
    gate.reset();
    expect(gate.start('123456')).toBe(true);
  });

  it('blocks duplicate automatic and manual submissions while a request is unresolved', () => {
    const gate = createOtpVerificationGate();

    expect(gate.start('222222')).toBe(true);
    expect(gate.start('222222')).toBe(false);
    expect(gate.start('333333')).toBe(false);
  });
});

describe('OTP verification errors', () => {
  it('shows an accessible invalid-code message', () => {
    expect(translateVerifyError({ message: 'invalid token' })).toBe(
      'Invalid code. Please check and try again.',
    );
  });

  it('shows an expired-code message', () => {
    expect(translateVerifyError({ message: 'token expired' })).toBe(
      'This code has expired. Please request a new one.',
    );
  });

  it('shows a verification rate-limit message', () => {
    expect(translateVerifyError({ status: 429, message: 'rate limit' })).toBe(
      'Too many attempts. Please wait before trying again.',
    );
  });

  it('shows a network-failure message', () => {
    expect(translateVerifyError({ message: 'Failed to fetch' })).toBe(
      'Network problem. Check your connection and try again.',
    );
  });

  it('uses a generic message for unknown provider errors', () => {
    expect(translateVerifyError({ message: 'provider internals' })).toBe(
      'Unable to verify code. Please try again.',
    );
  });
});
