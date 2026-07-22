import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEmailSignIn } from './use-email-sign-in';

/**
 * Email sign-in form rendered for unauthenticated users (WEB_APP-001).
 *
 * V1.4: Uses numeric 6-digit email OTP instead of magic links. On successful
 * sign-in, calls `onOtpRequested` to transition to the OTP verification screen.
 * No passwords and no OAuth. The form owns only its action lifecycle
 * (idle/submitting/success/error); session state stays in {@link useAuth}.
 */
export interface SignInProps {
  readonly client: SupabaseClient;
  readonly onOtpRequested?: (email: string) => void;
}

export function SignIn({ client, onOtpRequested }: SignInProps) {
  const { state, signIn } = useEmailSignIn(client);
  const [emailInput, setEmailInput] = useState('');

  const submitting = state.stage === 'submitting';

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const email = emailInput;
    void signIn(email).then((success) => {
      if (success && onOtpRequested) {
        onOtpRequested(email);
      }
    });
  };

  const errorMessage = state.stage === 'error' ? state.errorMessage : null;

  return (
    <form className="sign-in__form" onSubmit={handleSubmit} noValidate>
      <label className="sign-in__field">
        <span className="sign-in__label">Email</span>
        <input
          className="sign-in__input"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          aria-label="Email"
          aria-invalid={errorMessage !== null}
          placeholder="you@example.com"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          disabled={submitting}
        />
      </label>
      {errorMessage && (
        <p className="sign-in__error" role="alert">
          {errorMessage}
        </p>
      )}
      <button type="submit" className="sign-in__primary" disabled={submitting}>
        {submitting ? 'Sending code…' : 'Continue with email'}
      </button>
    </form>
  );
}
