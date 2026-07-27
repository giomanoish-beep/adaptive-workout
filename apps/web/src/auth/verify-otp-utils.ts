import type { SupabaseClient } from '@supabase/supabase-js';

export const OTP_LENGTH = 6;

export function normalizeOtpToken(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function isCompleteOtpToken(value: string): boolean {
  return value.length === OTP_LENGTH;
}

export function createOtpVerificationGate(): {
  readonly start: (token: string) => boolean;
  readonly finish: () => void;
  readonly reset: () => void;
} {
  let inFlight = false;
  let submittedToken: string | null = null;

  return {
    start(token: string) {
      if (inFlight || !isCompleteOtpToken(token) || submittedToken === token) {
        return false;
      }
      inFlight = true;
      submittedToken = token;
      return true;
    },
    finish() {
      inFlight = false;
    },
    reset() {
      submittedToken = null;
    },
  };
}

export async function requestVerifyEmailOtp(
  client: SupabaseClient,
  email: string,
  token: string,
): Promise<{ readonly error: { readonly message?: string; readonly status?: number } | null }> {
  const { error } = await client.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  return { error };
}

export function translateVerifyError(error: {
  readonly message?: string;
  readonly status?: number;
}): string {
  if (error.status === 429) {
    return 'Too many attempts. Please wait before trying again.';
  }
  const message = error.message ?? '';
  if (/network|fetch|failed to fetch|offline/i.test(message)) {
    return 'Network problem. Check your connection and try again.';
  }
  if (/expired/i.test(message)) {
    return 'This code has expired. Please request a new one.';
  }
  if (/invalid/i.test(message) || /token/i.test(message)) {
    return 'Invalid code. Please check and try again.';
  }
  return 'Unable to verify code. Please try again.';
}
