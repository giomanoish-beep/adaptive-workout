import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useWorkoutSession } from '../workout-session/use-workout-session';
import { useNow } from './active-workout-timer';
import {
  completedSetCount,
  currentExercise,
  totalPlannedSets,
  canGoToPreviousExercise,
  canGoToNextExercise,
} from './active-workout-state';
import {
  formatRestClock,
  isRestExpired,
  remainingRestSeconds,
  type RestTimerState,
} from './active-workout-rest';
import {
  canCompleteSetEntry,
  toLoggedSet,
  validateSetEntry,
  type SetEntryInput,
  type SetEntryValidationResult,
} from './active-workout-validation';
import { prefillSetEntry } from './prefill-set-entry';
import type { WorkoutReview } from '../workout/workout-review';
import type { SessionCreateOptions } from '../workout-session/workout-session-repository';

export interface ActiveWorkoutProps {
  readonly client: SupabaseClient;
  readonly userId: string;
  readonly initialReview?: WorkoutReview;
  readonly sessionOptions?: SessionCreateOptions;
  readonly onExit: () => void;
}

function setKey(ei: number, sn: number): string {
  return `${ei}:${sn}`;
}

export function ActiveWorkout({
  client,
  userId,
  initialReview,
  sessionOptions,
  onExit,
}: ActiveWorkoutProps) {
  const session = useWorkoutSession(client, userId);
  const { state } = session;

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialReview) void session.startSession(initialReview, sessionOptions);
    else void session.resumeSession();
  }, [initialReview, session, sessionOptions]);

  const [inputs, setInputs] = useState<ReadonlyMap<string, SetEntryInput>>(new Map());
  const restActive = state.stage === 'active' && state.rest !== null;
  const nowMs = useNow(restActive);

  // Derive active-stage values safely (use 0/null when not active).
  const exIdx = state.stage === 'active' ? state.currentExerciseIndex : 0;
  const exercise = state.stage === 'active' ? currentExercise(state) : null;
  const completed = state.stage === 'active' ? completedSetCount(state) : 0;
  const total = state.stage === 'active' ? totalPlannedSets(state) : 0;

  // THESE HOOKS MUST FIRE EVERY RENDER regardless of stage.
  const setEntryFn = useCallback(
    (sn: number): SetEntryInput =>
      inputs.get(setKey(exIdx, sn)) ?? prefillSetEntry(exercise?.plannedSets[sn - 1]),
    [inputs, exIdx, exercise],
  );
  const updateEntryFn = useCallback(
    (sn: number, patch: Partial<SetEntryInput>) => {
      setInputs((prev) => {
        const k = setKey(exIdx, sn);
        const cur = prev.get(k) ?? prefillSetEntry(exercise?.plannedSets[sn - 1]);
        const m = new Map(prev);
        m.set(k, { ...cur, ...patch });
        return m;
      });
    },
    [exIdx, exercise],
  );
  const handleComplete = useCallback(
    async (sn: number) => {
      const inp = setEntryFn(sn);
      if (!canCompleteSetEntry(inp)) return;
      await session.completeSetWithPersistence(exIdx, sn, toLoggedSet(inp));
      setInputs((prev) => {
        const m = new Map(prev);
        m.delete(setKey(exIdx, sn));
        return m;
      });
    },
    [exIdx, setEntryFn, session],
  );
  const handleEdit = useCallback(
    (sn: number) => {
      if (state.stage === 'active') {
        const logged = state.sets[exIdx]?.find((set) => set.setNumber === sn)?.logged;
        if (logged) {
          setInputs((previous) => {
            const next = new Map(previous);
            next.set(setKey(exIdx, sn), {
              weight: String(logged.weight),
              reps: String(logged.reps),
              rir: logged.rir === null ? '' : String(logged.rir),
            });
            return next;
          });
        }
        session.editSet(exIdx, sn);
      }
    },
    [exIdx, session, state],
  );

  // ---- RENDER SWITCH (all hooks above, early returns below) ----
  if (state.stage === 'loading') {
    return (
      <section className="active-workout active-workout--loading" role="status">
        <p>Active session</p>
        <h2>Loading…</h2>
      </section>
    );
  }
  if (state.stage === 'error') {
    // errorMessage is only meaningful in the error stage; read it after the
    // stage check so the value is intentional rather than cast.
    const msg = state.errorMessage;
    return (
      <section className="active-workout active-workout--error" role="alert">
        <p>Active session</p>
        <h2>Error</h2>
        <p>{msg ?? 'Could not load'}</p>
        <button onClick={onExit}>Go back</button>
      </section>
    );
  }
  if (state.stage === 'finished') {
    return (
      <section className="active-workout active-workout--finished">
        <h2>Session complete</h2>
        <button onClick={onExit}>Done</button>
      </section>
    );
  }
  if (!exercise) return null;
  const exerciseSets = state.sets[exIdx] ?? [];
  const latestCompleted = [...exerciseSets].reverse().find((set) => set.status === 'completed');
  const nextIncomplete = exerciseSets.find((set) => set.status === 'incomplete');
  const visibleSets = exerciseSets.filter(
    (set) => set === latestCompleted || set === nextIncomplete,
  );

  return (
    <section className="active-workout">
      <header className="active-workout__header">
        <h1 className="active-workout__session-title">{state.title}</h1>
        <span className="active-workout__progress">
          {completed}/{total} sets
        </span>
      </header>
      <div className="active-workout__current">
        <div className="active-workout__current-top">
          <span className="active-workout__position">
            Exercise {exIdx + 1} of {state.exercises.length}
          </span>
        </div>
        <h2 className="active-workout__name">{exercise.name}</h2>
        <p className="active-workout__prescription">
          {exercise.plannedSets.length} sets × {exercise.plannedSets[0]?.targetReps.minimum}–
          {exercise.plannedSets[0]?.targetReps.maximum} reps @ RIR{' '}
          {exercise.plannedSets[0]?.targetRir}
        </p>
        <ActiveProgressSummary exercise={exercise} />
      </div>
      <ol className="active-workout__sets">
        {visibleSets.map((set) => (
          <li
            key={set.setNumber}
            className={`active-set${set.status === 'completed' ? ' active-set--completed' : ''}`}
          >
            <div className="active-set__head">
              <span className="active-set__number">Set {set.setNumber}</span>
              <span className="active-set__target">
                {exercise.plannedSets[set.setNumber - 1]?.targetReps.minimum}–
                {exercise.plannedSets[set.setNumber - 1]?.targetReps.maximum} reps
              </span>
            </div>
            {set.status === 'completed' && set.logged ? (
              <div className="active-set__logged">
                <span className="active-set__logged-value">{set.logged.weight} kg</span>
                <span className="active-set__logged-value">{set.logged.reps} reps</span>
                <span className="active-set__logged-value">
                  RIR {set.logged.rir === null ? 'Unknown' : set.logged.rir}
                </span>
                <button className="active-set__edit" onClick={() => handleEdit(set.setNumber)}>
                  Edit
                </button>
              </div>
            ) : (
              <SetEntryRow
                sn={set.setNumber}
                entry={setEntryFn(set.setNumber)}
                onChange={updateEntryFn}
                onComplete={handleComplete}
              />
            )}
          </li>
        ))}
      </ol>
      {state.rest !== null && (
        <RestPanel
          r={state.rest}
          n={nowMs}
          onExtend={() => session.extendRest()}
          onSkip={() => session.skipRest(Date.now())}
          onDismiss={() => session.clearRest()}
        />
      )}
      <nav className="active-workout__nav" aria-label="Exercise navigation">
        <button
          className="active-workout__nav-btn"
          aria-label="Previous"
          onClick={() => session.moveExercise(-1)}
          disabled={!canGoToPreviousExercise(state)}
        >
          ← Previous
        </button>
        <span className="active-workout__nav-position">
          {exIdx + 1} of {state.exercises.length}
        </span>
        <button
          className="active-workout__nav-btn"
          aria-label="Next"
          onClick={() => session.moveExercise(1)}
          disabled={!canGoToNextExercise(state)}
        >
          Next →
        </button>
      </nav>
      {state.confirmingFinish ? (
        <div className="active-workout__finish--confirming">
          <p>Some sets are incomplete. Finish anyway?</p>
          <button onClick={() => void session.finishSession()}>Finish</button>
          <button onClick={() => session.cancelFinish()}>Keep logging</button>
        </div>
      ) : (
        <div className="active-workout__finish">
          <button className="active-workout__finish-btn" onClick={() => session.requestFinish()}>
            Finish workout
          </button>
        </div>
      )}
    </section>
  );
}

