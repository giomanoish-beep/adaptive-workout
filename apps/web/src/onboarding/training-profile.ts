/**
 * Pure, React-free training-profile model for first-run onboarding
 * (ONBOARDING-001). Each profile field is a controlled string union so the app
 * never stores arbitrary user text for these dimensions (docs/PRODUCT.md).
 *
 * This task is UI and pure in-memory state only. The completed profile is
 * emitted through an `onComplete` callback and held in React memory by the
 * parent; it is NOT persisted to Supabase or browser storage here. Cloud
 * persistence will be wired in a later task — until then, onboarding may appear
 * again on page reload. That is intentional and not worked around with
 * localStorage/sessionStorage/IndexedDB/cookies (docs/PRODUCT.md, AGENTS.md).
 *
 * Discomfort capture is deliberately non-diagnostic: only the boolean
 * has-current-discomfort flag is recorded here. Details, GREEN/ADAPT/STOP
 * classification, and pain-safety imports are out of scope for this task
 * (AGENTS.md, docs/PRODUCT.md).
 */

/* ---------- Controlled option sets ---------- */

export const profileGoals = [
  'build_muscle',
  'lose_fat',
  'gain_strength',
  'improve_fitness',
  'recomposition',
] as const;
export type ProfileGoal = (typeof profileGoals)[number];

export const profileExperiences = ['beginner', 'intermediate', 'advanced'] as const;
export type ProfileExperience = (typeof profileExperiences)[number];

/** Training frequency, in days per week. `six_plus` is the 6+ days option. */
export const profileFrequencies = ['2', '3', '4', '5', 'six_plus'] as const;
export type ProfileFrequency = (typeof profileFrequencies)[number];

export const profileEnvironments = [
  'commercial_gym',
  'home_gym',
  'minimal_equipment',
  'bodyweight',
] as const;
export type ProfileEnvironment = (typeof profileEnvironments)[number];

export const profileProgramPreferences = [
  'app_decide',
  'push_pull_legs',
  'upper_lower',
  'full_body',
  'other',
] as const;
export type ProfileProgramPreference = (typeof profileProgramPreferences)[number];

/* ---------- Bound options (duration) ---------- */

/** Preset duration options, in minutes. */
export const profileDurationPresets = [30, 45, 60, 75, 90, 120] as const;
export type ProfileDurationPreset = (typeof profileDurationPresets)[number];

/** Whether the typical duration came from a preset or a custom entry. */
export type ProfileDurationMode = 'preset' | 'custom';

/** Inclusive bounds for a custom duration, in minutes. */
export const PROFILE_DURATION_MIN = 15;
export const PROFILE_DURATION_MAX = 240;

/* ---------- Completed profile ---------- */

/**
 * The completed, validated training profile. Every field is a controlled value
 * — no arbitrary user strings. Produced only by the onboarding state machine
 * when every required step is valid.
 */
export interface TrainingProfile {
  readonly goal: ProfileGoal;
  readonly experience: ProfileExperience;
  readonly frequency: ProfileFrequency;
  readonly typicalDurationMinutes: number;
  readonly environment: ProfileEnvironment;
  readonly programPreference: ProfileProgramPreference;
  /** True when the user reported something currently affecting training. */
  readonly hasCurrentDiscomfort: boolean;
}

/**
 * Human-readable labels for a completed profile dimension, used by the review
 * screen. Each row pairs a dimension name with the chosen value's display text.
 * Derived purely from a {@link TrainingProfile}; deterministic and ordered to
 * match the seven onboarding questions.
 */
export interface ProfileReviewRow {
  readonly dimension: string;
  readonly value: string;
}

export const goalLabels: Readonly<Record<ProfileGoal, string>> = {
  build_muscle: 'Build muscle',
  lose_fat: 'Lose fat',
  gain_strength: 'Gain strength',
  improve_fitness: 'Improve fitness',
  recomposition: 'Recomposition',
};

export const experienceLabels: Readonly<Record<ProfileExperience, string>> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const frequencyLabels: Readonly<Record<ProfileFrequency, string>> = {
  '2': '2 days',
  '3': '3 days',
  '4': '4 days',
  '5': '5 days',
  six_plus: '6+ days',
};

export const environmentLabels: Readonly<Record<ProfileEnvironment, string>> = {
  commercial_gym: 'Commercial gym',
  home_gym: 'Home gym',
  minimal_equipment: 'Minimal equipment',
  bodyweight: 'Bodyweight',
};

export const programPreferenceLabels: Readonly<Record<ProfileProgramPreference, string>> = {
  app_decide: 'Let the app decide',
  push_pull_legs: 'Push Pull Legs',
  upper_lower: 'Upper Lower',
  full_body: 'Full Body',
  other: 'Other',
};

/**
 * Compact review summary of all seven profile dimensions, in onboarding order.
 * Pure: identical profiles yield identical rows.
 */
export function profileReviewRows(profile: TrainingProfile): readonly ProfileReviewRow[] {
  return [
    { dimension: 'Goal', value: goalLabels[profile.goal] },
    { dimension: 'Experience', value: experienceLabels[profile.experience] },
    { dimension: 'Frequency', value: frequencyLabels[profile.frequency] },
    { dimension: 'Typical duration', value: `${profile.typicalDurationMinutes} min` },
    { dimension: 'Environment', value: environmentLabels[profile.environment] },
    { dimension: 'Program preference', value: programPreferenceLabels[profile.programPreference] },
    {
      dimension: 'Current discomfort',
      value: profile.hasCurrentDiscomfort ? 'Yes — affecting training' : 'No current discomfort',
    },
  ];
}
