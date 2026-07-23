import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthState } from './auth-state';
import { SignIn } from './SignIn';
import { VerifyOtp } from './VerifyOtp';
import { useEmailSignIn } from './use-email-sign-in';

/**
 * Renders one of five authentication states. Children render only when
 * authenticated. The component is presentational and framework-safe; it never
 * touches workout or fitness storage.
 *
 * V1.4: Added `awaitingOtp` status for numeric email OTP verification. The
 * email sign-in form now transitions to the OTP entry screen.
 */
export interface AuthShellProps {
  readonly state: AuthState;
  readonly client?: SupabaseClient;
  readonly children: ReactNode;
  readonly onOtpRequested?: (email: string) => void;
  readonly onOtpVerified?: () => void;
  readonly onOtpBack?: () => void;
}

export function AuthShell({
  state,
  client,
  children,
  onOtpRequested,
  onOtpVerified,
  onOtpBack,
}: AuthShellProps) {
  // Always call hooks unconditionally — pass a non-null client or null.
  const emailSignIn = useEmailSignIn(client ?? undefined);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Manage cooldown countdown timer
  useEffect(() => {
    if (emailSignIn?.state.cooldownUntil && emailSignIn.state.cooldownUntil > Date.now()) {
      const updateCooldown = () => {
        const remaining = Math.max(
          0,
          Math.ceil((emailSignIn.state.cooldownUntil - Date.now()) / 1000),
        );
        setCooldownSeconds(remaining);
        if (remaining <= 0 && cooldownTimerRef.current) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
        }
      };
      updateCooldown();
      cooldownTimerRef.current = setInterval(updateCooldown, 1000);
      return () => {
        if (cooldownTimerRef.current) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
        }
      };
    }
  }, [emailSignIn?.state.cooldownUntil]);

  // Reset cooldown when there is no active cooldown. Use a ref to track the
  // previous cooldownUntil so we only call setState when the value transitions
  // from active to inactive, avoiding set-state-in-effect cascading renders.
  const prevCooldownUntilRef = useRef(emailSignIn?.state.cooldownUntil);
  useEffect(() => {
    const prev = prevCooldownUntilRef.current;
    const current = emailSignIn?.state.cooldownUntil;
    prevCooldownUntilRef.current = current;
    if (prev && (!current || current <= Date.now())) {
      setCooldownSeconds(0);
    }
  }, [emailSignIn?.state.cooldownUntil]);

  const handleOtpRequested = useCallback(
    (email: string) => {
      onOtpRequested?.(email);
    },
    [onOtpRequested],
  );

  const handleResend = useCallback(() => {
    if (
      emailSignIn &&
      state.otpEmail &&
      cooldownSeconds <= 0 &&
      emailSignIn.state.stage !== 'submitting'
    ) {
      void emailSignIn.signIn(state.otpEmail);
    }
  }, [emailSignIn, state.otpEmail, cooldownSeconds]);

  const handleBack = useCallback(() => {
    emailSignIn?.reset();
    onOtpBack?.();
  }, [emailSignIn, onOtpBack]);

  if (state.status === 'loading') {
    return (
      <main className="auth-shell auth-shell--loading">
        <p>Restoring session…</p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="auth-shell auth-shell--error">
        <p className="eyebrow">Adaptive Workout</p>
        <h1>Authentication error</h1>
        <p>{state.errorMessage ?? 'Unable to restore your session.'}</p>
      </main>
    );
  }

  if (state.status === 'awaitingOtp' && state.otpEmail && client) {
    return (
      <main className="auth-shell auth-shell--unauthenticated">
        <div className="auth-shell__panel">
          <p className="eyebrow">Adaptive Workout</p>
          <VerifyOtp
            client={client}
            email={state.otpEmail}
            cooldownSeconds={cooldownSeconds}
            resendErrorMessage={
              emailSignIn?.state.stage === 'error' ? emailSignIn.state.errorMessage : null
            }
            resendSubmitting={emailSignIn?.state.stage === 'submitting'}
            onVerified={() => onOtpVerified?.()}
            onResend={handleResend}
            onBack={handleBack}
          />
        </div>
      </main>
    );
  }

  if (state.status === 'unauthenticated') {
    return (
      <main className="auth-shell auth-shell--unauthenticated">
        <div className="auth-shell__panel">
          <p className="eyebrow">Adaptive Workout</p>
          <h1>Sign in</h1>
          <p className="auth-shell__subtitle">Sign in to plan and track adaptive workouts.</p>
          {client && <SignIn client={client} onOtpRequested={handleOtpRequested} />}
        </div>
      </main>
    );
  }

  return <main className="auth-shell auth-shell--authenticated">{children}</main>;
}
