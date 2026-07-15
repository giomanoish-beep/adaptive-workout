import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  buildActiveWorkoutState,
  cancelFinish,
  canGoToNextExercise,
  canGoToPreviousExercise,
  clearRest,
  completeSet,
  completedSetCount,
  currentExercise,
  editCompletedSet,
  extendRest,
  finishWorkout,
  hasIncompleteSets,
  isExerciseComplete,
  moveCurrentExercise,
  reduceRest,
  requestFinish,
  skipActiveRest,
  totalPlannedSets,
  type ActiveWorkoutState,
} from './active-workout-state';
import {
  formatRestClock,
  isRestExpired,
  remainingRestSeconds,
} from './active-workout-rest';
import {
  canCompleteSetEntry,
  emptySetEntryInput,
  toLoggedSet,
  validateSetEntry,
  type SetEntryInput,
  type SetEntryValidationResult,
} from './active-workout-validation';
import { workoutReviewFixture } from '../workout/workout-review';

/**
 * Active workout screen for the focused `active_workout` route (WEB_APP-004).
 *
 * UI and pure in-memory React flow only — cloud persistence is wired later.
 * Set-entry text for in-progress sets lives in component state; completing a
 * set normalizes and stores the value via the pure state module. No browser
 * storage is used (docs/ARCHITECTURE.md).
 *
 * Navigation stays owned by the parent: `onExit` is emitted so AppNav can
 * return through its existing focused-flow exit callback.
 */
export interface ActiveWorkoutProps {
  readonly onExit: () => void;
}

type StateAction =
  | { readonly type: 'complete'; readonly exerciseIndex: number; readonly setNumber: number; readonly input: SetEntryInput; readonly nowMs: number }
  | { readonly type: 'edit'; readonly exerciseIndex: number; readonly setNumber: number }
  | { readonly type: 'move'; readonly delta: number }
  | { readonly type: 'reduceRest'; readonly nowMs: number }
  | { readonly type: 'extendRest' }
  | { readonly type: 'skipRest'; readonly nowMs: number }
  | { readonly type: 'clearRest' }
  | { readonly type: 'requestFinish' }
  | { readonly type: 'cancelFinish' }
  | { readonly type: 'finish' };

function stateReducer(state: ActiveWorkoutState, action: StateAction): ActiveWorkoutState {
  switch (action.type) {
    case 'complete':
      return completeSet(state, {
        exerciseIndex: action.exerciseIndex,
        setNumber: action.setNumber,
        logged: toLoggedSet(action.input),
        nowMs: action.nowMs,
      });
    case 'edit':
      return editCompletedSet(state, action.exerciseIndex, action.setNumber);
    case 'move':
      return moveCurrentExercise(state, action.delta);
    case 'reduceRest':
      return reduceRest(state, action.nowMs);
    case 'extendRest':
      return extendRest(state);
    case 'skipRest':
      return skipActiveRest(state, action.nowMs);
    case 'clearRest':
      return clearRest(state);
    case 'requestFinish':
      return requestFinish(state);
    case 'cancelFinish':
      return cancelFinish(state);
    case 'finish':
      return finishWorkout(state);
  }
}

/** Input key for a set row, stable across renders for the same set. */
function setKey(exerciseIndex: number, setNumber: number): string {
  return `${exerciseIndex}:${setNumber}`;
}

