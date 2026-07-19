import { describe, expect, it } from 'vitest';
import {
  beginWorkoutGeneration,
  clearReplaceExercise,
  completeWorkoutGeneration,
  beginExerciseReplacement,
  completeExerciseReplacement,
  failExerciseReplacement,
  editWorkoutRequest,
  flowDraft,
  initialWorkoutFlowState,
  startWorkoutTargetRoute,
  toggleReplaceExercise,
  updateWorkoutFlowDraft,
} from './workout-flow';
import {
  setWorkoutRequestDuration,
  setWorkoutRequestEquipment,
  toggleWorkoutRequestMuscle,
} from './workout-request';
import { workoutReviewFixture } from './workout-review';

function requestedDraft() {
  let draft = flowDraft(initialWorkoutFlowState);
  draft = toggleWorkoutRequestMuscle(draft, 'chest');
  draft = toggleWorkoutRequestMuscle(draft, 'back');
  draft = setWorkoutRequestDuration(draft, 45);
  draft = setWorkoutRequestEquipment(draft, 'full-gym');
  return draft;
}

describe('start workout navigation target', () => {
  it('targets the existing active_workout focused-flow route', () => {
    expect(startWorkoutTargetRoute).toBe('active_workout');
  });
});

describe('flow state machine', () => {
  it('starts idle with the initial draft', () => {
    expect(initialWorkoutFlowState.stage).toBe('idle');
    expect(flowDraft(initialWorkoutFlowState).muscleIds).toEqual([]);
  });

  it('preserves request values through an edit cycle', () => {
    let state = initialWorkoutFlowState;
    const draft = requestedDraft();
    state = updateWorkoutFlowDraft(state, draft);
    state = beginWorkoutGeneration(state);
    state = completeWorkoutGeneration(state, workoutReviewFixture);
    expect(state.stage).toBe('review');

    // Edit request returns to idle and keeps the same selected muscles.
    state = editWorkoutRequest(state);
    expect(state.stage).toBe('idle');
    expect(flowDraft(state).muscleIds).toEqual(['chest', 'back']);
    expect(flowDraft(state).durationMinutes).toBe(45);
    expect(flowDraft(state).equipmentId).toBe('full-gym');
  });

  it('transitions request -> generating -> review', () => {
    let state = updateWorkoutFlowDraft(initialWorkoutFlowState, requestedDraft());

    state = beginWorkoutGeneration(state);
    expect(state.stage).toBe('generating');
    // The draft stays visible while generating.
    expect(flowDraft(state).muscleIds).toEqual(['chest', 'back']);

    state = completeWorkoutGeneration(state, workoutReviewFixture);
    expect(state.stage).toBe('review');
    if (state.stage === 'review') {
      expect(state.review.title).toBe('Chest + Back');
      expect(state.replacingPosition).toBeNull();
    }
  });

  it('keeps the originating draft on the review stage', () => {
    const draft = requestedDraft();
    const generating = beginWorkoutGeneration({ stage: 'idle', draft });
    const review = completeWorkoutGeneration(generating, workoutReviewFixture);
    expect(flowDraft(review)).toEqual(draft);
  });
});

describe('workout-only exercise replacement', () => {
  it('toggles a replace placeholder on a review exercise', () => {
    let state = completeWorkoutGeneration(
      beginWorkoutGeneration({ stage: 'idle', draft: requestedDraft() }),
      workoutReviewFixture,
    );
    state = toggleReplaceExercise(state, 1);
    if (state.stage === 'review') {
      expect(state.replacingPosition).toBe(1);
    }
  });

  it('clears the replace placeholder', () => {
    let state = completeWorkoutGeneration(
      beginWorkoutGeneration({ stage: 'idle', draft: requestedDraft() }),
      workoutReviewFixture,
    );
    state = toggleReplaceExercise(state, 2);
    state = clearReplaceExercise(state);
    if (state.stage === 'review') {
      expect(state.replacingPosition).toBeNull();
    }
  });

  it('is a no-op outside the review stage', () => {
    const idle = initialWorkoutFlowState;
    expect(toggleReplaceExercise(idle, 1)).toBe(idle);
    expect(clearReplaceExercise(idle)).toBe(idle);
  });

  it('updates the review while preserving the prescription and tracks the previous exercise', () => {
    let state = completeWorkoutGeneration(
      beginWorkoutGeneration({ stage: 'idle', draft: requestedDraft() }),
      workoutReviewFixture,
    );
    state = beginExerciseReplacement(state, 1);
    state = completeExerciseReplacement(state, 1, {
      exerciseId: 'replacement-1',
      exerciseVersion: 2,
      name: 'Incline Dumbbell Bench Press',
      progression: undefined,
    });
    expect(state.stage).toBe('review');
    if (state.stage === 'review') {
      expect(state.review.exercises[0]).toMatchObject({
        name: 'Incline Dumbbell Bench Press',
        sets: 4,
        reps: { minimum: 8, maximum: 10 },
        rir: 2,
      });
      expect(state.replacementHistory[1]).toEqual([]);
      expect(state.replacingPosition).toBeNull();
    }
  });

  it('surfaces a controlled replacement failure', () => {
    let state = completeWorkoutGeneration(
      beginWorkoutGeneration({ stage: 'idle', draft: requestedDraft() }),
      workoutReviewFixture,
    );
    state = beginExerciseReplacement(state, 1);
    state = failExerciseReplacement(state, 'No valid substitute is available.');
    if (state.stage === 'review') {
      expect(state.replacementError).toBe('No valid substitute is available.');
      expect(state.replacingPosition).toBeNull();
    }
  });
});
