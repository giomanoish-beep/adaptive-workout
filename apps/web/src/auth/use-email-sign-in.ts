import { useCallback, useReducer, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmail } from './email';

/**
 * Sign-in action state and Supabase email OTP call for the sign-in form
 * (WEB_APP-001). This is intentionally separate from the session auth state in
 * {@link useAuth}: session restore and `onAuthStateChange` keep running
 * unchanged, while this owns only the form's idle/submitting/success/error
 * action lifecycle.
 *
 * V1.4: Changed from magic-link flow to numeric 6-digit OTP. The success stage
 * now transitions to OTP entry instead of "check your email". Rate-limit
 * handling and resend cooldown are enforced here.
 */

export const emailSignInStages = ['idle', 'submitting', 'success', 'error'] as const;
export type EmailSignInStage = (typeof emailSignInStages)[number];

export interface EmailSignInState {
  readonly stage: EmailSignInStage;
  /** Normalized email shown on success; empty until known. */
  readonly email: string;
  readonly errorMessage: string | null;
  /** Unix timestamp in ms when the resend cooldown expires; 0 when no cooldown. */
  readonly cooldownUntil: number;
}

export const initialEmailSignInState: EmailSignInState = {
  stage: 'idle',
  email: '',
  errorMessage: null,
  cooldownUntil: 0,
};

/** Minimum seconds between sign-in OTP requests (Supabase default is 60s). */
export const RESEND_COOLDOWN_SECONDS = 60;

type SignInAction =
  | { readonly type: 'submit'; readonly email: string }
  | { readonly type: 'success'; readonly email: string; readonly cooldownUntil: number }
  | { readonly type: 'error'; readonly message: string; readonly cooldownUntil: number }
  | { readonly type: 'reset' };

function signInReducer(state: EmailSignInState, action: SignInAction): EmailSignInState {
  switch (action.type) {
    case 'submit':
      return {
        stage: 'submitting',
        email: action.email,
        errorMessage: null,
        cooldownUntil: state.cooldownUntil,
      };
    case 'success':
      return {
        stage: 'success',
        email: action.email,
        errorMessage: null,
        cooldownUntil: action.cooldownUntil,
      };
    case 'error':
      return {
        stage: 'error',
        email: state.email,
        errorMessage: action.message,
        cooldownUntil: action.cooldownUntil,
      };
    case 'reset':
      return initialEmailSignInState;
  }
}

export interface UseEmailSignInResult {
  readonly state: EmailSignInState;
  /** Validates, normalizes, and calls Supabase. Returns false on invalid input or rate-limit. */
  readonly signIn: (rawEmail: string) => Promise<boolean>;
  /** Returns to idle so the user can edit the email. */
  readonly reset: () => void;
}

/**
 * Translates a Supabase error into a user-facing message. Handles rate-limit
 * (HTTP 429) specially so the UI can show a countdown.
 */
export function translateEmailSignInError(error: {
  readonly message?: string;
  readonly status?: number;
}): string {
  if (error.status === 429) {
    return 'Too many attempts. Please wait before requesting another code.';
  }
  const message = error.message ?? '';
  if (/network|fetch|failed to fetch|offline/i.test(message)) {
    return 'Network problem. Check your connection and try again.';
  }
  return 'Unable to send verification code. Please try again.';
}

/**
 * Hook wrapping the form's action lifecycle around the existing Supabase
 * client. `signIn` normalizes the email, short-circuits on invalid input, and
 * otherwise calls `client.auth.signInWithOtp({ email })`.
 *
 * V1.4: Uses an in-flight ref to prevent double-submits. On success the caller
 * is expected to transition to the OTP verification screen.
 */
export function useEmailSignIn(client: SupabaseClient | undefined): UseEmailSignInResult {
  const [state, dispatch] = useReducer(signInReducer, initialEmailSignInState);
  const inFlightRef = useRef(false);

  const signIn = useCallback(
    async (rawEmail: string): Promise<boolean> => {
      if (inFlightRef.current || !client) return false;
      const result = normalizeEmail(rawEmail);
      if (!result.ok) {
        dispatch({
          type: 'error',
          message: result.code === 'EMPTY' ? 'Enter your email.' : 'Enter a valid email.',
          cooldownUntil: state.cooldownUntil,
        });
        return false;
      }

      inFlightRef.current = true;
      dispatch({ type: 'submit', email: result.normalized });

      try {
        const { error } = await client.auth.signInWithOtp({
          email: result.normalized,
          options: {
            shouldCreateUser: true,
          },
        });

        if (error !== null) {
          const translated = translateEmailSignInError({
            message: error.message,
            status: error.status,
          });
          const cooldownUntil =
            error.status === 429
              ? Date.now() + RESEND_COOLDOWN_SECONDS * 1000
              : state.cooldownUntil;
          dispatch({ type: 'error', message: translated, cooldownUntil });
          return false;
        }

        const cooldownUntil = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
        dispatch({ type: 'success', email: result.normalized, cooldownUntil });
        return true;
      } finally {
        inFlightRef.current = false;
      }
    },
    [client, state.cooldownUntil],
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
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  return { error: error === null ? null : translateEmailSignInError(error) };
}