export function ActiveWorkout({ onExit }: ActiveWorkoutProps) {
  const [state, dispatch] = useReducer(
    stateReducer,
    workoutReviewFixture,
    buildActiveWorkoutState,
  );
  // In-progress set-entry text, keyed by exercise:set. Cleared on completion.
  const [inputs, setInputs] = useState<ReadonlyMap<string, SetEntryInput>>(new Map());

  const completed = completedSetCount(state);
  const total = totalPlannedSets(state);
  const exercise = currentExercise(state);
  const exerciseIndex = state.currentExerciseIndex;
  const sets = state.sets[exerciseIndex] ?? [];

  const setEntry = useCallback(
    (setNumber: number): SetEntryInput => {
      return inputs.get(setKey(exerciseIndex, setNumber)) ?? emptySetEntryInput;
    },
    [inputs, exerciseIndex],
  );

  const updateEntry = useCallback(
    (setNumber: number, patch: Partial<SetEntryInput>) => {
      setInputs((prev) => {
        const key = setKey(exerciseIndex, setNumber);
        const current = prev.get(key) ?? emptySetEntryInput;
        const next: SetEntryInput = { ...current, ...patch };
        const map = new Map(prev);
        map.set(key, next);
        return map;
      });
    },
    [exerciseIndex],
  );

  const handleComplete = useCallback(
    (setNumber: number) => {
      const input = setEntry(setNumber);
      if (!canCompleteSetEntry(input)) return;
      // Date.now() is read here in the event handler, not in the pure reducer,
      // so the reducer stays deterministic and testable.
      dispatch({ type: 'complete', exerciseIndex, setNumber, input, nowMs: Date.now() });
      setInputs((prev) => {
        const map = new Map(prev);
        map.delete(setKey(exerciseIndex, setNumber));
        return map;
      });
    },
    [exerciseIndex, setEntry],
  );

  const handleEdit = useCallback(
    (setNumber: number) => {
      dispatch({ type: 'edit', exerciseIndex, setNumber });
    },
    [exerciseIndex],
  );

  // A 1s tick purely to trigger re-render while rest is active; the displayed
  // remaining time is always recomputed from state.rest and Date.now(), so this
  // interval never accumulates and a delayed render still shows the right value.
  const restActive = state.rest !== null;
  useRestTick(restActive);

  if (state.stage === 'finished') {
    return <FinishedSummary state={state} onExit={onExit} />;
  }

  return (
    <section className="active-workout" aria-busy={false}>
      <header className="active-workout__header">
        <p className="eyebrow">Active session</p>
        <h2>{state.title}</h2>
        <div className="active-workout__meta">
          <span className="active-workout__elapsed">{formatElapsed(state.estimatedDurationMinutes)}</span>
          <span className="active-workout__progress">
            {completed} / {total} sets
          </span>
        </div>
      </header>

      <section className="active-workout__current" aria-label="Current exercise">
        <div className="active-workout__current-top">
          <span className="active-workout__position">Exercise {exercise.position}</span>
          {isExerciseComplete(state, exerciseIndex) && (
            <span className="active-workout__done-badge">Done</span>
          )}
        </div>
        <h3 className="active-workout__name">{exercise.name}</h3>
        <p className="active-workout__prescription">
          {prescriptionText(exercise)} &middot; previous performance unavailable
        </p>

        <ol className="active-workout__sets">
          {sets.map((set) => {
            const planned = exercise.plannedSets[set.setNumber - 1];
            const isComplete = set.status === 'completed';
            const entry = setEntry(set.setNumber);
            return (
              <li
                key={set.setNumber}
                className={`active-set${isComplete ? ' active-set--completed' : ''}`}
              >
                <div className="active-set__head">
                  <span className="active-set__number">Set {set.setNumber}</span>
                  <span className="active-set__target">{prescriptionText(exercise, planned)}</span>
                </div>

                {isComplete && set.logged ? (
                  <div className="active-set__logged">
                    <span className="active-set__logged-value">{set.logged.weight} kg</span>
                    <span className="active-set__logged-value">{set.logged.reps} reps</span>
                    <span className="active-set__logged-value">
                      RIR {set.logged.rir === null ? '\u2014' : set.logged.rir}
                    </span>
                    <button
                      type="button"
                      className="active-set__edit"
                      onClick={() => handleEdit(set.setNumber)}
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <SetEntryRow
                    setNumber={set.setNumber}
                    entry={entry}
                    onChange={updateEntry}
                    onComplete={handleComplete}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {state.rest !== null && (
        <RestPanel
          rest={state.rest}
          onReduce={() => dispatch({ type: 'reduceRest', nowMs: Date.now() })}
          onExtend={() => dispatch({ type: 'extendRest' })}
          onSkip={() => dispatch({ type: 'skipRest', nowMs: Date.now() })}
          onDismiss={() => dispatch({ type: 'clearRest' })}
        />
      )}

      <nav className="active-workout__nav" aria-label="Exercise navigation">
        <button
          type="button"
          className="active-workout__nav-btn"
          onClick={() => dispatch({ type: 'move', delta: -1 })}
          disabled={!canGoToPreviousExercise(state)}
        >
          Previous
        </button>
        <button
          type="button"
          className="active-workout__nav-btn"
          onClick={() => dispatch({ type: 'move', delta: 1 })}
          disabled={!canGoToNextExercise(state)}
        >
          Next
        </button>
      </nav>

      <FinishControl
        incomplete={hasIncompleteSets(state)}
        confirming={state.confirmingFinish}
        onRequest={() => dispatch({ type: 'requestFinish' })}
        onCancel={() => dispatch({ type: 'cancelFinish' })}
        onConfirm={() => dispatch({ type: 'finish' })}
      />
    </section>
  );
}

interface SetEntryRowProps {
  readonly setNumber: number;
  readonly entry: SetEntryInput;
  readonly onChange: (setNumber: number, patch: Partial<SetEntryInput>) => void;
  readonly onComplete: (setNumber: number) => void;
}

function SetEntryRow({ setNumber, entry, onChange, onComplete }: SetEntryRowProps) {
  const validation: SetEntryValidationResult = useMemo(
    () => validateSetEntry(entry),
    [entry],
  );
  const canComplete = validation.issues.length === 0;
  const weightIssue = validation.issues.find((i) => i.field === 'weight');
  const repsIssue = validation.issues.find((i) => i.field === 'reps');
  const rirIssue = validation.issues.find((i) => i.field === 'rir');

  return (
    <div className="active-set__entry">
      <label className="active-set__field">
        <span className="active-set__field-label">Weight</span>
        <input
          className="active-set__input"
          type="text"
          inputMode="decimal"
          aria-label={`Set ${setNumber} weight`}
          value={entry.weight}
          onChange={(e) => onChange(setNumber, { weight: e.target.value })}
        />
      </label>
      {weightIssue && <span className="active-set__error">{weightIssue.message}</span>}

      <label className="active-set__field">
        <span className="active-set__field-label">Reps</span>
        <input
          className="active-set__input"
          type="text"
          inputMode="numeric"
          aria-label={`Set ${setNumber} reps`}
          value={entry.reps}
          onChange={(e) => onChange(setNumber, { reps: e.target.value })}
        />
      </label>
      {repsIssue && <span className="active-set__error">{repsIssue.message}</span>}

      <label className="active-set__field">
        <span className="active-set__field-label">RIR</span>
        <input
          className="active-set__input"
          type="text"
          inputMode="numeric"
          aria-label={`Set ${setNumber} RIR`}
          placeholder="\u2014"
          value={entry.rir}
          onChange={(e) => onChange(setNumber, { rir: e.target.value })}
        />
      </label>
      {rirIssue && <span className="active-set__error">{rirIssue.message}</span>}

      <button
        type="button"
        className="active-set__complete"
        onClick={() => onComplete(setNumber)}
        disabled={!canComplete}
      >
        Complete
      </button>
    </div>
  );
}

interface FinishControlProps {
  readonly incomplete: boolean;
  readonly confirming: boolean;
  readonly onRequest: () => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

function FinishControl({ incomplete, confirming, onRequest, onCancel, onConfirm }: FinishControlProps) {
  if (!confirming) {
    return (
      <div className="active-workout__finish">
        <button type="button" className="active-workout__finish-btn" onClick={onRequest}>
          Finish workout
        </button>
      </div>
    );
  }
  return (
    <div className="active-workout__finish active-workout__finish--confirming" role="alert">
      <p className="active-workout__finish-message">
        {incomplete
          ? 'Some sets are incomplete. Finish anyway?'
          : 'Finish this workout?'}
      </p>
      <div className="active-workout__finish-actions">
        <button type="button" className="active-workout__finish-confirm" onClick={onConfirm}>
          Finish
        </button>
        <button type="button" className="active-workout__finish-cancel" onClick={onCancel}>
          Keep logging
        </button>
      </div>
    </div>
  );
}

interface FinishedSummaryProps {
  readonly state: ActiveWorkoutState;
  readonly onExit: () => void;
}

function FinishedSummary({ state, onExit }: FinishedSummaryProps) {
  const summary = state.summary;
  return (
    <section className="active-workout active-workout--finished">
      <header className="active-workout__header">
        <p className="eyebrow">Session complete</p>
        <h2>{state.title}</h2>
      </header>
      <p className="active-workout__summary">
        {summary ? `${summary.completedSets} / ${summary.totalSets} sets logged` : 'Workout finished.'}
      </p>
      <button type="button" className="active-workout__exit" onClick={onExit}>
        Done
      </button>
    </section>
  );
}

/**
 * Re-render trigger only. While `active` is true, schedules a 1s tick that
 * forces React to re-render so the rest panel re-reads Date.now() and
 * recomputes remaining time from the timer's timestamps. The interval never
 * accumulates time itself — it is purely a render trigger. Cleared on unmount
 * or when rest goes inactive.
 */
function useRestTick(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      /* trigger re-render only */
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);
}

interface RestPanelProps {
  readonly rest: NonNullable<ActiveWorkoutState['rest']>;
  readonly onReduce: () => void;
  readonly onExtend: () => void;
  readonly onSkip: () => void;
  readonly onDismiss: () => void;
}

/**
 * Visually prominent in-line rest panel. No modal: exercise navigation stays
 * usable. Remaining time is recomputed from the timer deadline and Date.now()
 * on every render, so it stays correct after delayed renders.
 */
function RestPanel({ rest, onReduce, onExtend, onSkip, onDismiss }: RestPanelProps) {
  const nowMs = Date.now();
  const expired = isRestExpired(rest, nowMs);
  const remaining = remainingRestSeconds(rest, nowMs);

  if (expired) {
    return (
      <section className="rest-panel rest-panel--ready" role="status" aria-live="polite">
        <p className="rest-panel__eyebrow">REST</p>
        <p className="rest-panel__ready">Ready</p>
        <button type="button" className="rest-panel__dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </section>
    );
  }

  return (
    <section className="rest-panel" role="timer" aria-live="polite">
      <p className="rest-panel__eyebrow">REST</p>
      <p className="rest-panel__clock">{formatRestClock(remaining)}</p>
      <p className="rest-panel__target">Target {formatRestClock(rest.targetSeconds)}</p>
      <div className="rest-panel__controls">
        <button type="button" className="rest-panel__btn" onClick={onReduce}>
          &minus;15 sec
        </button>
        <button type="button" className="rest-panel__btn rest-panel__btn--skip" onClick={onSkip}>
          Skip
        </button>
        <button type="button" className="rest-panel__btn" onClick={onExtend}>
          +15 sec
        </button>
      </div>
    </section>
  );
}

/** Deterministic elapsed placeholder: shows the planned duration as the target. */
function formatElapsed(plannedMinutes: number): string {
  return `${plannedMinutes} min target`;
}

function prescriptionText(
  exercise: { readonly plannedSets: readonly { readonly targetReps: Readonly<{ readonly minimum: number; readonly maximum: number }>; readonly targetRir: number }[] },
  planned?: { readonly targetReps: Readonly<{ readonly minimum: number; readonly maximum: number }>; readonly targetRir: number },
): string {
  const ref = planned ?? exercise.plannedSets[0];
  if (ref === undefined) return '';
  return `${ref.targetReps.minimum}\u2013${ref.targetReps.maximum} reps \u00b7 RIR ${ref.targetRir}`;
}
