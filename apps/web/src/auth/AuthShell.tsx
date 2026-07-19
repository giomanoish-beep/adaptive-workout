import { type ReactNode, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthState } from './auth-state';
import { SignIn } from './SignIn';
import { VerifyOtp } from './VerifyOtp';

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
  const handleOtpRequested = useCallback(
    (email: string) => {
      onOtpRequested?.(email);
    },
    [onOtpRequested],
  );

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
            cooldownSeconds={0}
            onVerified={() => onOtpVerified?.()}
            onResend={() => {
              // Re-trigger the sign-in flow which will send a new OTP.
            }}
            onBack={() => onOtpBack?.()}
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
          {client && (
            <SignIn client={client} onOtpRequested={handleOtpRequested} />
          )}
        </div>
      </main>
    );
  }

  return <main className="auth-shell auth-shell--authenticated">{children}</main>;
}
