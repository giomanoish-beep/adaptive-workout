import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthState } from './auth-state';
import { SignIn } from './SignIn';

/**
 * Renders one of four authentication states. Children render only when
 * authenticated. The component is presentational and framework-safe; it never
 * touches workout or fitness storage.
 *
 * When a Supabase client is supplied and the user is unauthenticated, the
 * email sign-in form is rendered so users can actually sign in (WEB_APP-001).
 */
export interface AuthShellProps {
  readonly state: AuthState;
  readonly client?: SupabaseClient;
  readonly children: ReactNode;
}

export function AuthShell({ state, client, children }: AuthShellProps) {
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

  if (state.status === 'unauthenticated') {
    return (
      <main className="auth-shell auth-shell--unauthenticated">
        <div className="auth-shell__panel">
          <p className="eyebrow">Adaptive Workout</p>
          <h1>Sign in</h1>
          <p className="auth-shell__subtitle">Sign in to plan and track adaptive workouts.</p>
          {client && <SignIn client={client} />}
        </div>
      </main>
    );
  }

  return <main className="auth-shell auth-shell--authenticated">{children}</main>;
}
