import { useCallback, useReducer } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmail } from './email';

/**
 * Sign-in action state and Supabase email OTP call for the sign-in form
 * (WEB_APP-001). This is intentionally separate from the session auth state in
 * {@link useAuth}: session restore and `onAuthStateChange` keep running
 * unchanged, while this owns only the form's idle/submitting/success/error
 * action lifecycle.
 *
 * The browser uses the existing Supabase client (anonymous key only) and calls
 * `signInWithOtp` with a normalized email. No passwords, no OAuth, no server
 * secrets, and no local workout/fitness persistence (docs/ARCHITECTURE.md).
 */

export const emailSignInStages = ['idle', 'submitting', 'success', 'error'] as const;
export type EmailSignInStage = (typeof emailSignInStages)[number];

export interface EmailSignInState {
  readonly stage: EmailSignInStage;
  /** Normalized email shown on success; empty until known. */
  readonly email: string;
  readonly errorMessage: string | null;
}

export const initialEmailSignInState: EmailSignInState = {
  stage: 'idle',
  email: '',
  errorMessage: null,
};

type SignInAction =
  | { readonly type: 'submit'; readonly email: string }
  | { readonly type: 'success'; readonly email: string }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'reset' };

function signInReducer(_state: EmailSignInState, action: SignInAction): EmailSignInState {
  switch (action.type) {
    case 'submit':
      return { stage: 'submitting', email: action.email, errorMessage: null };
    case 'success':
      return { stage: 'success', email: action.email, errorMessage: null };
    case 'error':
      return { stage: 'error', email: '', errorMessage: action.message };
    case 'reset':
      return initialEmailSignInState;
  }
}

export interface UseEmailSignInResult {
  readonly state: EmailSignInState;
  /** Validates, normalizes, and calls Supabase. Returns false on invalid input. */
  readonly signIn: (rawEmail: string) => Promise<boolean>;
  /** Returns to idle so the user can edit the email. */
  readonly reset: () => void;
}

/**
 * Hook wrapping the form's action lifecycle around the existing Supabase
 * client. `signIn` normalizes the email, short-circuits on invalid input, and
 * otherwise calls `client.auth.signInWithOtp({ email })`.
 */
export function useEmailSignIn(client: SupabaseClient): UseEmailSignInResult {
  const [state, dispatch] = useReducer(signInReducer, initialEmailSignInState);

  const signIn = useCallback(
    async (rawEmail: string): Promise<boolean> => {
      const result = normalizeEmail(rawEmail);
      if (!result.ok) {
        dispatch({
          type: 'error',
          message:
            result.code === 'EMPTY' ? 'Enter your email.' : 'Enter a valid email.',
        });
        return false;
      }

      dispatch({ type: 'submit', email: result.normalized });

      const { error } = await client.auth.signInWithOtp({ email: result.normalized });
      if (error !== null) {
        dispatch({ type: 'error', message: error.message ?? 'Unable to send sign-in link.' });
        return false;
      }
      dispatch({ type: 'success', email: result.normalized });
      return true;
    },
    [client],
  );

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  return { state, signIn, reset };
}

/**
 * Standalone request function (testable without React). Calls Supabase Auth
 * email OTP with a pre-normalized email and returns the provider error, if any.
 * Exported for unit tests that assert the call shape directly.
 */
export async function requestEmailSignIn(
  client: SupabaseClient,
  email: string,
): Promise<{ readonly error: string | null }> {
  const { error } = await client.auth.signInWithOtp({ email });
  return { error: error === null ? null : error.message ?? 'Unable to send sign-in link.' };
}