function RestPanel({
  r,
  n,
  onExtend,
  onSkip,
  onDismiss,
}: {
  r: RestTimerState;
  n: number;
  onExtend: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}) {
  if (isRestExpired(r, n))
    return (
      <div className="rest-panel rest-panel--ready" role="status" aria-live="polite">
        <span className="rest-panel__ready">Ready</span>
        <button className="rest-panel__dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    );
  return (
    <div className="rest-panel" role="timer">
      <div className="rest-panel__clock" aria-live="off">
        {formatRestClock(remainingRestSeconds(r, n))}
      </div>
      <div className="rest-panel__target">Target {formatRestClock(r.targetSeconds)}</div>
      <div className="rest-panel__controls">
        <button className="rest-panel__btn" onClick={onExtend}>
          +15 sec
        </button>
        <button className="rest-panel__btn rest-panel__btn--skip" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}

function SetEntryRow({
  sn,
  entry,
  onChange,
  onComplete,
}: {
  sn: number;
  entry: SetEntryInput;
  onChange: (n: number, p: Partial<SetEntryInput>) => void;
  onComplete: (n: number) => Promise<void>;
}) {
  const v: SetEntryValidationResult = useMemo(() => validateSetEntry(entry), [entry]);
  return (
    <div className="active-set__entry">
      <label className="active-set__field">
        <span className="active-set__field-label">Weight</span>
        <input
          className="active-set__input"
          type="text"
          inputMode="decimal"
          aria-label={`Set ${sn} weight`}
          value={entry.weight}
          onChange={(e) => onChange(sn, { weight: e.target.value })}
        />
      </label>
      <label className="active-set__field">
        <span className="active-set__field-label">Reps</span>
        <input
          className="active-set__input"
          type="text"
          inputMode="numeric"
          aria-label={`Set ${sn} reps`}
          value={entry.reps}
          onChange={(e) => onChange(sn, { reps: e.target.value })}
        />
      </label>
      <label className="active-set__field">
        <span className="active-set__field-label">RIR</span>
        <select
          className="active-set__input active-set__rir-select"
          aria-label={`Set ${sn} RIR`}
          value={entry.rir}
          onChange={(e) => onChange(sn, { rir: e.target.value })}
        >
          <option value="">Unknown</option>
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5+</option>
        </select>
      </label>
      <p className="active-set__rir-guidance">{rirGuidance(entry.rir)}</p>
      <button
        className="active-set__complete"
        onClick={() => void onComplete(sn)}
        disabled={v.issues.length > 0}
      >
        Complete
      </button>
    </div>
  );
}

function rirGuidance(value: string): string {
  switch (value) {
    case '0':
      return '0: no repetitions left';
    case '1':
      return '1: one repetition left';
    case '2':
      return '2: two repetitions left';
    case '3':
      return '3: three repetitions left';
    case '4':
      return '4: easy set';
    case '5':
      return '5+: very easy set';
    default:
      return 'Unknown: not sure';
  }
}

function ActiveProgressSummary({ exercise }: { exercise: ReturnType<typeof currentExercise> }) {
  const progress = exercise.progression;
  if (!progress?.hasEnoughData) {
    return <p className="active-workout__recommendation">Calibration recommended</p>;
  }
  return (
    <p className="active-workout__recommendation">
      Last: {progress.lastWeightKg ?? '—'} kg × {progress.lastReps ?? '—'}
      {progress.lastRir === null ? '' : ` @ RIR ${progress.lastRir}`} · Next:{' '}
      {progress.nextWeightKg === null ? 'Calibration recommended' : `${progress.nextWeightKg} kg`}
    </p>
  );
}
