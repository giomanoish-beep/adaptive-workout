import { useCallback, useReducer } from 'react';
import {
  beginWorkoutGeneration,
  beginExerciseReplacement,
  completeWorkoutGeneration,
  completeExerciseReplacement,
  editWorkoutRequest,
  initialWorkoutFlowState,
  toggleReplaceExercise,
  failExerciseReplacement,
  type WorkoutFlowState,
} from './workout-flow';
import { isWorkoutRequestValid, type WorkoutRequestDraft } from './workout-request';
import { type WorkoutReview } from './workout-review';
import { WorkoutRequestForm } from './WorkoutRequestForm';
import { WorkoutReview as WorkoutReviewView } from './WorkoutReview';

/**
 * Orchestrates the Workout request and review flow (V1-002).
 *
 * Production path: receives a `generateReview` resolver injected by the parent
 * (AppNav) which calls the deployed Edge Function via the browser-safe gateway.
 * No engine, Supabase service-role, or AI calls in the browser.
 * The fixture is NOT used in production; it is only retained for E2E test seams.
 *
 * Navigation stays owned by the parent.
 */
export interface WorkoutFlowProps {
  /** Resolver injected by the parent. In production, calls the real gateway. */
  readonly generateReview: (draft: WorkoutRequestDraft) => Promise<WorkoutReview>;
  readonly onStartWorkout: (review: WorkoutReview) => void;
  readonly replaceExercise: (
    review: WorkoutReview,
    draft: WorkoutRequestDraft,
    position: number,
    excludedReplacementIds: readonly string[],
  ) => Promise<WorkoutReview['exercises'][number]>;
}

type FlowAction =
  | { readonly type: 'updateDraft'; readonly draft: WorkoutRequestDraft }
  | { readonly type: 'begin' }
  | { readonly type: 'complete'; readonly review: WorkoutReview }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'edit' }
  | { readonly type: 'toggleReplace'; readonly position: number }
  | { readonly type: 'beginReplace'; readonly position: number }
  | {
      readonly type: 'completeReplace';
      readonly position: number;
      readonly replacement: WorkoutReview['exercises'][number];
    }
  | { readonly type: 'replaceError'; readonly message: string };

function flowReducer(state: WorkoutFlowState, action: FlowAction): WorkoutFlowState {
  switch (action.type) {
    case 'updateDraft':
      return { stage: 'idle', draft: action.draft };
    case 'begin':
      return beginWorkoutGeneration(state);
    case 'complete':
      return completeWorkoutGeneration(state, action.review);
    case 'error':
      return { ...state, stage: 'idle', generationError: action.message };
    case 'edit':
      return editWorkoutRequest(state);
    case 'toggleReplace':
      return toggleReplaceExercise(state, action.position);
    case 'beginReplace':
      return beginExerciseReplacement(state, action.position);
    case 'completeReplace':
      return completeExerciseReplacement(state, action.position, action.replacement);
    case 'replaceError':
      return failExerciseReplacement(state, action.message);
  }
}

export function WorkoutFlow({ generateReview, onStartWorkout, replaceExercise }: WorkoutFlowProps) {
  const [state, dispatch] = useReducer(flowReducer, initialWorkoutFlowState);

  const handleDraftChange = useCallback((draft: WorkoutRequestDraft) => {
    dispatch({ type: 'updateDraft', draft });
  }, []);

  const handleGenerate = useCallback(() => {
    if (!isWorkoutRequestValid(state.draft)) return;
    dispatch({ type: 'begin' });

    void generateReview(state.draft).then(
      (review) => dispatch({ type: 'complete', review }),
      () =>
        dispatch({
          type: 'error',
          message: 'Workout generation failed. Please try again.',
        }),
    );
  }, [generateReview, state.draft]);

  const handleEdit = useCallback(() => {
    dispatch({ type: 'edit' });
  }, []);

  const handleReplace = useCallback(
    (position: number) => {
      if (state.stage !== 'review' || state.replacingPosition !== null) return;
      const review = state.review;
      const excluded = state.replacementHistory[position] ?? [];
      dispatch({ type: 'beginReplace', position });
      void replaceExercise(review, state.draft, position, excluded).then(
        (replacement) => dispatch({ type: 'completeReplace', position, replacement }),
        (error: unknown) =>
          dispatch({
            type: 'replaceError',
            message:
              error instanceof Error
                ? error.message
                : 'No valid substitute is available for this exercise.',
          }),
      );
    },
    [replaceExercise, state],
  );

  if (state.stage === 'generating') {
    return (
      <section className="workout-flow workout-flow--generating" aria-busy="true">
        <p className="eyebrow">Workout</p>
        <h2>Building your session…</h2>
        <p className="workout-flow__loading">Arranging exercises and volume.</p>
      </section>
    );
  }

  if (state.stage === 'review' && state.review) {
    const review = state.review;
    const handleStart = () => onStartWorkout(review);
    return (
      <WorkoutReviewView
        review={state.review}
        replacingPosition={state.replacingPosition}
        replacementError={state.replacementError}
        onReplaceExercise={handleReplace}
        onStartWorkout={handleStart}
        onEditRequest={handleEdit}
      />
    );
  }

  // Show error state inline above the form
  const idleState = state.stage === 'idle' ? (state as { generationError?: string }) : null;
  const generationError = idleState?.generationError;

  return (
    <div>
      {generationError && (
        <div className="workout-flow__error" role="alert">
          <p>{generationError}</p>
          <button type="button" className="workout-flow__retry-btn" onClick={handleGenerate}>
            Retry
          </button>
        </div>
      )}
      <WorkoutRequestForm
        draft={state.draft}
        onChange={handleDraftChange}
        onGenerate={handleGenerate}
      />
    </div>
  );
}
