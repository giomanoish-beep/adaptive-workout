/**
 * Pure, React-free state machine for the first-run onboarding flow
 * (ONBOARDING-001). React-free and deterministic; the `OnboardingFlow` component
 * is a thin wrapper over these transitions.
 *
 * The machine owns the ordered step list, next/back with per-step validation,
 * preservation of answers on back navigation, progress derivation, and the
 * production of a completed {@link TrainingProfile} only when every required
 * step is valid.
 *
 * Persistence boundary: the completed profile is emitted through an
 * `onComplete(profile)` callback and held in React memory by the parent. This
 * module never touches localStorage/sessionStorage/IndexedDB/cookies. Cloud
 * persistence is a later task; on reload the flow may restart by design
 * (docs/PRODUCT.md, AGENTS.md).
 *
 * Duration helpers are self-contained here rather than imported from the workout
 * request form, so onboarding has no dependency on a React workout component and
 * the dependency direction stays clean and browser-safe. The semantics mirror
 * WEB_APP-003: custom integer only, 15–240 minutes, empty custom invalid, no
 * silent coercion, preserve custom input across mode switches.
 */

import {
  PROFILE_DURATION_MAX,
  PROFILE_DURATION_MIN,
  profileDurationPresets,
  type ProfileDurationMode,
  type ProfileDurationPreset,
  type ProfileEnvironment,
  type ProfileExperience,
  type ProfileFrequency,
  type ProfileGoal,
  type ProfileProgramPreference,
  type TrainingProfile,
} from './training-profile';

/** Ordered onboarding steps. Deterministic single source of truth for the flow. */
export const onboardingSteps = [
  'goal',
  'experience',
  'frequency',
  'duration',
  'environment',
  'program_preference',
  'discomfort',
  'review',
] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];

/** The first step an authenticated user lands on. */
export const initialOnboardingStep: OnboardingStep = 'goal';

/**
 * The in-progress answers. Mirrors {@link TrainingProfile} but with optional /
 * unvalidated fields plus the duration UI/flow state. Answers are preserved
 * across back navigation because the draft is carried unchanged through
 * transitions.
 */
export interface OnboardingDraft {
  readonly goal: ProfileGoal | null;
  readonly experience: ProfileExperience | null;
  readonly frequency: ProfileFrequency | null;
  readonly durationMode: ProfileDurationMode;
  /** Raw custom entry text, preserved when switching away from Custom. */
  readonly customDurationInput: string;
  /** Resolved authoritative minutes, or null when not yet valid. */
  readonly typicalDurationMinutes: number | null;
  readonly environment: ProfileEnvironment | null;
  readonly programPreference: ProfileProgramPreference | null;
  readonly hasCurrentDiscomfort: boolean | null;
}

export const initialOnboardingDraft: OnboardingDraft = {
  goal: null,
  experience: null,
  frequency: null,
  durationMode: 'preset',
  customDurationInput: '',
  typicalDurationMinutes: null,
  environment: null,
  programPreference: null,
  hasCurrentDiscomfort: null,
};

/** True when the step's answer is present and valid. */
export function isStepValid(step: OnboardingStep, draft: OnboardingDraft): boolean {
  switch (step) {
    case 'goal':
      return draft.goal !== null;
    case 'experience':
      return draft.experience !== null;
    case 'frequency':
      return draft.frequency !== null;
    case 'duration':
      return isDraftDurationValid(draft);
    case 'environment':
      return draft.environment !== null;
    case 'program_preference':
      return draft.programPreference !== null;
    case 'discomfort':
      return draft.hasCurrentDiscomfort !== null;
    case 'review':
      return isProfileCompletable(draft);
  }
}

/**
 * True when every required dimension is valid and a complete profile can be
 * produced. The review step (and Finish setup) depend on this.
 */
export function isProfileCompletable(draft: OnboardingDraft): boolean {
  return (
    draft.goal !== null &&
    draft.experience !== null &&
    draft.frequency !== null &&
    isDraftDurationValid(draft) &&
    draft.environment !== null &&
    draft.programPreference !== null &&
    draft.hasCurrentDiscomfort !== null
  );
}

/**
 * Produces a completed profile only when every required field is valid; returns
 * null otherwise. No coercion — the typed profile is the single validated
 * artifact emitted through `onComplete`. The inline null checks (rather than the
 * {@link isProfileCompletable} predicate) let TypeScript narrow each field to
 * its non-null controlled type.
 */
export function buildProfile(draft: OnboardingDraft): TrainingProfile | null {
  if (
    draft.goal === null ||
    draft.experience === null ||
    draft.frequency === null ||
    draft.environment === null ||
    draft.programPreference === null ||
    draft.hasCurrentDiscomfort === null
  ) {
    return null;
  }
  const typicalDurationMinutes = resolveDraftDurationMinutes(draft);
  if (typicalDurationMinutes === null) return null;
  return {
    goal: draft.goal,
    experience: draft.experience,
    frequency: draft.frequency,
    typicalDurationMinutes,
    environment: draft.environment,
    programPreference: draft.programPreference,
    hasCurrentDiscomfort: draft.hasCurrentDiscomfort,
  };
}

/* ---------- Progress ---------- */

