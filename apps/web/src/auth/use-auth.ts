import { useEffect, useMemo, useReducer } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveAuthState, initialAuthState, type AuthState } from './auth-state';

/**
 * React hook that drives the authentication shell. It restores the cloud
 * session on mount via `getSession`, then subscribes to `onAuthStateChange` for
 * sign-in / sign-out / token-refresh transitions. All state transitions go
 * through the pure `deriveAuthState` reducer so they stay testable.
 */
export interface UseAuthResult extends AuthState {
  readonly signOut: () => Promise<void>;
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

  return { ...state, signOut };
}

type AuthAction = { readonly type: 'resolved'; readonly state: AuthState };

function authReducer(_state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'resolved':
      return action.state;
  }
}
