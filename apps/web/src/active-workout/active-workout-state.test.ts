import { describe, expect, it } from 'vitest';
import {
  buildActiveWorkoutState,
  canGoToNextExercise,
  canGoToPreviousExercise,
  cancelFinish,
  clearRest,
  completeSet,
  completedSetCount,
  currentExercise,
  editCompletedSet,
  restoreActiveWorkoutState,
  extendRest,
  finishWorkout,
  hasIncompleteSets,
  isExerciseComplete,
  moveCurrentExercise,
  reduceRest,
  requestFinish,
  skipActiveRest,
  totalPlannedSets,
} from './active-workout-state';
import { workoutReviewFixture } from '../workout/workout-review';

/** Fixed epoch ms supplied to transitions that need a timestamp anchor. */
const NOW = 1_700_000_000_000;

function built() {
  return buildActiveWorkoutState(workoutReviewFixture);
}

/** Reads a set row; the fixture always provides the requested row in these tests. */
function setAt(state: ReturnType<typeof built>, exerciseIndex: number, setNumber: number) {
  const row = state.sets[exerciseIndex]?.[setNumber - 1];
  if (row === undefined) {
    throw new Error(`test fixture missing set ${exerciseIndex}:${setNumber}`);
  }
  return row;
}

/** Logged value used across these tests. */
const logged = { weight: 20, reps: 8, rir: 2 } as const;

it('restores persisted completed sets without starting a rest timer', () => {
  const state = restoreActiveWorkoutState(workoutReviewFixture, [
    { exerciseIndex: 0, setNumber: 1, logged: { weight: 22.5, reps: 9, rir: 0 } },
  ]);
  expect(setAt(state, 0, 1)).toMatchObject({
    status: 'completed',
    logged: { weight: 22.5, reps: 9, rir: 0 },
  });
  expect(state.rest).toBeNull();
});

describe('fixture build', () => {
  it('creates 16 planned sets across the four exercises', () => {
    const state = built();
    expect(totalPlannedSets(state)).toBe(16);
    expect(state.exercises).toHaveLength(4);
    expect(state.exercises.every((e) => e.plannedSets.length === 4)).toBe(true);
  });

  it('starts at current exercise index 0', () => {
    const state = built();
    expect(state.currentExerciseIndex).toBe(0);
    expect(currentExercise(state).name).toBe('Dumbbell Bench Press');
  });

  it('starts with every set incomplete and no logged values', () => {
    const state = built();
    for (const exerciseSets of state.sets) {
      for (const set of exerciseSets) {
        expect(set.status).toBe('incomplete');
        expect(set.logged).toBeNull();
      }
    }
    expect(completedSetCount(state)).toBe(0);
  });

  it('starts with no active rest timer', () => {
    expect(built().rest).toBeNull();
  });
});