/** One-based progress position (e.g. 2 of 8). Review counts as a step. */
export function stepProgress(step: OnboardingStep): {
  readonly current: number;
  readonly total: number;
} {
  const current = onboardingSteps.indexOf(step) + 1;
  return { current, total: onboardingSteps.length };
}

/* ---------- Step navigation ---------- */

/**
 * Advances to the next step only when the current step is valid. Returns the
 * unchanged step when the current answer is missing or invalid, preventing the
 * user from advancing prematurely.
 */
export function nextStep(step: OnboardingStep, draft: OnboardingDraft): OnboardingStep {
  if (!isStepValid(step, draft)) return step;
  const index = onboardingSteps.indexOf(step);
  if (index < 0 || index >= onboardingSteps.length - 1) return step;
  return onboardingSteps[index + 1] ?? step;
}

/**
 * Returns to the previous step without dropping answers. The draft is preserved
 * by the caller (React), so back navigation never clears prior selections.
 */
export function previousStep(step: OnboardingStep): OnboardingStep {
  const index = onboardingSteps.indexOf(step);
  if (index <= 0) return step;
  return onboardingSteps[index - 1] ?? step;
}

/** True when the given step is the first step (no Back action). */
export function isFirstStep(step: OnboardingStep): boolean {
  return step === onboardingSteps[0];
}

/** True when the given step is the review step (primary action is Finish). */
export function isReviewStep(step: OnboardingStep): boolean {
  return step === 'review';
}

/* ---------- Draft transitions (immutable) ---------- */

export function setGoal(draft: OnboardingDraft, goal: ProfileGoal): OnboardingDraft {
  return { ...draft, goal };
}
export function setExperience(
  draft: OnboardingDraft,
  experience: ProfileExperience,
): OnboardingDraft {
  return { ...draft, experience };
}
export function setFrequency(draft: OnboardingDraft, frequency: ProfileFrequency): OnboardingDraft {
  return { ...draft, frequency };
}
export function setEnvironment(
  draft: OnboardingDraft,
  environment: ProfileEnvironment,
): OnboardingDraft {
  return { ...draft, environment };
}
export function setProgramPreference(
  draft: OnboardingDraft,
  programPreference: ProfileProgramPreference,
): OnboardingDraft {
  return { ...draft, programPreference };
}
export function setHasCurrentDiscomfort(
  draft: OnboardingDraft,
  hasCurrentDiscomfort: boolean,
): OnboardingDraft {
  return { ...draft, hasCurrentDiscomfort };
}

/**
 * Selects a preset duration, making it authoritative. The user's previous custom
 * input is preserved so switching back to Custom restores it.
 */
export function setPresetDuration(
  draft: OnboardingDraft,
  duration: ProfileDurationPreset,
): OnboardingDraft {
  return { ...draft, durationMode: 'preset', typicalDurationMinutes: duration };
}

/**
 * Switches to custom mode, preserving the existing custom input and resolving
 * the authoritative minutes from it. An empty/invalid input resolves to null
 * and is rejected by validation without coercion.
 */
export function setCustomDuration(draft: OnboardingDraft): OnboardingDraft {
  return {
    ...draft,
    durationMode: 'custom',
    typicalDurationMinutes: resolveCustomDurationMinutes(draft.customDurationInput),
  };
}

/**
 * Updates the custom input text. Resolves the authoritative minutes from the
 * text in custom mode; in preset mode the preset stays authoritative and the
 * input is recorded only for a later switch back. Never coerces: empty, decimal,
 * or out-of-range text resolves to null.
 */
export function setCustomDurationInput(draft: OnboardingDraft, input: string): OnboardingDraft {
  const minutes = resolveCustomDurationMinutes(input);
  return {
    ...draft,
    customDurationInput: input,
    typicalDurationMinutes:
      draft.durationMode === 'custom' ? minutes : draft.typicalDurationMinutes,
  };
}

/* ---------- Duration helpers (self-contained pure) ---------- */

/** True when the draft's resolved duration satisfies its mode. */
export function isDraftDurationValid(draft: OnboardingDraft): boolean {
  return resolveDraftDurationMinutes(draft) !== null;
}

/** Resolves the authoritative minutes for a draft, honoring its mode. */
export function resolveDraftDurationMinutes(draft: OnboardingDraft): number | null {
  if (draft.durationMode === 'custom') {
    return resolveCustomDurationMinutes(draft.customDurationInput);
  }
  const minutes = draft.typicalDurationMinutes;
  if (minutes === null) return null;
  return (profileDurationPresets as readonly number[]).includes(minutes) ? minutes : null;
}

/**
 * Parses custom input text into integer minutes, or null when empty,
 * non-integer, or outside the custom bounds. Pure and coercion-free: "12.5",
 * "", and "300" all resolve to null rather than a rounded/clamped value.
 */
export function resolveCustomDurationMinutes(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  // Reject decimals, signs, and anything other than a bare integer.
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number.parseInt(trimmed, 10);
  return isCustomDurationValid(minutes) ? minutes : null;
}

function isCustomDurationValid(minutes: number | null): boolean {
  return (
    minutes !== null &&
    Number.isInteger(minutes) &&
    minutes >= PROFILE_DURATION_MIN &&
    minutes <= PROFILE_DURATION_MAX
  );
}
