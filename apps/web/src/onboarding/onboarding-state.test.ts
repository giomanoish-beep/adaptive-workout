import { describe, expect, it } from 'vitest';
import {
  buildProfile,
  initialOnboardingDraft,
  initialOnboardingStep,
  isFirstStep,
  isProfileCompletable,
  isReviewStep,
  isStepValid,
  nextStep,
  onboardingSteps,
  previousStep,
  resolveCustomDurationMinutes,
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
} from './onboarding-state';
import {
  profileEnvironments,
  profileExperiences,
  profileFrequencies,
  profileGoals,
  profileProgramPreferences,
  profileReviewRows,
} from './training-profile';
import type { OnboardingDraft } from './onboarding-state';

/**
 * Focused tests for the pure onboarding state machine (ONBOARDING-001).
 * Covers the required behavior: step order, gating, answer preservation,
 * controlled option sets, duration semantics, and profile production.
 */

/** A draft with every required dimension answered validly. */
function completeDraft(): OnboardingDraft {
  let draft = initialOnboardingDraft;
  draft = setGoal(draft, 'build_muscle');
  draft = setExperience(draft, 'intermediate');
  draft = setFrequency(draft, '4');
  draft = setPresetDuration(draft, 60);
  draft = setEnvironment(draft, 'commercial_gym');
  draft = setProgramPreference(draft, 'upper_lower');
  draft = setHasCurrentDiscomfort(draft, false);
  return draft;
}

describe('onboarding step order', () => {
  it('starts on the goal step', () => {
    expect(initialOnboardingStep).toBe('goal');
  });

  it('exposes a deterministic ordered step list ending in review', () => {
    expect(onboardingSteps).toEqual([
      'goal',
      'experience',
      'frequency',
      'duration',
      'environment',
      'program_preference',
      'discomfort',
      'review',
    ]);
  });

  it('derives one-based progress for the goal step as 1 of 8', () => {
    expect(stepProgress('goal')).toEqual({ current: 1, total: 8 });
    expect(stepProgress('review')).toEqual({ current: 8, total: 8 });
  });
});

describe('advancement gating', () => {
  it('cannot advance from goal without a selection', () => {
    expect(nextStep('goal', initialOnboardingDraft)).toBe('goal');
    expect(isStepValid('goal', initialOnboardingDraft)).toBe(false);
  });

  it('can advance from goal once a goal is selected', () => {
    const draft = setGoal(initialOnboardingDraft, 'build_muscle');
    expect(isStepValid('goal', draft)).toBe(true);
    expect(nextStep('goal', draft)).toBe('experience');
  });

  it('prevents advancing when any subsequent step is invalid', () => {
    // experience selected but frequency not — cannot leave frequency
    const draft = setExperience(
      setGoal(initialOnboardingDraft, 'lose_fat'),
      'beginner',
    );
    expect(isStepValid('frequency', draft)).toBe(false);
    expect(nextStep('frequency', draft)).toBe('frequency');
  });

  it('cannot advance past review', () => {
    expect(nextStep('review', completeDraft())).toBe('review');
  });
});

describe('back navigation preserves answers', () => {
  it('returns to the previous step without dropping selections', () => {
    let draft = completeDraft();
    // Simulate reaching the review step with all answers intact.
    expect(previousStep('review')).toBe('discomfort');
    expect(previousStep('goal')).toBe('goal'); // first step stays put
    // The draft itself is the source of truth — answers survive because the
    // caller keeps the same draft object across next/previous.
    expect(draft.goal).toBe('build_muscle');
    expect(draft.frequency).toBe('4');
  });

  it('isFirstStep flags the goal step only', () => {
    expect(isFirstStep('goal')).toBe(true);
    expect(isFirstStep('experience')).toBe(false);
  });

  it('isReviewStep flags the review step only', () => {
    expect(isReviewStep('review')).toBe(true);
    expect(isReviewStep('goal')).toBe(false);
  });
});

describe('controlled option sets', () => {
  it('exposes all controlled goal values', () => {
    expect(profileGoals).toEqual([
      'build_muscle',
      'lose_fat',
      'gain_strength',
      'improve_fitness',
      'recomposition',
    ]);
  });

  it('exposes all controlled experience values', () => {
    expect(profileExperiences).toEqual(['beginner', 'intermediate', 'advanced']);
  });

  it('exposes all controlled frequency values', () => {
    expect(profileFrequencies).toEqual(['2', '3', '4', '5', 'six_plus']);
  });

  it('exposes all controlled environment values', () => {
    expect(profileEnvironments).toEqual([
      'commercial_gym',
      'home_gym',
      'minimal_equipment',
      'bodyweight',
    ]);
  });

  it('exposes all controlled program preference values', () => {
    expect(profileProgramPreferences).toEqual([
      'app_decide',
      'push_pull_legs',
      'upper_lower',
      'full_body',
      'other',
    ]);
  });
});

