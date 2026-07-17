import type { WorkoutReview, WorkoutReviewExercise } from '../workout/workout-review';
import type { LoggedSetValue } from './active-workout-validation';
import {
  addRestSeconds,
  skipRest,
  startRest,
  subtractRestSeconds,
  type RestTimerState,
} from './active-workout-rest';

/**
 * Pure, React-free active-workout state (WEB_APP-004). This task is UI and
 * pure in-memory React flow only — cloud persistence is wired later. No
 * localStorage/sessionStorage/IndexedDB (docs/ARCHITECTURE.md).
 *
 * The active workout enters from a WEB_APP-003 review fixture. Each planned
 * exercise contributes `exercise.sets` planned sets. Sets are addressed by
 * exercise index and set index (1-based set numbers). Logged values live only
 * in memory for the duration of the flow.
 */

/** Prescription copied from the review fixture for the current-exercise view. */
export interface PlannedSet {
  readonly setNumber: number;
  readonly targetReps: Readonly<{ readonly minimum: number; readonly maximum: number }>;
  readonly targetRir: number;
}

/** An exercise as it appears in the active workout. */
export interface ActiveExercise {
  readonly position: number;
  readonly name: string;
  readonly plannedSets: readonly PlannedSet[];
}

export type SetStatus = 'incomplete' | 'completed';

export interface ActiveSet {
  readonly exerciseIndex: number;
  readonly setNumber: number;
  readonly status: SetStatus;
  /** Present only when the set has been completed. */
  readonly logged: LoggedSetValue | null;
}

export const activeWorkoutStages = ['loading', 'active', 'error', 'finished'] as const;
export type ActiveWorkoutStage = (typeof activeWorkoutStages)[number];

export interface ActiveWorkoutState {
  readonly stage: ActiveWorkoutStage;
  readonly title: string;
  readonly estimatedDurationMinutes: number;
  readonly exercises: readonly ActiveExercise[];
  /** Per-exercise, per-set rows. */
  readonly sets: readonly (readonly ActiveSet[])[];
  /** Deterministic active exercise index (starts at 0). */
  readonly currentExerciseIndex: number;
  /** Whether the inline finish-confirmation control is shown. */
  readonly confirmingFinish: boolean;
  /** Counts of completed sets captured at finish time, for the summary view. */
  readonly summary: ActiveWorkoutSummary | null;
  /**
   * In-memory rest timer, or null when idle. Started by set completion, held
   * across exercise navigation, and not restarted by editing a completed set.
   * Timestamp-based (see active-workout-rest.ts); no browser persistence.
   */
  readonly rest: RestTimerState | null;
  /** Surface message when the session entered an error stage. */
  readonly errorMessage: string | null;
}

export interface ActiveWorkoutSummary {
  readonly completedSets: number;
  readonly totalSets: number;
}

/**
 * Loading state used while a cloud session is being created. Carries no
 * exercises until the session resolves into an `active` state.
 */
export function buildLoadingState(): ActiveWorkoutState {
  return {
    stage: 'loading',
    title: '',
    estimatedDurationMinutes: 0,
    exercises: [],
    sets: [],
    currentExerciseIndex: 0,
    confirmingFinish: false,
    summary: null,
    rest: null,
    errorMessage: null,
  };
}

/**
 * Transitions into the `active` stage by building the in-memory workout state
 * from a review fixture. The `sessionId` is informational; it is not part of
 * the pure workout state but is accepted so callers can thread it through.
 */
export function setSession(
  _state: ActiveWorkoutState,
  review: WorkoutReview,
  _sessionId: string,
): ActiveWorkoutState {
  return { ...buildActiveWorkoutState(review), errorMessage: null };
}

/** Transitions into the `error` stage with a controlled surface message. */
export function setSessionError(
  _state: ActiveWorkoutState,
  message: string,
): ActiveWorkoutState {
  return { ...buildLoadingState(), stage: 'error', errorMessage: message };
}

/** Builds the initial in-memory active-workout state from a review fixture. */
export function buildActiveWorkoutState(review: WorkoutReview): ActiveWorkoutState {
  const exercises: ActiveExercise[] = review.exercises.map(toActiveExercise);
  const sets = exercises.map((exercise, exerciseIndex) =>
    exercise.plannedSets.map<ActiveSet>((planned) => ({
      exerciseIndex,
      setNumber: planned.setNumber,
      status: 'incomplete',
      logged: null,
    })),
  );

  return {
    stage: 'active',
    title: review.title,
    estimatedDurationMinutes: review.estimatedDurationMinutes,
    exercises,
    sets,
    currentExerciseIndex: 0,
    confirmingFinish: false,
    summary: null,
    rest: null,
    errorMessage: null,
  };
}

