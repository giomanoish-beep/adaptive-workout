import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultRoute, isFocusedFlow, type AppRoute } from './routes';
import { BottomNav } from './BottomNav';
import { Screen } from './Screens';
import { WorkoutFlow } from '../workout/WorkoutFlow';
import { ActiveWorkout } from '../active-workout/ActiveWorkout';
import { ProgressScreen } from '../progress/ProgressScreen';
import { SettingsScreen } from '../settings/SettingsScreen';
import type { TrainingProfile } from '../onboarding/training-profile';
import type { WorkoutReview } from '../workout/workout-review';
import type { WorkoutRequestDraft } from '../workout/workout-request';
import {
  generateWorkoutViaGateway,
  mapGatewayToWorkoutReview,
  type GatewayGenerateRequest,
} from '../workout/workout-generation-gateway';
import { createWorkoutSessionRepository } from '../workout-session/workout-session-repository';

/**
 * Authenticated navigation container. Owns the active route and decides whether
 * the bottom navigation is visible.
 */
export interface AppNavProps {
  readonly client: SupabaseClient;
  readonly profile: TrainingProfile;
  /** Called by Settings when the user saves an updated profile. */
  readonly onProfileChange: (profile: TrainingProfile) => Promise<void>;
  /** Whether the profile is currently being saved. */
  readonly saving: boolean;
  /** Non-empty when the last save attempt failed. */
  readonly saveError: string | null;
  readonly initialRoute?: AppRoute;
  readonly onExitFocusedFlow?: () => void;
}

export function AppNav({
  client,
  profile,
  onProfileChange,
  saving,
  saveError,
  initialRoute = defaultRoute,
  onExitFocusedFlow,
}: AppNavProps) {
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const focused = isFocusedFlow(route);
  // Store the last review so ActiveWorkout can start a session
  const reviewRef = useRef<WorkoutReview | undefined>(undefined);
  // userId is derived from the Supabase client session, used as identity for
  // session persistence lookups. Stored in ref to avoid re-deriving on every render.
  const userIdRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    void client.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id;
      if (!userId) return;
      userIdRef.current = userId;
      const active = await createWorkoutSessionRepository(client).loadActiveSession(userId);
      if (!cancelled && active) setRoute('active_workout');
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleSelect = useCallback((next: AppRoute) => {
    setRoute(next);
  }, []);

  // Production generation resolver: calls the deployed Edge Function
  const generateReview = useMemo(() => {
    return async (draft: WorkoutRequestDraft): Promise<WorkoutReview> => {
      const request: GatewayGenerateRequest = {
        targetMuscles: draft.muscleIds,
        durationMinutes: draft.durationMinutes ?? 60,
        equipmentContext: draft.equipmentId ?? 'full-gym',
      };

      const result = await generateWorkoutViaGateway(client, request);

      if (result.status === 'error') {
        throw new Error(result.message);
      }

      return mapGatewayToWorkoutReview(result);
    };
  }, [client]);

  const handleStartWorkout = useCallback(
    async (review: WorkoutReview) => {
      reviewRef.current = review;
      // Derive userId from the client session before entering the workout
      const { data } = await client.auth.getSession();
      if (data.session?.user.id) {
        userIdRef.current = data.session.user.id;
      }
      setRoute('active_workout');
    },
    [client],
  );

  const handleExit = useCallback(() => {
    setRoute('workout');
    onExitFocusedFlow?.();
  }, [onExitFocusedFlow]);

  const handleSignOut = useCallback(async () => {
    await client.auth.signOut();
  }, [client]);

  return (
    <div className={`app-nav${focused ? ' app-nav--focused' : ''}`}>
      <div className="app-nav__content">
        {route === 'workout' ? (
          <WorkoutFlow
            generateReview={generateReview}
            onStartWorkout={handleStartWorkout}
          />
        ) : route === 'active_workout' ? (
          <ActiveWorkout
            client={client}
            userId={userIdRef.current}
            initialReview={reviewRef.current}
            onExit={handleExit}
          />
        ) : route === 'progress' ? (
          <ProgressScreen client={client} />
        ) : route === 'settings' ? (
          <SettingsScreen
            profile={profile}
            onProfileChange={onProfileChange}
            saving={saving}
            saveError={saveError}
            signOut={handleSignOut}
          />
        ) : (
          <Screen route={route} />
        )}
      </div>
      {!focused && <BottomNav activeRoute={route} onSelect={handleSelect} />}
    </div>
  );
}
