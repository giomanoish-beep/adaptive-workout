/**
 * Pure presentation-label and view-model helpers for the Settings screen
 * (WEB_APP-006). Kept framework-independent so labels and formatting are
 * deterministic, testable, and reusable. No React, Supabase, or browser
 * storage dependencies (AGENTS.md, docs/PRODUCT.md).
 */

import type {
  ProfileExperience,
  ProfileFrequency,
  ProfileGoal,
  ProfileEnvironment,
  ProfileProgramPreference,
  TrainingProfile,
} from '../onboarding/training-profile';

/* ---------- Presentation labels ---------- */

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

/**
 * Settings-specific frequency labels render as "X days/week"
 * to match the user-facing settings card style, distinct from the
 * compact onboarding labels ("X days").
 */
export const frequencyLabels: Readonly<Record<ProfileFrequency, string>> = {
  '2': '2 days/week',
  '3': '3 days/week',
  '4': '4 days/week',
  '5': '5 days/week',
  six_plus: '6+ days/week',
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

/* ---------- Duration formatting ---------- */

/** Formats a typical duration in minutes as a compact user-facing string. */
export function formatDurationMinutes(minutes: number): string {
  return `${minutes} min`;
}

/* ---------- Discomfort status ---------- */

/**
 * Returns a concise, non-diagnostic label for the current discomfort boolean.
 * Never classifies GREEN/ADAPT/STOP and never imports pain-safety.
 */
export function discomfortStatusLabel(hasCurrentDiscomfort: boolean): string {
  return hasCurrentDiscomfort ? 'Discomfort currently affecting training' : 'No current discomfort';
}

/**
 * Returns supplementary copy shown when discomfort is reported, explaining
 * that training adaptation should review the reported discomfort. Kept
 * non-diagnostic per AGENTS.md and docs/PRODUCT.md.
 */
export function discomfortDetailText(): string {
  return (
    'Training adaptation will review your reported discomfort before making ' +
    'programming changes. No medical information is collected or diagnosed.'
  );
}

/* ---------- Profile completion indicator ---------- */

/** A TrainingProfile is considered complete when every required field is set. */
export function isProfileComplete(profile: TrainingProfile): boolean {
  // All fields on the TrainingProfile are required and non-nullable by the
  // type system; a value exists once onboarding finishes so we always return
  // true for a valid profile reference.
  void profile;
  return true;
}

/* ---------- Preference summary rows ---------- */

/** A single read-only preference row displayed in the settings card. */
export interface PreferenceRow {
  readonly label: string;
  readonly value: string;
}

/**
 * Builds the ordered list of read-only preference summary rows from a
 * TrainingProfile. Deterministic: identical profiles yield identical rows.
 */
export function preferenceRows(profile: TrainingProfile): readonly PreferenceRow[] {
  return [
    { label: 'Experience', value: experienceLabels[profile.experience] },
    { label: 'Training frequency', value: frequencyLabels[profile.frequency] },
    { label: 'Typical duration', value: formatDurationMinutes(profile.typicalDurationMinutes) },
    { label: 'Training environment', value: environmentLabels[profile.environment] },
    { label: 'Program preference', value: programPreferenceLabels[profile.programPreference] },
  ];
}
