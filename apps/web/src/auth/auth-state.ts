/**
 * Pure authentication state machine for the web app. React-free and testable in
 * isolation; the `useAuth` hook and `AuthShell` component are thin wrappers over
 * these transitions. See docs/ARCHITECTURE.md: Supabase Auth restores cloud
 * sessions and no fitness or workout data is stored locally.
 */

export const authStatuses = [
  'loading',
  'authenticated',
  'unauthenticated',
  'error',
  'awaitingOtp',
] as const;
export type AuthStatus = (typeof authStatuses)[number];

export interface AuthUserSummary {
  readonly id: string;
  readonly email: string | null;
}

export interface AuthState {
  readonly status: AuthStatus;
  readonly user: AuthUserSummary | null;
  readonly errorMessage: string | null;
  /** Email used for the OTP challenge; set only when status === 'awaitingOtp'. */
  readonly otpEmail: string | null;
}

export const initialAuthState: AuthState = {
  status: 'loading',
  user: null,
  errorMessage: null,
  otpEmail: null,
};

/** Loose Supabase session/user shape — only the fields the state machine reads. */
export interface AuthSession {
  readonly user?: {
    readonly id?: unknown;
    readonly email?: unknown;
  };
}

/**
 * Derives the auth state from a Supabase session. A null/undefined session with
 * no error is `unauthenticated`; a present session is `authenticated`; an error
 * is `error`. Used both on initial restore and on subsequent auth changes.
 */
export function deriveAuthState(
  session: AuthSession | null,
  error: { readonly message?: string } | null,
): AuthState {
  if (error !== null) {
    return {
      status: 'error',
      user: null,
      errorMessage: error.message ?? 'Authentication error.',
      otpEmail: null,
    };
  }
  const user = session?.user;
  if (user !== undefined && typeof user.id === 'string' && user.id.length > 0) {
    return {
      status: 'authenticated',
      user: {
        id: user.id,
        email: readEmail(user),
      },
      errorMessage: null,
      otpEmail: null,
    };
  }
  return { status: 'unauthenticated', user: null, errorMessage: null, otpEmail: null };
}

function readEmail(user: { readonly email?: unknown }): string | null {
  return typeof user.email === 'string' && user.email.length > 0 ? user.email : null;
}
