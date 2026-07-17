import { useCallback, useState } from 'react';
import {
  buildProfile,
  initialOnboardingDraft,
  initialOnboardingStep,
  isFirstStep,
  isReviewStep,
  isStepValid,
  nextStep,
  previousStep,
  setCustomDuration,
  setCustomDurationInput,
  setEnvironment,
  setExperience,
  setFrequency,
  setGoal,
  setHasCurrentDiscomfort,
  setPresetDuration,
  setProgramPreference,
  stepProgress,
  type OnboardingDraft,
  type OnboardingStep,
} from './onboarding-state';
import {
  environmentLabels,
  experienceLabels,
  frequencyLabels,
  goalLabels,
  profileDurationPresets,
  profileEnvironments,
  profileExperiences,
  profileFrequencies,
  profileGoals,
  profileProgramPreferences,
  programPreferenceLabels,
  profileReviewRows,
  type TrainingProfile,
} from './training-profile';

/**
 * First-run training-profile onboarding (ONBOARDING-001). Renders one clear
 * question per screen with large option cards, a progress indicator, Back, and a
 * primary Continue action. The completed profile is emitted through
 * `onComplete`; the parent holds it in React memory only. No browser storage,
 * AI, workout-engine, or pain-safety dependencies (docs/PRODUCT.md, AGENTS.md).
 *
 * Mobile-first, dark premium, reusing the existing teal accent. One question per
 * screen avoids a long scrolling form; a constrained sensible width is kept on
 * desktop by the existing `main` content max.
 */
export interface OnboardingFlowProps {
  readonly onComplete: (profile: TrainingProfile) => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>(initialOnboardingStep);
  const [draft, setDraft] = useState<OnboardingDraft>(initialOnboardingDraft);

  const progress = stepProgress(step);
  const canAdvance = isStepValid(step, draft);

  const handleContinue = useCallback(() => {
    setStep(nextStep(step, draft));
  }, [draft, step]);

  const handleBack = useCallback(() => {
    setStep(previousStep(step));
  }, [step]);

  const handleFinish = useCallback(() => {
    const profile = buildProfile(draft);
    if (profile) onComplete(profile);
  }, [draft, onComplete]);

