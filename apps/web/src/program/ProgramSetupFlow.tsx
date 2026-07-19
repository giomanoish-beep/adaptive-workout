import { useMemo, useState } from 'react';
import type { TrainingProfile } from '../onboarding/training-profile';
import { localDate } from './program-view-model';
import type { ProgramDurationWeeks, ProgramGoal, ProgramSetupDraft } from './program-types';

export function ProgramSetupFlow({
  profile,
  saving,
  error,
  onCancel,
  onCreate,
}: {
  readonly profile: TrainingProfile;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onCreate: (setup: ProgramSetupDraft) => void;
}) {
  const initialGoal: ProgramGoal =
    profile.goal === 'gain_strength'
      ? 'gain_strength'
      : profile.goal === 'build_muscle'
        ? 'build_muscle'
        : profile.goal === 'lose_fat'
          ? 'fat_loss_support'
          : 'recomposition';
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<ProgramGoal>(initialGoal);
  const [experience, setExperience] = useState(profile.experience);
  const [days, setDays] = useState(
    profile.frequency === 'six_plus' ? 6 : Number(profile.frequency),
  );
  const [sessionMinutes, setSessionMinutes] = useState(profile.typicalDurationMinutes);
  const [weeks, setWeeks] = useState<ProgramDurationWeeks>(12);
  const [equipment, setEquipment] = useState<readonly string[]>(
    environmentEquipment(profile.environment),
  );
  const [preference, setPreference] = useState<ProgramSetupDraft['programPreference']>(
    profile.programPreference === 'other' ? 'app_decide' : profile.programPreference,
  );
  const [avoidOverhead, setAvoidOverhead] = useState(false);
  const [avoidBench, setAvoidBench] = useState(false);
  const setup = useMemo<ProgramSetupDraft>(
    () => ({
      goal,
      experience,
      daysPerWeek: days,
      sessionDurationMinutes: sessionMinutes,
      durationWeeks: weeks,
      startDate: localDate(),
      equipment,
      programPreference: preference,
      dislikedExerciseIds: avoidBench ? ['barbell-bench-press'] : [],
      restrictedMovementPatterns: avoidOverhead ? ['vertical-press'] : [],
    }),
    [
      avoidBench,
      avoidOverhead,
      days,
      equipment,
      experience,
      goal,
      preference,
      sessionMinutes,
      weeks,
    ],
  );

  return (
    <section className="program-setup" aria-labelledby="program-setup-title">
      <p className="eyebrow">Program setup · {step} of 3</p>
      <h2 id="program-setup-title">Create my program</h2>
      {step === 1 && (
        <>
          <Field label="Training goal">
            <Choice
              values={
                ['build_muscle', 'gain_strength', 'recomposition', 'fat_loss_support'] as const
              }
              selected={goal}
              onSelect={setGoal}
              labels={{
                build_muscle: 'Build muscle',
                gain_strength: 'Strength',
                recomposition: 'Recomposition',
                fat_loss_support: 'Fat-loss support',
              }}
            />
          </Field>
          <Field label="Experience level">
            <Choice
              values={['beginner', 'intermediate', 'advanced'] as const}
              selected={experience}
              onSelect={setExperience}
              labels={{ beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }}
            />
          </Field>
          <Field label="Days per week">
            <Choice values={[2, 3, 4, 5, 6] as const} selected={days} onSelect={setDays} />
          </Field>
        </>
      )}
      {step === 2 && (
        <>
          <Field label="Preferred session duration">
            <Choice
              values={[30, 45, 60, 75, 90] as const}
              selected={sessionMinutes}
              onSelect={setSessionMinutes}
              suffix=" min"
            />
          </Field>
          <Field label="Desired program duration">
            <Choice
              values={[8, 12, 16] as const}
              selected={weeks}
              onSelect={setWeeks}
              suffix=" weeks"
            />
          </Field>
          <Field label="Program preference">
            <Choice
              values={['app_decide', 'upper_lower', 'push_pull_legs', 'full_body'] as const}
              selected={preference}
              onSelect={setPreference}
              labels={{
                app_decide: 'App decides',
                upper_lower: 'Upper Lower',
                push_pull_legs: 'Push Pull Legs',
                full_body: 'Full Body',
              }}
            />
          </Field>
        </>
      )}
      {step === 3 && (
        <>
          <Field label={`Training environment · ${profile.environment.replaceAll('_', ' ')}`}>
            <div className="program-setup__checks">
              {['barbell', 'dumbbell', 'cable', 'bodyweight', 'bench'].map((item) => (
                <label key={item}>
                  <input
                    type="checkbox"
                    checked={equipment.includes(item)}
                    onChange={() => setEquipment(toggle(equipment, item))}
                  />{' '}
                  {item}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Exercise preferences">
            <div className="program-setup__checks">
              <label>
                <input
                  type="checkbox"
                  checked={avoidBench}
                  onChange={(e) => setAvoidBench(e.target.checked)}
                />{' '}
                Avoid barbell bench press
              </label>
            </div>
          </Field>
          <Field label="Active discomfort restrictions">
            <div className="program-setup__checks">
              <label>
                <input
                  type="checkbox"
                  checked={avoidOverhead}
                  onChange={(e) => setAvoidOverhead(e.target.checked)}
                />{' '}
                Temporarily restrict overhead pressing
              </label>
            </div>
            <p className="program-setup__guidance">
              This changes training only and does not provide a diagnosis.
            </p>
          </Field>
        </>
      )}
      {error && (
        <div role="alert" className="program-action-error">
          {error}
        </div>
      )}
      <div className="program-setup__actions">
        <button
          type="button"
          className="secondary-button"
          onClick={step === 1 ? onCancel : () => setStep(step - 1)}
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        {step < 3 ? (
          <button type="button" className="primary-button" onClick={() => setStep(step + 1)}>
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            disabled={saving}
            onClick={() => onCreate(setup)}
          >
            {saving ? 'Creating…' : 'Create program'}
          </button>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <fieldset className="program-setup__field">
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}

function Choice<T extends string | number>({
  values,
  selected,
  onSelect,
  labels,
  suffix = '',
}: {
  readonly values: readonly T[];
  readonly selected: T;
  readonly onSelect: (value: T) => void;
  readonly labels?: Partial<Record<T, string>>;
  readonly suffix?: string;
}) {
  return (
    <div className="program-choice">
      {values.map((value) => (
        <button
          type="button"
          className={value === selected ? 'is-selected' : ''}
          aria-pressed={value === selected}
          key={value}
          onClick={() => onSelect(value)}
        >
          {labels?.[value] ?? `${value}${suffix}`}
        </button>
      ))}
    </div>
  );
}

function environmentEquipment(environment: TrainingProfile['environment']): readonly string[] {
  if (environment === 'commercial_gym')
    return ['barbell', 'dumbbell', 'cable', 'bodyweight', 'bench', 'selectorized-machine'];
  if (environment === 'home_gym') return ['barbell', 'dumbbell', 'bodyweight', 'bench'];
  if (environment === 'minimal_equipment') return ['dumbbell', 'bodyweight'];
  return ['bodyweight'];
}

function toggle(values: readonly string[], item: string): readonly string[] {
  return values.includes(item) ? values.filter((value) => value !== item) : [...values, item];
}
