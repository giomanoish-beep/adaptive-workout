import { useState, useEffect, useRef, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createOtpVerificationGate,
  isCompleteOtpToken,
  normalizeOtpToken,
  OTP_LENGTH,
  requestVerifyEmailOtp,
  translateVerifyError,
} from './verify-otp-utils';

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
  readonly resendErrorMessage?: string | null;
  readonly resendSubmitting?: boolean;
  readonly onVerified: () => void;
  readonly onResend: () => void;
  readonly onBack: () => void;
}

export function VerifyOtp({
  client,
  email,
  cooldownSeconds,
  resendErrorMessage = null,
  resendSubmitting = false,
  onVerified,
  onResend,
  onBack,
}: VerifyOtpProps) {
  const [digits, setDigits] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const verificationGateRef = useRef<ReturnType<typeof createOtpVerificationGate> | null>(null);
  const resendInFlightRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const verifyOtpRef = useRef<((token: string) => Promise<void>) | null>(null);

  if (verificationGateRef.current === null) {
    verificationGateRef.current = createOtpVerificationGate();
  }

  // Auto-focus the input when the component mounts.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const verifyOtp = useCallback(
    async (token: string) => {
      const verificationGate = verificationGateRef.current;
      if (verificationGate === null || !verificationGate.start(token)) return;
      setSubmitting(true);
      setErrorMessage(null);

      try {
        const { error } = await requestVerifyEmailOtp(client, email, token);

        if (error !== null) {
          const message = translateVerifyError(error);
          setErrorMessage(message);
          setDigits('');
          inputRef.current?.focus();
        } else {
          onVerified();
        }
      } finally {
        verificationGate.finish();
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
      const value = normalizeOtpToken(event.target.value);
      setDigits(value);
      verificationGateRef.current?.reset();
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

  const handleResend = useCallback(() => {
    if (resendInFlightRef.current || cooldownSeconds > 0 || submitting || resendSubmitting) {
      return;
    }
    resendInFlightRef.current = true;
    try {
      onResend();
    } finally {
      queueMicrotask(() => {
        resendInFlightRef.current = false;
      });
    }
  }, [cooldownSeconds, onResend, resendSubmitting, submitting]);

  const canResend = cooldownSeconds <= 0 && !submitting && !resendSubmitting;
  const disabled = submitting || resendSubmitting;
  const visibleErrorMessage = errorMessage ?? resendErrorMessage;

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
            aria-invalid={visibleErrorMessage !== null}
            aria-describedby={visibleErrorMessage ? 'verify-otp-message' : undefined}
          />
        </label>

        {visibleErrorMessage && (
          <p id="verify-otp-message" className="verify-otp__error" role="alert">
            {visibleErrorMessage}
          </p>
        )}

        <button
          type="submit"
          className="verify-otp__primary"
          disabled={disabled || !isCompleteOtpToken(digits)}
        >
          {submitting ? 'Verifying code...' : 'Verify code'}
        </button>

        <div className="verify-otp__actions">
          <button type="button" className="verify-otp__back" onClick={onBack} disabled={disabled}>
            Different email
          </button>
          <button
            type="button"
            className="verify-otp__resend"
            onClick={handleResend}
            disabled={!canResend}
            aria-live="polite"
          >
            {resendSubmitting
              ? 'Sending code...'
              : cooldownSeconds > 0
                ? `Resend in ${cooldownSeconds}s`
                : 'Resend code'}
          </button>
        </div>
      </form>
    </div>
  );
}
