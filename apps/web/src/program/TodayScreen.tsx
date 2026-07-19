import { useState } from 'react';
import type { TrainingProfile } from '../onboarding/training-profile';
import type { WorkoutReview } from '../workout/workout-review';
import { ProgramSetupFlow } from './ProgramSetupFlow';
import {
  currentWeek,
  lastCompleted,
  nextWorkout,
  scheduledWorkoutReview,
  templateFor,
  titleCase,
} from './program-view-model';
import type { ProgramState } from './use-program';
import type { ProgramSetupDraft, ScheduledWorkoutState } from './program-types';

export function TodayScreen({
  profile,
  state,
  saving,
  error,
  onCreate,
  onAdHoc,
  onViewProgram,
  onStart,
  onReschedule,
  onSkip,
}: {
  readonly profile: TrainingProfile;
  readonly state: ProgramState;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onCreate: (setup: ProgramSetupDraft) => void;
  readonly onAdHoc: () => void;
  readonly onViewProgram: () => void;
  readonly onStart: (scheduled: ScheduledWorkoutState, review: WorkoutReview) => void;
  readonly onReschedule: (id: string, date: string) => void;
  readonly onSkip: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  if (creating && state.status === 'missing')
    return (
      <ProgramSetupFlow
        profile={profile}
        saving={saving}
        error={error}
        onCancel={() => setCreating(false)}
        onCreate={onCreate}
      />
    );
  if (state.status === 'loading')
    return (
      <section className="today-screen" role="status">
        <p>Loading today…</p>
      </section>
    );
  if (state.status === 'error')
    return (
      <section role="alert" className="today-screen">
        <h2>Today is unavailable</h2>
        <p>{state.message}</p>
      </section>
    );
  if (state.status === 'missing')
    return (
      <section className="today-screen today-screen--empty">
        <p className="eyebrow">Today</p>
        <h2>Your training home</h2>
        <p>Follow a personalized multi-week program or create one independent workout for today.</p>
        <button className="primary-button" type="button" onClick={() => setCreating(true)}>
          Create my program
        </button>
        <button
          className="secondary-button"
          type="button"
          aria-label="Generate one session"
          onClick={onAdHoc}
        >
          Generate one workout
        </button>
      </section>
    );
  const program = state.program;
  const scheduled = nextWorkout(program);
  const template = scheduled ? templateFor(program, scheduled) : null;
  const last = lastCompleted(program);
  if (reviewing && scheduled && template) {
    const review = scheduledWorkoutReview(program, scheduled);
    return (
      <section className="scheduled-review">
        <p className="eyebrow">Scheduled workout review</p>
        <h2>{template.name}</h2>
        <p>
          {template.expectedDurationMinutes} min · Week {scheduled.week} ·{' '}
          {titleCase(scheduled.phase)}
        </p>
        <ol>
          {template.prescriptions.map((item) => (
            <li key={item.exerciseId}>
              <strong>{item.exerciseName}</strong>
              <span>
                {item.sets} × {item.repsMin}–{item.repsMax} @ RIR {item.targetRir}
              </span>
              <small>
                {item.initialLoadKg === null
                  ? 'Calibration recommended'
                  : `${item.initialLoadKg} kg`}{' '}
                · {item.recommendationReason}
              </small>
            </li>
          ))}
        </ol>
        <div className="program-setup__actions">
          <button className="secondary-button" onClick={() => setReviewing(false)}>
            Back to Today
          </button>
          <button className="primary-button" onClick={() => onStart(scheduled, review)}>
            Start scheduled workout
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="today-screen">
      <p className="eyebrow">Today · Week {currentWeek(program)}</p>
      <h2>{scheduled && template ? template.name : 'Program complete for now'}</h2>
      {scheduled && template && (
        <article className="today-card">
          <div className="today-card__meta">
            <span>{titleCase(scheduled.phase)}</span>
            <span>{template.expectedDurationMinutes} min</span>
            <span>{template.prescriptions.length} exercises</span>
          </div>
          <p>{template.focus.map(titleCase).join(' · ')}</p>
          {scheduled.isDeload && <p className="program-badge">Reduced-load week</p>}
          <button className="primary-button" type="button" onClick={() => setReviewing(true)}>
            Start today’s workout
          </button>
          <div className="today-card__actions">
            <label>
              Reschedule{' '}
              <input
                aria-label="New workout date"
                type="date"
                value={scheduled.scheduledDate}
                onChange={(e) => onReschedule(scheduled.id, e.target.value)}
              />
            </label>
            <button type="button" disabled={saving} onClick={() => onSkip(scheduled.id)}>
              Skip
            </button>
          </div>
        </article>
      )}
      {program.adaptations.length > 0 && (
        <aside className="adaptation-banner">
          <strong>Current training adaptations</strong>
          {program.adaptations.map((item) => (
            <span key={item.id}>
              {titleCase(item.affectedRegion)} · {item.severity}
            </span>
          ))}
        </aside>
      )}
      <div className="today-summary">
        <div>
          <span>Next scheduled workout</span>
          <strong>{scheduled ? scheduled.scheduledDate : 'None'}</strong>
        </div>
        <div>
          <span>Last completed workout</span>
          <strong>{last?.scheduledDate ?? 'Not yet'}</strong>
        </div>
      </div>
      {error && (
        <div className="program-action-error" role="alert">
          {error}
        </div>
      )}
      <button className="secondary-button" type="button" onClick={onViewProgram}>
        View program
      </button>
      <button className="text-button" type="button" onClick={onAdHoc}>
        Create a workout for today
      </button>
    </section>
  );
}
