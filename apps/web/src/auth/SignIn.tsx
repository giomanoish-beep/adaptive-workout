import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEmailSignIn } from './use-email-sign-in';

/**
 * Email sign-in form rendered for unauthenticated users (WEB_APP-001).
 *
 * Uses Supabase Auth email OTP (magic link) via the existing browser client.
 * No passwords and no OAuth. The form owns only its action lifecycle
 * (idle/submitting/success/error); session state stays in {@link useAuth}.
 */
export interface SignInProps {
  readonly client: SupabaseClient;
}

export function SignIn({ client }: SignInProps) {
  const { state, signIn, reset } = useEmailSignIn(client);
  const [emailInput, setEmailInput] = useState('');

  const submitting = state.stage === 'submitting';

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    void signIn(emailInput);
  };

  if (state.stage === 'success') {
    return (
      <div className="sign-in__success" role="status">
        <p className="sign-in__success-title">Check your email</p>
        <p className="sign-in__success-detail">
          We sent a sign-in link to <span className="sign-in__email">{state.email}</span>.
        </p>
        <button type="button" className="sign-in__secondary" onClick={reset}>
          Use a different email
        </button>
      </div>
    );
  }

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
      {errorMessage && <p className="sign-in__error" role="alert">{errorMessage}</p>}
      <button type="submit" className="sign-in__primary" disabled={submitting}>
        {submitting ? 'Sending…' : 'Continue with email'}
      </button>
    </form>
  );
}
