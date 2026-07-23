import type { AppRoute } from '../navigation/routes';
import { initialWorkoutRequestDraft, type WorkoutRequestDraft } from './workout-request';
import type { WorkoutReview } from './workout-review';
import { replaceReviewExercise, type WorkoutReviewExercise } from './workout-review';

/**
 * Pure, React-free state machine for the Workout request and review flow
 * (WEB_APP-003). This task is UI and pure web-flow state only — no engine,
 * Supabase, or AI calls from the browser (docs/ARCHITECTURE.md).
 *
 * Stages:
 *   idle (request form) → generating → review ↻
 *                                          ↘ idle (edit request, values preserved)
 *
 * The state carries the request draft at every stage so an "Edit request"
 * return preserves the previously selected values in memory only (no
 * localStorage/sessionStorage/IndexedDB). The review fixture is injected, not
 * produced here, so the pure transitions stay free of timers and async.
 */

/** The focused-flow route Start workout navigates to (existing route). */
export const startWorkoutTargetRoute: AppRoute = 'active_workout';

export const workoutFlowStages = ['idle', 'generating', 'review'] as const;
export type WorkoutFlowStage = (typeof workoutFlowStages)[number];

export interface WorkoutFlowIdle {
  readonly stage: 'idle';
  readonly draft: WorkoutRequestDraft;
  /** Non-empty when a server generation attempt failed. */
  readonly generationError?: string | undefined;
}

export interface WorkoutFlowGenerating {
  readonly stage: 'generating';
  readonly draft: WorkoutRequestDraft;
}

export interface WorkoutFlowReview {
  readonly stage: 'review';
  readonly draft: WorkoutRequestDraft;
  readonly review: WorkoutReview;
  /** Position of the exercise with an active Replace placeholder, or null. */
  readonly replacingPosition: number | null;
  readonly replacementError: string | null;
  readonly replacementHistory: Readonly<Record<number, readonly string[]>>;
}

export type WorkoutFlowState = WorkoutFlowIdle | WorkoutFlowGenerating | WorkoutFlowReview;

export const initialWorkoutFlowState: WorkoutFlowState = {
  stage: 'idle',
  draft: initialWorkoutRequestDraft,
};

/** Returns the draft owned by a flow state (present at every stage). */
export function flowDraft(state: WorkoutFlowState): WorkoutRequestDraft {
  return state.draft;
}

/**
 * Replaces the draft while staying in `idle`. Editing from the review screen
 * discards the in-memory review and returns to the request form with the
 * supplied values preserved.
 */
export function updateWorkoutFlowDraft(
  _state: WorkoutFlowState,
  draft: WorkoutRequestDraft,
): WorkoutFlowState {
  return { stage: 'idle', draft };
}

/**
 * Transitions to `generating`. Pure — no timer is started here. The React
 * layer resolves the injected review fixture (immediately or via an injected
 * async function) and then calls {@link completeWorkoutGeneration}.
 */
export function beginWorkoutGeneration(state: WorkoutFlowState): WorkoutFlowState {
  return { stage: 'generating', draft: state.draft };
}

/**
 * Transitions to `review` with the resolved review. No Replace placeholder is
 * active initially.
 */
export function completeWorkoutGeneration(
  state: WorkoutFlowState,
  review: WorkoutReview,
): WorkoutFlowState {
  return {
    stage: 'review',
    draft: state.draft,
    review,
    replacingPosition: null,
    replacementError: null,
    replacementHistory: {},
  };
}

/**
 * Returns to `idle`, keeping the draft so request values are preserved.
 */
export function editWorkoutRequest(state: WorkoutFlowState): WorkoutFlowState {
  return { stage: 'idle', draft: state.draft };
}

/**
 * UI-only Replace selection. Toggles a non-blocking placeholder state on an
 * exercise card. No substitution logic is performed in this task.
 */
export function toggleReplaceExercise(state: WorkoutFlowState, position: number): WorkoutFlowState {
  if (state.stage !== 'review') {
    return state;
  }
  const replacingPosition = state.replacingPosition === position ? null : position;
  return { ...state, replacingPosition };
}

export function beginExerciseReplacement(
  state: WorkoutFlowState,
  position: number,
): WorkoutFlowState {
  if (state.stage !== 'review') return state;
  return { ...state, replacingPosition: position, replacementError: null };
}

export function completeExerciseReplacement(
  state: WorkoutFlowState,
  position: number,
  replacement: Pick<
    WorkoutReviewExercise,
    'exerciseId' | 'exerciseVersion' | 'name' | 'progression' | 'loadPrescription'
  >,
): WorkoutFlowState {
  if (state.stage !== 'review') return state;
  const existingExercise = state.review.exercises.find(
    (exercise) => exercise.position === position,
  );
  const previousId = existingExercise?.exerciseId;
  const review = existingExercise
    ? replaceReviewExercise(state.review, position, replacement)
    : state.review;
  return {
    ...state,
    review,
    replacingPosition: null,
    replacementError: null,
    replacementHistory: {
      ...state.replacementHistory,
      [position]: previousId
        ? [...(state.replacementHistory[position] ?? []), previousId]
        : (state.replacementHistory[position] ?? []),
    },
  };
}

export function failExerciseReplacement(
  state: WorkoutFlowState,
  message: string,
): WorkoutFlowState {
  if (state.stage !== 'review') return state;
  return { ...state, replacingPosition: null, replacementError: message };
}

/**
 * Clears any active Replace placeholder. Pure.
 */
export function clearReplaceExercise(state: WorkoutFlowState): WorkoutFlowState {
  if (state.stage !== 'review' || state.replacingPosition === null) {
    return state;
  }
  return { ...state, replacingPosition: null };
}
