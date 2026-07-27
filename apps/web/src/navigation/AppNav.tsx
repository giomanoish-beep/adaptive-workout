import { useCallback, useEffect, useMemo, useState } from 'react';
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
  replaceExerciseViaGateway,
  toLoadPrescriptionKind,
  type GatewayGenerateRequest,
} from '../workout/workout-generation-gateway';
import { createWorkoutSessionRepository } from '../workout-session/workout-session-repository';
import { createProgressRepository } from '../progress/progress-repository';
import type { ExerciseProgression } from '../progress/progress-types';
import { useProgram } from '../program/use-program';
import { TodayScreen } from '../program/TodayScreen';
import { ProgramScreen } from '../program/ProgramScreen';
import type { ScheduledWorkoutState } from '../program/program-types';
import type { SessionCreateOptions } from '../workout-session/workout-session-repository';

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
  const [activeReview, setActiveReview] = useState<WorkoutReview | undefined>();
  // userId is derived from the Supabase client session, used as identity for
  // session persistence lookups. Stored in ref to avoid re-deriving on every render.
  const [activeUserId, setActiveUserId] = useState('');
  const program = useProgram(client);
  const loadedProgram = program.state.status === 'loaded' ? program.state.program : null;
  const [sessionOptions, setSessionOptions] = useState<SessionCreateOptions | undefined>();

  useEffect(() => {
    let cancelled = false;
    void client.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id;
      if (!userId) return;
      setActiveUserId(userId);
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

      const review = mapGatewayToWorkoutReview(result);
      const progression = await loadProgressionSafely(client);
      return enrichReviewWithProgression(review, progression);
    };
  }, [client]);

  const replaceExercise = useMemo(() => {
    return async (
      review: WorkoutReview,
      draft: WorkoutRequestDraft,
      position: number,
      excludedReplacementIds: readonly string[],
    ): Promise<WorkoutReview['exercises'][number]> => {
      const current = review.exercises.find((exercise) => exercise.position === position);
      if (!current?.exerciseId) throw new Error('This exercise cannot be replaced right now.');
      const result = await replaceExerciseViaGateway(client, {
        action: 'replace_exercise',
        targetMuscles: draft.muscleIds,
        durationMinutes: draft.durationMinutes ?? 60,
        equipmentContext: draft.equipmentId ?? 'full-gym',
        currentExerciseId: current.exerciseId,
        workoutExerciseIds: review.exercises
          .map((exercise) => exercise.exerciseId)
          .filter((id): id is string => typeof id === 'string'),
        excludedReplacementIds,
      });
      if (result.status === 'error' || !result.replacement) {
        throw new Error(result.message ?? 'No valid substitute is available.');
      }
      const progression = await loadProgressionSafely(client);
      const lp = result.replacement.loadPrescription;
      return {
        ...current,
        ...result.replacement,
        loadPrescription: {
          kind: toLoadPrescriptionKind(lp.kind),
          suggestedLoadKg: lp.suggestedLoadKg,
          unit: lp.unit,
          label: lp.label,
          incrementKg: lp.incrementKg,
        },
        progression: toProgressionSummary(
          progression.find((item) => item.exerciseId === result.replacement?.exerciseId),
        ),
      };
    };
  }, [client]);

  const handleStartWorkout = useCallback(
    async (review: WorkoutReview) => {
      setActiveReview(review);
      setSessionOptions(undefined);
      // Derive userId from the client session before entering the workout
      const { data } = await client.auth.getSession();
      if (data.session?.user.id) {
        setActiveUserId(data.session.user.id);
      }
      setRoute('active_workout');
    },
    [client],
  );

  const handleStartScheduled = useCallback(
    async (scheduled: ScheduledWorkoutState, review: WorkoutReview) => {
      setActiveReview(review);
      setSessionOptions({
        origin: 'programmed',
        scheduledProgramWorkoutId: scheduled.id,
        programVersion:
          program.state.status === 'loaded' ? program.state.program.revision : undefined,
        programWorkoutName: review.title,
        engineVersion:
          program.state.status === 'loaded'
            ? program.state.program.generated.engineVersion
            : undefined,
        ruleSetVersion:
          program.state.status === 'loaded'
            ? program.state.program.generated.ruleSetVersion
            : undefined,
      });
      const { data } = await client.auth.getSession();
      if (data.session?.user.id) setActiveUserId(data.session.user.id);
      setRoute('active_workout');
    },
    [client, program.state],
  );

  const handleExit = useCallback(() => {
    const destination = sessionOptions?.scheduledProgramWorkoutId ? 'today' : 'workout';
    setRoute(destination);
    if (destination === 'today') void program.reload();
    setSessionOptions(undefined);
    onExitFocusedFlow?.();
  }, [onExitFocusedFlow, program, sessionOptions]);

  const handleSignOut = useCallback(async () => {
    await client.auth.signOut();
  }, [client]);

  return (
    <div className={`app-nav${focused ? ' app-nav--focused' : ''}`}>
      <div className="app-nav__content">
        {route === 'today' ? (
          <TodayScreen
            profile={profile}
            state={program.state}
            saving={program.saving}
            error={program.actionError}
            onCreate={(setup) => void program.createProgram(setup)}
            onAdHoc={() => setRoute('workout')}
            onViewProgram={() => setRoute('program')}
            onStart={(scheduled, review) => void handleStartScheduled(scheduled, review)}
            onReschedule={(id, date) => void program.reschedule(id, date)}
            onSkip={(id) => void program.skip(id)}
          />
        ) : route === 'program' && loadedProgram ? (
          <ProgramScreen
            program={loadedProgram}
            saving={program.saving}
            error={program.actionError}
            onBack={() => setRoute('today')}
            onRevise={(setup) => void program.reviseProgram(loadedProgram, setup)}
            onReschedule={(id, date) => void program.reschedule(id, date)}
            onSkip={(id) => void program.skip(id)}
            onAddAdaptation={(input) => void program.addAdaptation(loadedProgram.id, input)}
            onRemoveAdaptation={(id) => void program.removeAdaptation(id)}
          />
        ) : route === 'workout' ? (
          <WorkoutFlow
            generateReview={generateReview}
            replaceExercise={replaceExercise}
            onStartWorkout={(review) => void handleStartWorkout(review)}
          />
        ) : route === 'active_workout' ? (
          <ActiveWorkout
            client={client}
            userId={activeUserId}
            initialReview={activeReview}
            sessionOptions={sessionOptions}
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

async function loadProgressionSafely(
  client: SupabaseClient,
): Promise<readonly ExerciseProgression[]> {
  try {
    return (await createProgressRepository(client).loadProgression()).exerciseProgressions;
  } catch {
    return [];
  }
}

function enrichReviewWithProgression(
  review: WorkoutReview,
  progression: readonly ExerciseProgression[],
): WorkoutReview {
  return {
    ...review,
    exercises: review.exercises.map((exercise) => ({
      ...exercise,
      progression: toProgressionSummary(
        progression.find((item) => item.exerciseId === exercise.exerciseId),
      ),
    })),
  };
}

function toProgressionSummary(progression: ExerciseProgression | undefined) {
  const hasEnoughData =
    progression !== undefined &&
    (progression.sourceExposureCount ?? 0) > 0 &&
    progression.recommendation !== 'Not enough data';
  return {
    lastWeightKg: progression?.currentWorkingWeightKg ?? null,
    lastReps: progression?.recentPerformanceReps ?? null,
    lastRir: progression?.targetRir ?? null,
    nextWeightKg: hasEnoughData ? (progression?.nextSuggestedWeightKg ?? null) : null,
    trend: progression?.trend ?? null,
    hasEnoughData,
  };
}