export interface RestoredCompletedSet {
  readonly exerciseIndex: number;
  readonly setNumber: number;
  readonly logged: LoggedSetValue;
}

/** Restores persisted completed sets without synthesizing a new rest timer. */
export function restoreActiveWorkoutState(
  review: WorkoutReview,
  completedSets: readonly RestoredCompletedSet[],
): ActiveWorkoutState {
  const state = buildActiveWorkoutState(review);
  const restoredByKey = new Map(
    completedSets.map((set) => [`${set.exerciseIndex}:${set.setNumber}`, set.logged]),
  );
  return {
    ...state,
    sets: state.sets.map((exerciseSets, exerciseIndex) =>
      exerciseSets.map((set) => {
        const logged = restoredByKey.get(`${exerciseIndex}:${set.setNumber}`);
        return logged
          ? { ...set, status: 'completed' as const, logged }
          : set;
      }),
    ),
  };
}

function toActiveExercise(exercise: WorkoutReviewExercise): ActiveExercise {
  const plannedSets: PlannedSet[] = [];
  for (let setNumber = 1; setNumber <= exercise.sets; setNumber += 1) {
    plannedSets.push({
      setNumber,
      targetReps: { minimum: exercise.reps.minimum, maximum: exercise.reps.maximum },
      targetRir: exercise.rir,
    });
  }
  return {
    position: exercise.position,
    name: exercise.name,
    plannedSets,
  };
}

/** Total planned sets across every exercise. */
export function totalPlannedSets(state: ActiveWorkoutState): number {
  return state.exercises.reduce((sum, exercise) => sum + exercise.plannedSets.length, 0);
}

/** Number of completed sets, derived from state (not a duplicated counter). */
export function completedSetCount(state: ActiveWorkoutState): number {
  let count = 0;
  for (const exerciseSets of state.sets) {
    for (const set of exerciseSets) {
      if (set.status === 'completed') count += 1;
    }
  }
  return count;
}

/** True when every planned set for the exercise is completed. */
export function isExerciseComplete(
  state: ActiveWorkoutState,
  exerciseIndex: number,
): boolean {
  const sets = state.sets[exerciseIndex];
  if (sets === undefined) return false;
  return sets.length > 0 && sets.every((set) => set.status === 'completed');
}

/** The current exercise, derived from the active index. */
export function currentExercise(state: ActiveWorkoutState): ActiveExercise {
  const exercise = state.exercises[state.currentExerciseIndex];
  // The index is always clamped to a valid range, and an active workout always
  // carries at least one exercise, so this is defined by construction.
  if (exercise !== undefined) {
    return exercise;
  }
  const fallback = state.exercises[0];
  if (fallback !== undefined) {
    return fallback;
  }
  // Unreachable for a workout built from a review fixture (always ≥1 exercise).
  throw new Error('Active workout has no exercises.');
}

/** Whether a Previous control is available for the active index. */
export function canGoToPreviousExercise(state: ActiveWorkoutState): boolean {
  return state.currentExerciseIndex > 0;
}

/** Whether a Next control is available for the active index. */
export function canGoToNextExercise(state: ActiveWorkoutState): boolean {
  return state.currentExerciseIndex < state.exercises.length - 1;
}

/** True when any planned set is still incomplete. */
export function hasIncompleteSets(state: ActiveWorkoutState): boolean {
  return completedSetCount(state) < totalPlannedSets(state);
}

/* ----------------------------- transitions ------------------------------ */

export interface CompleteSetInput {
  readonly exerciseIndex: number;
  readonly setNumber: number;
  readonly logged: LoggedSetValue;
  /** Epoch ms at completion; anchors the rest timer. Caller-supplied for purity. */
  readonly nowMs: number;
}

/**
 * Marks a set complete with the logged value and starts the rest timer for that
 * exercise. Completing another set restarts the timer using that exercise's
 * target rest. Existing completed sets remain distinct (their values preserved)
 * and this never touches browser storage. Pure: returns a new state.
 */
export function completeSet(
  state: ActiveWorkoutState,
  input: CompleteSetInput,
): ActiveWorkoutState {
  const next = updateSet(state, input.exerciseIndex, input.setNumber, (set) => ({
    ...set,
    status: 'completed',
    logged: input.logged,
  }));
  const exercise = state.exercises[input.exerciseIndex];
  if (exercise === undefined) return next;
  return {
    ...next,
    rest: startRest(exercise, input.exerciseIndex, input.setNumber, input.nowMs),
  };
}