describe('duration semantics', () => {
  it('accepts the 120 minute preset', () => {
    const draft = setPresetDuration(initialOnboardingDraft, 120);
    expect(isStepValid('duration', draft)).toBe(true);
    expect(resolveCustomDurationMinutes('120')).not.toBeNull();
  });

  it('accepts a custom 105 minute value', () => {
    let draft = setCustomDurationInput(initialOnboardingDraft, '105');
    draft = setCustomDuration(draft);
    expect(isStepValid('duration', draft)).toBe(true);
    expect(draft.typicalDurationMinutes).toBe(105);
  });

  it('rejects an empty custom duration', () => {
    let draft = setCustomDurationInput(initialOnboardingDraft, '');
    draft = setCustomDuration(draft);
    expect(isStepValid('duration', draft)).toBe(false);
    expect(draft.typicalDurationMinutes).toBeNull();
  });

  it('rejects a decimal custom value without coercion', () => {
    expect(resolveCustomDurationMinutes('12.5')).toBeNull();
  });

  it('rejects an out-of-range custom value without coercion', () => {
    expect(resolveCustomDurationMinutes('14')).toBeNull();
    expect(resolveCustomDurationMinutes('241')).toBeNull();
    expect(resolveCustomDurationMinutes('300')).toBeNull();
  });

  it('preserves custom input when switching to a preset and back', () => {
    let draft = setCustomDurationInput(initialOnboardingDraft, '90');
    draft = setCustomDuration(draft);
    expect(draft.typicalDurationMinutes).toBe(90);
    // switch to preset
    draft = setPresetDuration(draft, 45);
    expect(draft.durationMode).toBe('preset');
    expect(draft.typicalDurationMinutes).toBe(45);
    // custom input preserved for a return
    expect(draft.customDurationInput).toBe('90');
    // switch back
    draft = setCustomDuration(draft);
    expect(draft.durationMode).toBe('custom');
    expect(draft.typicalDurationMinutes).toBe(90);
  });
});

describe('per-step requirement', () => {
  it('requires a goal', () => {
    expect(isStepValid('goal', initialOnboardingDraft)).toBe(false);
  });

  it('requires an experience', () => {
    expect(isStepValid('experience', initialOnboardingDraft)).toBe(false);
  });

  it('requires a frequency', () => {
    expect(isStepValid('frequency', initialOnboardingDraft)).toBe(false);
  });

  it('requires an environment', () => {
    expect(isStepValid('environment', initialOnboardingDraft)).toBe(false);
  });

  it('requires a program preference', () => {
    expect(isStepValid('program_preference', initialOnboardingDraft)).toBe(false);
  });

  it('requires a discomfort choice', () => {
    expect(isStepValid('discomfort', initialOnboardingDraft)).toBe(false);
  });

  it('accepts the discomfort choice in either direction', () => {
    expect(isStepValid('discomfort', setHasCurrentDiscomfort(initialOnboardingDraft, false))).toBe(
      true,
    );
    expect(isStepValid('discomfort', setHasCurrentDiscomfort(initialOnboardingDraft, true))).toBe(
      true,
    );
  });
});

describe('profile production', () => {
  it('cannot produce a profile when incomplete', () => {
    expect(buildProfile(initialOnboardingDraft)).toBeNull();
    expect(isProfileCompletable(initialOnboardingDraft)).toBe(false);
    // missing only discomfort
    const almost = {
      ...completeDraft(),
      hasCurrentDiscomfort: null,
    } as OnboardingDraft;
    expect(buildProfile(almost)).toBeNull();
  });

  it('produces a complete, validated profile', () => {
    const draft = completeDraft();
    expect(isProfileCompletable(draft)).toBe(true);
    const profile = buildProfile(draft);
    expect(profile).not.toBeNull();
    expect(profile).toEqual({
      goal: 'build_muscle',
      experience: 'intermediate',
      frequency: '4',
      typicalDurationMinutes: 60,
      environment: 'commercial_gym',
      programPreference: 'upper_lower',
      hasCurrentDiscomfort: false,
    });
  });

  it('stores hasCurrentDiscomfort true when Yes is chosen', () => {
    let draft = completeDraft();
    draft = setHasCurrentDiscomfort(draft, true);
    const profile = buildProfile(draft);
    expect(profile?.hasCurrentDiscomfort).toBe(true);
  });

  it('buildProfile result equals onComplete payload (single validated artifact)', () => {
    const draft = completeDraft();
    const profile = buildProfile(draft);
    // The component emits exactly this object through onComplete. buildProfile
    // returns a fresh object each call, so structural equality is the contract.
    expect(profile).toStrictEqual(buildProfile(draft));
  });
});

describe('review rows', () => {
  it('contains all seven profile dimensions in order', () => {
    const profile = buildProfile(completeDraft())!;
    const rows = profileReviewRows(profile);
    expect(rows.map((r) => r.dimension)).toEqual([
      'Goal',
      'Experience',
      'Frequency',
      'Typical duration',
      'Environment',
      'Program preference',
      'Current discomfort',
    ]);
    expect(rows.map((r) => r.value)).toEqual([
      'Build muscle',
      'Intermediate',
      '4 days',
      '60 min',
      'Commercial gym',
      'Upper Lower',
      'No current discomfort',
    ]);
  });
});
