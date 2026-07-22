import { useState, useEffect, useRef, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 6-digit numeric OTP verification screen (V1.4).
 *
 * Accepts a single-challenge email and the Supabase client. The user enters a
 * six-digit code received by email. On success the parent is notified via
 * `onVerified`; on error this component shows a transient message and clears
 * the input.
 *
 * Accessibility:
 * - `inputMode="numeric"` and `autocomplete="one-time-code"` for mobile keyboards
 *   and paste/autofill.
 * - `role="alert"` on error text.
 */

export interface VerifyOtpProps {
  readonly client: SupabaseClient;
  readonly email: string;
  /** Seconds remaining on the resend cooldown (0 = can resend). */
  readonly cooldownSeconds: number;
  readonly onVerified: () => void;
  readonly onResend: () => void;
  readonly onBack: () => void;
}

const OTP_LENGTH = 6;

export function VerifyOtp({
  client,
  email,
  cooldownSeconds,
  onVerified,
  onResend,
  onBack,
}: VerifyOtpProps) {
  const [digits, setDigits] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const verifyOtpRef = useRef<(token: string) => Promise<void>>();

  // Auto-focus the input when the component mounts.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const verifyOtp = useCallback(
    async (token: string) => {
      if (inFlightRef.current || token.length !== OTP_LENGTH) return;
      inFlightRef.current = true;
      setSubmitting(true);
      setErrorMessage(null);

      try {
        const { error } = await client.auth.verifyOtp({
          email,
          token,
          type: 'email',
        });

        if (error !== null) {
          const message = translateVerifyError(error);
          setErrorMessage(message);
          setDigits('');
          inputRef.current?.focus();
        } else {
          onVerified();
        }
      } finally {
        inFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [client, email, onVerified],
  );

  // Keep ref in sync so handleChange can call the latest verifyOtp.
  useEffect(() => {
    verifyOtpRef.current = verifyOtp;
  }, [verifyOtp]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      // Only accept digits; ignore non-numeric input.
      const value = event.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
      setDigits(value);
      if (errorMessage) {
        setErrorMessage(null);
      }

      // Auto-submit when all digits are entered.
      if (value.length === OTP_LENGTH) {
        void verifyOtpRef.current?.(value);
      }
    },
    [errorMessage],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (digits.length === OTP_LENGTH && !submitting) {
        void verifyOtp(digits);
      }
    },
    [digits, submitting, verifyOtp],
  );

  const canResend = cooldownSeconds <= 0 && !submitting;

  return (
    <div className="verify-otp">
      <p className="verify-otp__title">Enter verification code</p>
      <p className="verify-otp__detail">
        We sent a 6-digit code to <span className="verify-otp__email">{email}</span>.
      </p>

      <form className="verify-otp__form" onSubmit={handleSubmit} noValidate>
        <label className="verify-otp__field">
          <span className="verify-otp__label">Code</span>
          <input
            ref={inputRef}
            className="verify-otp__input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            placeholder="000000"
            value={digits}
            onChange={handleChange}
            disabled={submitting}
            aria-label="6-digit verification code"
            aria-invalid={errorMessage !== null}
          />
        </label>

        {errorMessage && (
          <p className="verify-otp__error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="verify-otp__actions">
          <button type="button" className="verify-otp__back" onClick={onBack} disabled={submitting}>
            Different email
          </button>
          <button
            type="button"
            className="verify-otp__resend"
            onClick={onResend}
            disabled={!canResend}
          >
            {cooldownSeconds > 0 ? `Resend in ${cooldownSeconds}s` : 'Resend code'}
          </button>
        </div>
      </form>
    </div>
  );
}

function translateVerifyError(error: {
  readonly message?: string;
  readonly status?: number;
}): string {
  if (error.status === 429) {
    return 'Too many attempts. Please wait before trying again.';
  }
  const message = error.message ?? '';
  if (/expired/i.test(message)) {
    return 'This code has expired. Please request a new one.';
  }
  if (/invalid/i.test(message) || /token/i.test(message)) {
    return 'Invalid code. Please check and try again.';
  }
  return message || 'Unable to verify code. Please try again.';
}
