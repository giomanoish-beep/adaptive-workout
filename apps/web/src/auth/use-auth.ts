import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveAuthState, initialAuthState, type AuthState } from './auth-state';

/**
 * React hook that drives the authentication shell. It restores the cloud
 * session on mount via `getSession`, then subscribes to `onAuthStateChange` for
 * sign-in / sign-out / token-refresh transitions. All state transitions go
 * through the pure `deriveAuthState` reducer so they stay testable.
 *
 * V1.4: Added `setAwaitingOtp` and `clearAwaitingOtp` for the numeric OTP flow.
 */
export interface UseAuthResult extends AuthState {
  readonly signOut: () => Promise<void>;
  /** Transition to the OTP verification step. Stores the email for the challenge. */
  readonly setAwaitingOtp: (email: string) => void;
  /** Return to unauthenticated state (e.g. user wants a different email). */
  readonly clearAwaitingOtp: () => void;
}

export function useAuth(client: SupabaseClient): UseAuthResult {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  useEffect(() => {
    let active = true;

    async function restore() {
      const { data, error } = await client.auth.getSession();
      if (!active) return;
      dispatch({ type: 'resolved', state: deriveAuthState(data.session, error) });
    }

    void restore();

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') {
        dispatch({ type: 'resolved', state: deriveAuthState(null, null) });
        return;
      }
      dispatch({ type: 'resolved', state: deriveAuthState(session, null) });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  const signOut = useMemo(() => {
    return async function signOut() {
      await client.auth.signOut();
    };
  }, [client]);

  const setAwaitingOtp = useCallback((email: string) => {
    dispatch({
      type: 'setAwaitingOtp',
      state: {
        status: 'awaitingOtp',
        user: null,
        errorMessage: null,
        otpEmail: email,
      },
    });
  }, []);

  const clearAwaitingOtp = useCallback(() => {
    dispatch({
      type: 'resolved',
      state: { status: 'unauthenticated', user: null, errorMessage: null, otpEmail: null },
    });
  }, []);

  return { ...state, signOut, setAwaitingOtp, clearAwaitingOtp };
}

type AuthAction =
  | { readonly type: 'resolved'; readonly state: AuthState }
  | { readonly type: 'setAwaitingOtp'; readonly state: AuthState };

function authReducer(_state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'resolved':
    case 'setAwaitingOtp':
      return action.state;
  }
}
