/**
 * CLOUD-002: React hook that bridges the workout-session repository and the
 * active-workout UI. No browser storage. All persistence flows through the
 * repository, which uses the single Supabase client owned by App.tsx.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createWorkoutSessionRepository,
  type WorkoutSessionRepository,
  type SessionExerciseRow,
  type SetLogRow,
} from './workout-session-repository';
import {
  buildLoadingState,
  setSession,
  setSessionError,
  restoreActiveWorkoutState,
  completeSet,
  editCompletedSet,
  moveCurrentExercise,
  requestFinish,
  cancelFinish,
  finishWorkout,
  reduceRest,
  extendRest,
  skipActiveRest,
  clearRest,
  type ActiveWorkoutState,
} from '../active-workout/active-workout-state';
import type { WorkoutReview } from '../workout/workout-review';
import type { LoggedSetValue } from '../active-workout/active-workout-validation';

export interface WorkoutSessionHook {
  readonly state: ActiveWorkoutState;
  startSession(review: WorkoutReview): Promise<void>;
  resumeSession(): Promise<void>;
  completeSetWithPersistence(
    exerciseIndex: number,
    setNumber: number,
    value: LoggedSetValue,
  ): Promise<void>;
  editSet(exerciseIndex: number, setNumber: number): void;
  moveExercise(delta: number): void;
  requestFinish(): void;
  cancelFinish(): void;
  finishSession(): Promise<void>;
  reduceRest(nowMs: number): void;
  extendRest(): void;
  skipRest(nowMs: number): void;
  clearRest(): void;
}

type RepositoryDeps = {
  readonly repo: WorkoutSessionRepository;
  readonly userId: string;
  readonly exerciseRows: readonly SessionExerciseRow[];
  readonly setLogMap: ReadonlyMap<string, SetLogRow>;
};

type Action =
  | { readonly type: 'setState'; readonly state: ActiveWorkoutState }
  | { readonly type: 'complete'; readonly exerciseIndex: number; readonly setNumber: number; readonly input: LoggedSetValue; readonly nowMs: number }
  | { readonly type: 'edit'; readonly exerciseIndex: number; readonly setNumber: number }
  | { readonly type: 'move'; readonly delta: number }
  | { readonly type: 'requestFinish' }
  | { readonly type: 'cancelFinish' }
  | { readonly type: 'finish' }
  | { readonly type: 'reduceRest'; readonly nowMs: number }
  | { readonly type: 'extendRest' }
  | { readonly type: 'skipRest'; readonly nowMs: number }
  | { readonly type: 'clearRest' };

export function useWorkoutSession(
  client: SupabaseClient,
  userId: string,
): WorkoutSessionHook {
  const repo = useMemo(() => createWorkoutSessionRepository(client), [client]);
   
  const [state, dispatch] = useReducer(stateReducer, undefined, buildLoadingState);

  // Holds the current loaded session data for set persistence lookups.
  const depsRef = useRef<RepositoryDeps | null>(null);
  // Hold session ID separately for finish callback access
  const sessionIdRef = useRef<string | null>(null);

  const startSession = useCallback(
    async (review: WorkoutReview) => {
      dispatch({ type: 'setState',
         
        state: buildLoadingState() });
      try {
        const { sessionId, exercises } = await repo.createSession(review);
        sessionIdRef.current = sessionId;
        depsRef.current = {
          repo,
          userId,
          exerciseRows: exercises,
          setLogMap: new Map(),
        };
        dispatch({
          type: 'setState',
           
          state: setSession(buildLoadingState(), review, sessionId),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to start workout session.';
        dispatch({
          type: 'setState',
           
          state: setSessionError(buildLoadingState(), message),
        });
        // Re-throw so AppNav can catch and remain on review screen
        throw err;
      }
    },
    [repo, userId],
  );

  const resumeSession = useCallback(async () => {
    try {
      const loaded = await repo.loadActiveSession(userId);
      if (!loaded) {
        dispatch({
          type: 'setState',
          state: setSessionError(buildLoadingState(), 'No active workout session was found.'),
        });
        return;
      }

      const review: WorkoutReview = {
        title: loaded.session.title ?? 'Active workout',
        estimatedDurationMinutes: loaded.session.plannedDurationMinutes ?? 0,
        totalWorkingSets: loaded.exercises.reduce((sum, exercise) => sum + exercise.plannedSets, 0),
        exercises: loaded.exercises.map((exercise) => ({
          position: exercise.position,
          name: exercise.plannedExerciseName,
          sets: exercise.plannedSets,
          reps: {
            minimum: exercise.plannedRepsMin ?? 0,
            maximum: exercise.plannedRepsMax ?? 0,
          },
          rir: exercise.plannedRir ?? 0,
        })),
        muscleVolume: [],
      };
      const completedSets = loaded.exercises.flatMap((exercise, exerciseIndex) =>
        [...loaded.setLogs.values()]
          .filter(
            (log) =>
              log.workoutSessionExerciseId === exercise.id &&
              log.status === 'completed' &&
              log.weight !== null &&
              log.reps !== null,
          )
          .map((log) => ({
            exerciseIndex,
            setNumber: log.setNumber,
            logged: { weight: log.weight!, reps: log.reps!, rir: log.rir },
          })),
      );

      sessionIdRef.current = loaded.session.id;
      depsRef.current = {
        repo,
        userId,
        exerciseRows: loaded.exercises,
        setLogMap: loaded.setLogs,
      };
      dispatch({
        type: 'setState',
        state: restoreActiveWorkoutState(review, completedSets),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume workout session.';
      dispatch({
        type: 'setState',
        state: setSessionError(buildLoadingState(), message),
      });
    }
  }, [repo, userId]);

  const completeSetWithPersistence = useCallback(
    async (exerciseIndex: number, setNumber: number, value: LoggedSetValue) => {
      const deps = depsRef.current;
      if (deps === null) return;

      // Find the session exercise ID
      const exerciseRow = deps.exerciseRows[exerciseIndex];
      if (exerciseRow === undefined) return;

      try {
        // Persist first
        await deps.repo.upsertSetLog(exerciseRow.id, setNumber, value);
        // Then update UI on success
        dispatch({
          type: 'complete',
          exerciseIndex,
          setNumber,
          input: value,
          nowMs: Date.now(),
        });
      } catch {
        // Set not durably completed — do not start rest timer.
        // The error is surfaced via the set's inline state staying incomplete.
        // A production system would use an inline error state here.
      }
    },
    [],
  );

  const editSet = useCallback((exerciseIndex: number, setNumber: number) => {
    dispatch({ type: 'edit', exerciseIndex, setNumber });
  }, []);

  const moveExercise = useCallback((delta: number) => {
    dispatch({ type: 'move', delta });
  }, []);

  const requestFinish = useCallback(() => {
    dispatch({ type: 'requestFinish' });
  }, []);

  const cancelFinish = useCallback(() => {
    dispatch({ type: 'cancelFinish' });
  }, []);

  // Ref to track the latest state for the finishSession async callback.
  // Updated via useEffect to avoid setting refs during render.
  const stateRef = useRef<ActiveWorkoutState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const finishSession = useCallback(async () => {
    const deps = depsRef.current;
    const sessionId = sessionIdRef.current;
    if (deps === null || sessionId === null) return;

    const current = stateRef.current;
    if (current.stage !== 'active') return;

    // Compute incomplete from the latest state snapshot
    const total = current.exercises.reduce((sum, e) => sum + e.plannedSets.length, 0);
    let completed = 0;
    for (const exerciseSets of current.sets) {
      for (const s of exerciseSets) {
        if (s.status === 'completed') completed += 1;
      }
    }
    const hasIncomplete = completed < total;

    try {
      await deps.repo.finishSession(sessionId, hasIncomplete);
      // Success: transition to finished
      dispatch({ type: 'finish' });
    } catch {
      // Cloud finish failed — state stays active, user can retry.
      // The confirmingFinish flag remains; cancel it so they see the button.
      dispatch({ type: 'cancelFinish' });
    }
  }, []);

  const reduceRest = useCallback((nowMs: number) => {
    dispatch({ type: 'reduceRest', nowMs });
  }, []);

  const extendRest = useCallback(() => {
    dispatch({ type: 'extendRest' });
  }, []);

  const skipRest = useCallback((nowMs: number) => {
    dispatch({ type: 'skipRest', nowMs });
  }, []);

  const clearRest = useCallback(() => {
    dispatch({ type: 'clearRest' });
  }, []);

  return {
    state,
    startSession,
    resumeSession,
    completeSetWithPersistence,
    editSet,
    moveExercise,
    requestFinish,
    cancelFinish,
    finishSession,
    reduceRest,
    extendRest,
    skipRest,
    clearRest,
  };
}

function stateReducer(s: ActiveWorkoutState, action: Action): ActiveWorkoutState {
  switch (action.type) {
    case 'setState':
      return action.state;
    case 'complete':
      return completeSet(s, {
        exerciseIndex: action.exerciseIndex,
        setNumber: action.setNumber,
        logged: action.input,
        nowMs: action.nowMs,
      });
    case 'edit':
      return editCompletedSet(s, action.exerciseIndex, action.setNumber);
    case 'move':
      return moveCurrentExercise(s, action.delta);
    case 'requestFinish':
      return requestFinish(s);
    case 'cancelFinish':
      return cancelFinish(s);
    case 'finish':
      return finishWorkout(s);
    case 'reduceRest':
      return reduceRest(s, action.nowMs);
    case 'extendRest':
      return extendRest(s);
    case 'skipRest':
      return skipActiveRest(s, action.nowMs);
    case 'clearRest':
      return clearRest(s);
  }
}