  return (
    <section className="onboarding">
      <p className="eyebrow onboarding__eyebrow">
        Setup {progress.current} of {progress.total}
      </p>
      <div className="onboarding__progress" role="progressbar" aria-label="Onboarding progress" aria-valuenow={progress.current} aria-valuemin={1} aria-valuemax={progress.total}>
        <span
          className="onboarding__progress-fill"
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>

      {step === 'goal' && (
        <ChoiceStep
          title="What's your main goal?"
          options={profileGoals.map((value) => ({ value, label: goalLabels[value] }))}
          selected={draft.goal}
          onSelect={(value) => setDraft((d) => setGoal(d, value))}
        />
      )}

      {step === 'experience' && (
        <ChoiceStep
          title="What's your training experience?"
          options={profileExperiences.map((value) => ({ value, label: experienceLabels[value] }))}
          selected={draft.experience}
          onSelect={(value) => setDraft((d) => setExperience(d, value))}
        />
      )}

      {step === 'frequency' && (
        <ChoiceStep
          title="How often do you want to train?"
          options={profileFrequencies.map((value) => ({ value, label: frequencyLabels[value] }))}
          selected={draft.frequency}
          onSelect={(value) => setDraft((d) => setFrequency(d, value))}
        />
      )}

      {step === 'duration' && (
        <DurationStep draft={draft} onChange={setDraft} />
      )}

      {step === 'environment' && (
        <ChoiceStep
          title="Where do you usually train?"
          options={profileEnvironments.map((value) => ({ value, label: environmentLabels[value] }))}
          selected={draft.environment}
          onSelect={(value) => setDraft((d) => setEnvironment(d, value))}
        />
      )}

      {step === 'program_preference' && (
        <ChoiceStep
          title="How do you prefer to train?"
          options={profileProgramPreferences.map((value) => ({
            value,
            label: programPreferenceLabels[value],
          }))}
          selected={draft.programPreference}
          onSelect={(value) => setDraft((d) => setProgramPreference(d, value))}
        />
      )}

      {step === 'discomfort' && (
        <DiscomfortStep
          selected={draft.hasCurrentDiscomfort}
          onSelect={(value) => setDraft((d) => setHasCurrentDiscomfort(d, value))}
        />
      )}

      {step === 'review' && <ReviewStep draft={draft} />}

      <div className="onboarding__actions">
        {!isFirstStep(step) && (
          <button type="button" className="onboarding__back" onClick={handleBack}>
            Back
          </button>
        )}
        {isReviewStep(step) ? (
          <button
            type="button"
            className="onboarding__primary"
            onClick={handleFinish}
            disabled={!canAdvance}
          >
            Finish setup
          </button>
        ) : (
          <button
            type="button"
            className="onboarding__primary"
            onClick={handleContinue}
            disabled={!canAdvance}
          >
            Continue
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- Choice step (single-select option cards) ---------- */

interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

function ChoiceStep<T extends string>({
  title,
  options,
  selected,
  onSelect,
}: {
  readonly title: string;
  readonly options: readonly ChoiceOption<T>[];
  readonly selected: T | null;
  readonly onSelect: (value: T) => void;
}) {
  return (
    <div className="onboarding__question">
      <h2 className="onboarding__title">{title}</h2>
      <div className="onboarding__options">
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <button
              key={option.value}
              type="button"
              className={`onboarding__option${isSelected ? ' onboarding__option--selected' : ''}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(option.value)}
            >
              <span className="onboarding__option-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Duration step (presets + custom) ---------- */

function DurationStep({
  draft,
  onChange,
}: {
  readonly draft: OnboardingDraft;
  readonly onChange: (next: (d: OnboardingDraft) => OnboardingDraft) => void;
}) {
  return (
    <div className="onboarding__question">
      <h2 className="onboarding__title">How long are your usual workouts?</h2>
      <div className="onboarding__duration">
        <div className="onboarding__duration-presets">
          {profileDurationPresets.map((duration) => {
            const isSelected =
              draft.durationMode === 'preset' && draft.typicalDurationMinutes === duration;
            return (
              <button
                key={duration}
                type="button"
                className={`onboarding__segment${isSelected ? ' onboarding__segment--selected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => onChange((d) => setPresetDuration(d, duration))}
              >
                {duration}
                <span className="onboarding__segment-unit">min</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`onboarding__segment onboarding__segment--custom${
              draft.durationMode === 'custom' ? ' onboarding__segment--selected' : ''
            }`}
            aria-pressed={draft.durationMode === 'custom'}
            onClick={() => onChange((d) => setCustomDuration(d))}
          >
            Custom
          </button>
        </div>
        {draft.durationMode === 'custom' && (
          <div className="onboarding__duration-custom">
            <label className="onboarding__duration-custom-label" htmlFor="onboarding-duration-custom">
              Minutes
            </label>
            <input
              id="onboarding-duration-custom"
              className="onboarding__duration-custom-input"
              type="number"
              inputMode="numeric"
              min={15}
              max={240}
              step={1}
              placeholder="15–240"
              value={draft.customDurationInput}
              onChange={(event) => onChange((d) => setCustomDurationInput(d, event.target.value))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Discomfort step (non-diagnostic) ---------- */

function DiscomfortStep({
  selected,
  onSelect,
}: {
  readonly selected: boolean | null;
  readonly onSelect: (value: boolean) => void;
}) {
  return (
    <div className="onboarding__question">
      <h2 className="onboarding__title">Anything currently affecting your training?</h2>
      <div className="onboarding__options">
        <button
          type="button"
          className={`onboarding__option${selected === false ? ' onboarding__option--selected' : ''}`}
          aria-pressed={selected === false}
          onClick={() => onSelect(false)}
        >
          <span className="onboarding__option-label">No current discomfort</span>
        </button>
        <button
          type="button"
          className={`onboarding__option${selected === true ? ' onboarding__option--selected' : ''}`}
          aria-pressed={selected === true}
          onClick={() => onSelect(true)}
        >
          <span className="onboarding__option-label">Yes, something is affecting training</span>
        </button>
      </div>
      <p className="onboarding__discomfort-note">
        We&rsquo;ll review any details before adapting your training. This doesn&rsquo;t ask for
        medical information.
      </p>
    </div>
  );
}

/* ---------- Review step ---------- */

function ReviewStep({ draft }: { readonly draft: OnboardingDraft }) {
  const profile = buildProfile(draft);
  if (!profile) {
    return (
      <div className="onboarding__question">
        <h2 className="onboarding__title">Review your setup</h2>
        <p className="onboarding__review-empty">Complete every step to finish setup.</p>
      </div>
    );
  }
  const rows = profileReviewRows(profile);
  return (
    <div className="onboarding__question">
      <h2 className="onboarding__title">Review your setup</h2>
      <dl className="onboarding__review">
        {rows.map((row) => (
          <div key={row.dimension} className="onboarding__review-row">
            <dt className="onboarding__review-dimension">{row.dimension}</dt>
            <dd className="onboarding__review-value">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
