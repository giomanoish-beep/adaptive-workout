import { useCallback, useMemo, useReducer } from 'react';
import {
  beginWorkoutGeneration,
  completeWorkoutGeneration,
  editWorkoutRequest,
  initialWorkoutFlowState,
  toggleReplaceExercise,
  type WorkoutFlowState,
} from './workout-flow';
import { isWorkoutRequestValid, type WorkoutRequestDraft } from './workout-request';
import { workoutReviewFixture, type WorkoutReview } from './workout-review';
import { WorkoutRequestForm } from './WorkoutRequestForm';
import { WorkoutReview as WorkoutReviewView } from './WorkoutReview';

/**
 * Orchestrates the Workout request and review flow (WEB_APP-003). Holds the
 * pure flow state in a reducer and renders the request form or the review
 * screen. Generation is UI-only in this task: an injected async function
 * resolves the deterministic review fixture (immediately by default). No engine,
 * Supabase, or AI calls occur in the browser (docs/ARCHITECTURE.md).
 *
 * Navigation stays owned by the parent: `onStartWorkout` is emitted so AppNav
 * can route to the existing `active_workout` focused-flow route.
 */
export interface WorkoutFlowProps {
  /** Resolves the review for a valid draft. Defaults to the local fixture. */
  readonly generateReview?: (draft: WorkoutRequestDraft) => Promise<WorkoutReview>;
  readonly onStartWorkout: () => void;
}

type FlowAction =
  | { readonly type: 'updateDraft'; readonly draft: WorkoutRequestDraft }
  | { readonly type: 'begin' }
  | { readonly type: 'complete'; readonly review: WorkoutReview }
  | { readonly type: 'edit' }
  | { readonly type: 'toggleReplace'; readonly position: number };

function flowReducer(state: WorkoutFlowState, action: FlowAction): WorkoutFlowState {
  switch (action.type) {
    case 'updateDraft':
      return { stage: 'idle', draft: action.draft };
    case 'begin':
      return beginWorkoutGeneration(state);
    case 'complete':
      return completeWorkoutGeneration(state, action.review);
    case 'edit':
      return editWorkoutRequest(state);
    case 'toggleReplace':
      return toggleReplaceExercise(state, action.position);
  }
}

export function WorkoutFlow({ generateReview, onStartWorkout }: WorkoutFlowProps) {
  const [state, dispatch] = useReducer(flowReducer, initialWorkoutFlowState);
  const resolveReview = useMemo(
    () => generateReview ?? defaultGenerateReview,
    [generateReview],
  );

  const handleDraftChange = useCallback((draft: WorkoutRequestDraft) => {
    dispatch({ type: 'updateDraft', draft });
  }, []);

  const handleGenerate = useCallback(() => {
    if (!isWorkoutRequestValid(state.draft)) return;
    dispatch({ type: 'begin' });
    void resolveReview(state.draft).then((review) => {
      dispatch({ type: 'complete', review });
    });
  }, [resolveReview, state.draft]);

  const handleEdit = useCallback(() => {
    dispatch({ type: 'edit' });
  }, []);

  if (state.stage === 'generating') {
    return (
      <section className="workout-flow workout-flow--generating" aria-busy="true">
        <p className="eyebrow">Workout</p>
        <h2>Building your session…</h2>
        <p className="workout-flow__loading">Arranging exercises and volume.</p>
      </section>
    );
  }

  if (state.stage === 'review') {
    return (
      <WorkoutReviewView
        review={state.review}
        replacingPosition={state.replacingPosition}
        onReplaceExercise={(position) => dispatch({ type: 'toggleReplace', position })}
        onStartWorkout={onStartWorkout}
        onEditRequest={handleEdit}
      />
    );
  }

  return (
    <WorkoutRequestForm
      draft={state.draft}
      onChange={handleDraftChange}
      onGenerate={handleGenerate}
    />
  );
}

/** Default generator resolves the deterministic local review fixture. */
async function defaultGenerateReview(_draft: WorkoutRequestDraft): Promise<WorkoutReview> {
  return workoutReviewFixture;
}