/**
 * Reopens a completed set for editing, preserving its last logged value as the
 * starting edit. Completed and incomplete sets remain distinct: an incomplete
 * set is unaffected. Does not touch the rest timer — editing a completed set
 * does not restart rest.
 */
export function editCompletedSet(
  state: ActiveWorkoutState,
  exerciseIndex: number,
  setNumber: number,
): ActiveWorkoutState {
  return updateSet(state, exerciseIndex, setNumber, (set) =>
    set.status === 'completed' ? { ...set, status: 'incomplete' } : set,
  );
}

/**
 * Moves the active exercise by a delta, clamped to the exercise range. Logged
 * sets and the active rest timer are preserved because state is carried over
 * unchanged apart from the index and finish-confirmation flag.
 */
export function moveCurrentExercise(
  state: ActiveWorkoutState,
  delta: number,
): ActiveWorkoutState {
  if (delta === 0) return state;
  const next = clampExerciseIndex(state, state.currentExerciseIndex + delta);
  if (next === state.currentExerciseIndex) return state;
  return { ...state, currentExerciseIndex: next, confirmingFinish: false };
}

/**
 * Shows the inline finish-confirmation control (no window.confirm). Pure.
 */
export function requestFinish(state: ActiveWorkoutState): ActiveWorkoutState {
  if (state.stage !== 'active') return state;
  return { ...state, confirmingFinish: true };
}

/** Cancels the inline finish-confirmation control. */
export function cancelFinish(state: ActiveWorkoutState): ActiveWorkoutState {
  if (!state.confirmingFinish) return state;
  return { ...state, confirmingFinish: false };
}

/**
 * Finishes the workout. Allowed even with incomplete sets (the UI gates it
 * behind an inline confirmation). Captures a local summary; cloud save is a
 * later task. Pure.
 */
export function finishWorkout(state: ActiveWorkoutState): ActiveWorkoutState {
  if (state.stage !== 'active') return state;
  return {
    ...state,
    stage: 'finished',
    confirmingFinish: false,
    summary: {
      completedSets: completedSetCount(state),
      totalSets: totalPlannedSets(state),
    },
  };
}

/* --------------------------- rest-timer controls --------------------------- */

/**
 * Removes {@link REST_ADJUSTMENT_SECONDS} from the active rest, clamped so
 * remaining time never drops below 0. No-op when no rest is active. `nowMs` is
 * caller-supplied for purity.
 */
export function reduceRest(state: ActiveWorkoutState, nowMs: number): ActiveWorkoutState {
  if (state.rest === null) return state;
  return { ...state, rest: subtractRestSeconds(state.rest, nowMs) };
}

/**
 * Adds {@link REST_ADJUSTMENT_SECONDS} to the active rest, extending it. No-op
 * when no rest is active.
 */
export function extendRest(state: ActiveWorkoutState): ActiveWorkoutState {
  if (state.rest === null) return state;
  return { ...state, rest: addRestSeconds(state.rest) };
}

/**
 * Completes the active rest immediately (remaining -> 0). No-op when no rest is
 * active. `nowMs` is caller-supplied for purity.
 */
export function skipActiveRest(state: ActiveWorkoutState, nowMs: number): ActiveWorkoutState {
  if (state.rest === null) return state;
  return { ...state, rest: skipRest(state.rest, nowMs) };
}

/**
 * Clears idle rest state once the user dismisses an expired timer. No-op when
 * no rest is active.
 */
export function clearRest(state: ActiveWorkoutState): ActiveWorkoutState {
  if (state.rest === null) return state;
  return { ...state, rest: null };
}

function updateSet(
  state: ActiveWorkoutState,
  exerciseIndex: number,
  setNumber: number,
  apply: (set: ActiveSet) => ActiveSet,
): ActiveWorkoutState {
  const exerciseSets = state.sets[exerciseIndex];
  if (exerciseSets === undefined) return state;
  const setIndex = exerciseSets.findIndex((set) => set.setNumber === setNumber);
  if (setIndex === -1) return state;
  const nextExerciseSets = exerciseSets.map((set, index) =>
    index === setIndex ? apply(set) : set,
  );
  const nextSets = state.sets.map((rows, index) =>
    index === exerciseIndex ? nextExerciseSets : rows,
  );
  return { ...state, sets: nextSets };
}

function clampExerciseIndex(state: ActiveWorkoutState, index: number): number {
  const max = state.exercises.length - 1;
  if (index < 0) return 0;
  if (index > max) return max;
  return index;
}
