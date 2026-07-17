import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from './auth/supabase-client';
import { AuthShell } from './auth/AuthShell';
import { useAuth } from './auth/use-auth';
import { AppNav } from './navigation/AppNav';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import type { TrainingProfile } from './onboarding/training-profile';
import { useTrainingProfile } from './profile/use-training-profile';
import type { ProfileState } from './profile/use-training-profile';

export function App() {
  if (import.meta.env.DEV && import.meta.env.VITE_E2E_AUTH === 'true') {
    return <E2EApp />;
  }
  return <BrowserApp />;
}

function BrowserApp() {
  const clientResult = useMemo(() => {
    return createBrowserSupabaseClient({
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    });
  }, []);

  if (!clientResult.ok) {
    const message =
      clientResult.reason === 'missing_url'
        ? 'Supabase URL is not configured.'
        : 'Supabase anonymous key is not configured.';
    return (
      <AuthShell state={{ status: 'error', user: null, errorMessage: message }}>{null}</AuthShell>
    );
  }

  return <AuthedApp client={clientResult.client} />;
}

/** Dev-only loader keeps the E2E adapter out of production's module graph. */
function E2EApp() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import('./auth/e2e-auth').then(({ createE2ESupabaseClient }) => {
      if (!cancelled) setClient(createE2ESupabaseClient());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!client) {
    return <div role="status">Loading test environment…</div>;
  }
  return <AuthedApp client={client} />;
}

function ProfileRenderer({
  client,
  profileState,
  onOnboardingComplete,
  onProfileChange,
}: {
  readonly client: SupabaseClient;
  readonly profileState: ProfileState;
  readonly onOnboardingComplete: (profile: TrainingProfile) => Promise<void>;
  readonly onProfileChange: (profile: TrainingProfile) => Promise<void>;
}) {
  // Track onboarding completion in progress to prevent double submission
  const completingRef = useRef(false);

  const handleOnboardingComplete = useCallback(
    async (profile: TrainingProfile) => {
      if (completingRef.current) return;
      completingRef.current = true;
      try {
        await onOnboardingComplete(profile);
      } finally {
        completingRef.current = false;
      }
    },
    [onOnboardingComplete],
  );

  switch (profileState.status) {
    case 'loading':
      return (
        <div className="app-loading" role="status">
          <p>Loading your profile…</p>
        </div>
      );

    case 'missing':
      return <OnboardingFlow onComplete={handleOnboardingComplete} />;

    case 'loaded':
      return (
        <AppNav
          client={client}
          profile={profileState.profile}
          onProfileChange={onProfileChange}
          saving={profileState.saving}
          saveError={profileState.saveError}
        />
      );

    case 'error':
      return (
        <div className="app-error" role="alert">
          <p>{profileState.message}</p>
          <p className="app-error__detail">
            Check your connection and try again. If the problem continues, contact support.
          </p>
        </div>
      );

    default:
      // Exhaustive check — should never reach here
      profileState satisfies never;
      return null;
  }
}

function AuthedApp({ client }: { readonly client: SupabaseClient }) {
  const auth = useAuth(client);
  const { profileState, completeOnboarding, updateProfile, retryLoad } = useTrainingProfile(client);

  // Reset profile load state when the authenticated identity changes
  const prevUserIdRef = useRef(auth.user?.id);
  useEffect(() => {
    const currentId = auth.user?.id;
    if (currentId !== prevUserIdRef.current) {
      prevUserIdRef.current = currentId;
      // Trigger a fresh load when user identity changes
      void retryLoad();
    }
  }, [auth.user?.id, retryLoad]);

  // Show loading inside AuthShell when profile is loading.
  // AuthShell already handles the auth loading/error/sign-in states.
  return (
    <AuthShell state={auth} client={client}>
      <ProfileRenderer
        client={client}
        profileState={profileState}
        onOnboardingComplete={completeOnboarding}
        onProfileChange={updateProfile}
      />
    </AuthShell>
  );
}