describe('completing and editing sets', () => {
  it('completes a set and stores the logged value', () => {
    let state = built();
    state = completeSet(state, {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    const set = setAt(state, 0, 1);
    expect(set.status).toBe('completed');
    expect(set.logged).toEqual({ weight: 20, reps: 8, rir: 2 });
    expect(completedSetCount(state)).toBe(1);
  });

  it('keeps completed and incomplete sets distinct', () => {
    let state = built();
    state = completeSet(state, {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    expect(setAt(state, 0, 1).status).toBe('completed');
    expect(setAt(state, 0, 2).status).toBe('incomplete');
  });

  it('allows editing a completed set back to incomplete', () => {
    let state = built();
    state = completeSet(state, {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    state = editCompletedSet(state, 0, 1);
    expect(setAt(state, 0, 1).status).toBe('incomplete');
    // Re-editing an already-incomplete set is a no-op.
    state = editCompletedSet(state, 0, 1);
    expect(setAt(state, 0, 1).status).toBe('incomplete');
  });
});

describe('progress derivation', () => {
  it('derives completed-set progress from state', () => {
    let state = built();
    expect(completedSetCount(state)).toBe(0);
    state = completeSet(state, { exerciseIndex: 0, setNumber: 1, logged, nowMs: NOW });
    state = completeSet(state, { exerciseIndex: 0, setNumber: 2, logged, nowMs: NOW });
    expect(completedSetCount(state)).toBe(2);
    expect(totalPlannedSets(state)).toBe(16);
  });

  it('marks an exercise complete when all its planned sets are complete', () => {
    let state = built();
    for (let setNumber = 1; setNumber <= 4; setNumber += 1) {
      state = completeSet(state, { exerciseIndex: 0, setNumber, logged, nowMs: NOW });
    }
    expect(isExerciseComplete(state, 0)).toBe(true);
    expect(isExerciseComplete(state, 1)).toBe(false);
  });

  it('reports incomplete sets until everything is logged', () => {
    let state = built();
    expect(hasIncompleteSets(state)).toBe(true);
    for (let exerciseIndex = 0; exerciseIndex < 4; exerciseIndex += 1) {
      for (let setNumber = 1; setNumber <= 4; setNumber += 1) {
        state = completeSet(state, { exerciseIndex, setNumber, logged, nowMs: NOW });
      }
    }
    expect(hasIncompleteSets(state)).toBe(false);
    expect(completedSetCount(state)).toBe(16);
  });
});

describe('exercise navigation', () => {
  it('moves forward and back while preserving logged sets', () => {
    let state = built();
    state = completeSet(state, {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });

    state = moveCurrentExercise(state, 1);
    expect(currentExercise(state).name).toBe('Lat Pulldown');
    // Logged value on the first exercise is preserved.
    expect(setAt(state, 0, 1).logged).toEqual({ weight: 20, reps: 8, rir: 2 });

    state = moveCurrentExercise(state, -1);
    expect(currentExercise(state).name).toBe('Dumbbell Bench Press');
    expect(setAt(state, 0, 1).status).toBe('completed');
  });

  it('clamps the active index at the boundaries', () => {
    let state = built();
    expect(canGoToPreviousExercise(state)).toBe(false);
    state = moveCurrentExercise(state, -1);
    expect(state.currentExerciseIndex).toBe(0);

    state = moveCurrentExercise(state, 5);
    expect(state.currentExerciseIndex).toBe(3);
    expect(canGoToNextExercise(state)).toBe(false);
  });
});

describe('finish semantics', () => {
  it('finish with incomplete sets requires inline confirmation, not immediate finish', () => {
    let state = built();
    state = completeSet(state, {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    expect(hasIncompleteSets(state)).toBe(true);

    // Requesting finish only shows confirmation; it does not finish.
    state = requestFinish(state);
    expect(state.stage).toBe('active');
    expect(state.confirmingFinish).toBe(true);

    // Cancelling returns to logging.
    state = cancelFinish(state);
    expect(state.confirmingFinish).toBe(false);
    expect(state.stage).toBe('active');
  });

  it('confirming finishes and captures a local summary', () => {
    let state = built();
    state = completeSet(state, {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    state = requestFinish(state);
    state = finishWorkout(state);
    expect(state.stage).toBe('finished');
    expect(state.summary).toEqual({ completedSets: 1, totalSets: 16 });
  });

  it('allows finishing even when all sets are complete', () => {
    let state = built();
    for (let exerciseIndex = 0; exerciseIndex < 4; exerciseIndex += 1) {
      for (let setNumber = 1; setNumber <= 4; setNumber += 1) {
        state = completeSet(state, { exerciseIndex, setNumber, logged, nowMs: NOW });
      }
    }
    state = requestFinish(state);
    state = finishWorkout(state);
    expect(state.stage).toBe('finished');
    expect(state.summary).toEqual({ completedSets: 16, totalSets: 16 });
  });
});

describe('rest-timer integration', () => {
  it('completing a set starts the rest timer for that exercise', () => {
    const state = completeSet(built(), {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    expect(state.rest).not.toBeNull();
    expect(state.rest?.exerciseIndex).toBe(0);
    expect(state.rest?.setNumber).toBe(1);
    // Dumbbell Bench Press is compound-style: 120s default.
    expect(state.rest?.targetSeconds).toBe(120);
  });

  it('completing another set restarts the rest timer', () => {
    let state = completeSet(built(), {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    const firstStartedAt = state.rest?.startedAtMs;
    state = completeSet(state, {
      exerciseIndex: 1,
      setNumber: 1,
      logged,
      nowMs: NOW + 60_000,
    });
    expect(state.rest?.exerciseIndex).toBe(1);
    expect(state.rest?.startedAtMs).toBe(NOW + 60_000);
    expect(state.rest?.startedAtMs).not.toBe(firstStartedAt);
  });

  it('editing a completed set does not restart rest', () => {
    let state = completeSet(built(), {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    const restBefore = state.rest;
    state = editCompletedSet(state, 0, 1);
    expect(state.rest).toBe(restBefore);
  });

  it('exercise navigation preserves the active timer state', () => {
    let state = completeSet(built(), {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    const restBefore = state.rest;
    state = moveCurrentExercise(state, 1);
    expect(state.rest).toBe(restBefore);
    state = moveCurrentExercise(state, -1);
    expect(state.rest).toBe(restBefore);
  });

  it('rest controls adjust the active timer', () => {
    let state = completeSet(built(), {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    state = extendRest(state);
    expect(state.rest?.endsAtMs).toBe(NOW + 120_000 + 15_000);
    state = reduceRest(state, NOW);
    expect(state.rest?.endsAtMs).toBe(NOW + 120_000);
    state = skipActiveRest(state, NOW);
    expect(state.rest?.endsAtMs).toBe(NOW);
  });

  it('clearRest clears an expired timer', () => {
    let state = completeSet(built(), {
      exerciseIndex: 0,
      setNumber: 1,
      logged,
      nowMs: NOW,
    });
    state = clearRest(state);
    expect(state.rest).toBeNull();
  });
});
