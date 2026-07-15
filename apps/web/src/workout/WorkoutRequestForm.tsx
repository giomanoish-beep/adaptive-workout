import { useMemo } from 'react';
import {
  firstWorkoutRequestIssue,
  setWorkoutRequestCustomDuration,
  setWorkoutRequestCustomDurationInput,
  setWorkoutRequestPresetDuration,
  validateWorkoutRequest,
  workoutRequestDurationOptions,
  workoutRequestEquipmentOptions,
  workoutRequestMuscleOptions,
  type WorkoutRequestDraft,
  type WorkoutRequestDurationOption,
  type WorkoutRequestEquipmentId,
  type WorkoutRequestMuscleId,
} from './workout-request';

/**
 * Presentational request form for the Workout tab (WEB_APP-003). Receives the
 * draft and an onChange callback; owns no state. Validation is derived purely
 * from the draft and shown inline as concise messages (no alerts). The primary
 * action fires onGenerate only when the request is valid.
 */
export interface WorkoutRequestFormProps {
  readonly draft: WorkoutRequestDraft;
  readonly onChange: (draft: WorkoutRequestDraft) => void;
  readonly onGenerate: () => void;
  readonly disabled?: boolean;
}

export function WorkoutRequestForm({
  draft,
  onChange,
  onGenerate,
  disabled = false,
}: WorkoutRequestFormProps) {
  const validation = useMemo(() => validateWorkoutRequest(draft), [draft]);
  const isValid = validation.issues.length === 0;

  const toggleMuscle = (muscleId: WorkoutRequestMuscleId) => {
    if (disabled) return;
    const exists = draft.muscleIds.includes(muscleId);
    onChange({
      ...draft,
      muscleIds: exists
        ? draft.muscleIds.filter((id) => id !== muscleId)
        : [...draft.muscleIds, muscleId],
    });
  };

  const selectDuration = (duration: WorkoutRequestDurationOption) => {
    if (disabled) return;
    onChange(setWorkoutRequestPresetDuration(draft, duration));
  };

  const selectCustomDuration = () => {
    if (disabled) return;
    onChange(setWorkoutRequestCustomDuration(draft));
  };

  const editCustomDuration = (input: string) => {
    if (disabled) return;
    onChange(setWorkoutRequestCustomDurationInput(draft, input));
  };

  const selectEquipment = (equipmentId: WorkoutRequestEquipmentId) => {
    if (disabled) return;
    onChange({ ...draft, equipmentId });
  };

  const muscleIssue = firstWorkoutRequestIssue(validation, 'muscleIds');
  const durationIssue = firstWorkoutRequestIssue(validation, 'durationMinutes');
  const equipmentIssue = firstWorkoutRequestIssue(validation, 'equipmentId');

  return (
    <section className="workout-request">
      <header className="workout-request__header">
        <p className="eyebrow">Workout</p>
        <h2>Build your session</h2>
        <p className="workout-request__subtitle">
          Pick your targets, time, and gear. We&rsquo;ll draft a balanced session.
        </p>
      </header>

      <fieldset className="workout-field" disabled={disabled}>
        <legend className="workout-field__label">Target muscles</legend>
        <div className="workout-chips">
          {workoutRequestMuscleOptions.map((option) => {
            const selected = draft.muscleIds.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                className={`workout-chip${selected ? ' workout-chip--selected' : ''}`}
                aria-pressed={selected}
                onClick={() => toggleMuscle(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {muscleIssue && <p className="workout-field__error">{muscleIssue.message}</p>}
      </fieldset>

      <fieldset className="workout-field" disabled={disabled}>
        <legend className="workout-field__label">Duration</legend>
        <div className="workout-duration">
          <div className="workout-duration__presets">
            {workoutRequestDurationOptions.map((duration) => {
              const selected =
                draft.durationMode === 'preset' && draft.durationMinutes === duration;
              return (
                <button
                  key={duration}
                  type="button"
                  className={`workout-segment${selected ? ' workout-segment--selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => selectDuration(duration)}
                >
                  {duration}
                  <span className="workout-segment__unit">min</span>
                </button>
              );
            })}
            <button
              type="button"
              className={`workout-segment workout-segment--custom${
                draft.durationMode === 'custom' ? ' workout-segment--selected' : ''
              }`}
              aria-pressed={draft.durationMode === 'custom'}
              onClick={selectCustomDuration}
            >
              Custom
            </button>
          </div>
          {draft.durationMode === 'custom' && (
            <div className="workout-duration__custom">
              <label className="workout-duration__custom-label" htmlFor="workout-duration-custom">
                Minutes
              </label>
              <input
                id="workout-duration-custom"
                className="workout-duration__custom-input"
                type="number"
                inputMode="numeric"
                min={15}
                max={240}
                step={1}
                placeholder="15–240"
                value={draft.customDurationInput}
                onChange={(event) => editCustomDuration(event.target.value)}
              />
            </div>
          )}
        </div>
        {durationIssue && <p className="workout-field__error">{durationIssue.message}</p>}
      </fieldset>

      <fieldset className="workout-field" disabled={disabled}>
        <legend className="workout-field__label">Equipment</legend>
        <div className="workout-segments">
          {workoutRequestEquipmentOptions.map((option) => {
            const selected = draft.equipmentId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`workout-segment${selected ? ' workout-segment--selected' : ''}`}
                aria-pressed={selected}
                onClick={() => selectEquipment(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {equipmentIssue && <p className="workout-field__error">{equipmentIssue.message}</p>}
      </fieldset>

      <button
        type="button"
        className="workout-request__primary"
        onClick={onGenerate}
        disabled={disabled || !isValid}
      >
        Generate workout
      </button>
    </section>
  );
}
