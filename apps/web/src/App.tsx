import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from './auth/supabase-client';
import { AuthShell } from './auth/AuthShell';
import { useAuth } from './auth/use-auth';
import { AppNav } from './navigation/AppNav';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import type { TrainingProfile } from './onboarding/training-profile';

export function App() {
  const clientResult = useMemo(
    () =>
      createBrowserSupabaseClient({
        VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
      }),
    [],
  );

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

function AuthedApp({ client }: { readonly client: SupabaseClient }) {
  const auth = useAuth(client);

  // First-run onboarding completion is held in React memory only for this task.
  // Cloud persistence is not wired yet, so a page reload may restart onboarding.
  // This is intentional and not worked around with browser storage
  // (ONBOARDING-001, docs/PRODUCT.md, AGENTS.md).
  const [profile, setProfile] = useState<TrainingProfile | null>(null);

  const handleOnboardingComplete = useCallback((completed: TrainingProfile) => {
    setProfile(completed);
  }, []);

  // Reset the in-memory profile when the authenticated identity changes (sign
  // out or a different user signs in) so app-entry behavior stays correct.
  useEffect(() => {
    setProfile(null);
  }, [auth.user?.id]);

  return (
    <AuthShell state={auth} client={client}>
      {profile ? <AppNav /> : <OnboardingFlow onComplete={handleOnboardingComplete} />}
    </AuthShell>
  );
}
