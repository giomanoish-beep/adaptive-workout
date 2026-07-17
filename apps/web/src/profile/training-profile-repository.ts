/**
 * V1-001: Browser-safe training profile persistence boundary.
 *
 * All Supabase reads/writes for the authenticated user's training profile
 * flow through this module. Uses the single Supabase client owned by App.tsx
 * — no second client, no service-role key, no browser storage.
 *
 * RLS is authoritative: every operation is scoped to auth.uid().
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TrainingProfile } from '../onboarding/training-profile';

/* ------------------------------------------------------------------ */
/*  Raw database row shape                                             */
/* ------------------------------------------------------------------ */

interface ProfileRow {
  id: string;
  goal: string | null;
  experience: string | null;
  training_frequency: string | null;
  typical_duration_minutes: number | null;
  training_environment: string | null;
  program_preference: string | null;
  has_current_discomfort: boolean | null;
  onboarding_completed: boolean;
}

/* ------------------------------------------------------------------ */
/*  Controlled errors                                                  */
/* ------------------------------------------------------------------ */

export class ProfileRepositoryError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProfileRepositoryError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/*  Row mapping (pure, testable)                                       */
/* ------------------------------------------------------------------ */

/**
 * Maps a validated database row into a TrainingProfile.
 * Returns null when the row does not represent a completed profile.
 */
export function mapProfileRow(row: ProfileRow): TrainingProfile | null {
  if (!row.onboarding_completed) return null;

  const goal = row.goal;
  const experience = row.experience;
  const frequency = row.training_frequency;
  const duration = row.typical_duration_minutes;
  const environment = row.training_environment;
  const programPreference = row.program_preference;
  const hasCurrentDiscomfort = row.has_current_discomfort;

  // Every field must be non-null for a completed profile
  if (
    goal === null ||
    experience === null ||
    frequency === null ||
    duration === null ||
    environment === null ||
    programPreference === null ||
    hasCurrentDiscomfort === null
  ) {
    return null;
  }

  return {
    goal: goal as TrainingProfile['goal'],
    experience: experience as TrainingProfile['experience'],
    frequency: frequency as TrainingProfile['frequency'],
    typicalDurationMinutes: duration,
    environment: environment as TrainingProfile['environment'],
    programPreference: programPreference as TrainingProfile['programPreference'],
    hasCurrentDiscomfort,
  };
}

/**
 * Validates that a raw database row contains controlled enum values.
 * Returns a list of invalid field paths, or empty if valid.
 */
export function validateProfileRow(row: Record<string, unknown>): readonly string[] {
  const issues: string[] = [];

  const validGoals = [
    'build_muscle',
    'lose_fat',
    'gain_strength',
    'improve_fitness',
    'recomposition',
  ];
  const validExperiences = ['beginner', 'intermediate', 'advanced'];
  const validFrequencies = ['2', '3', '4', '5', 'six_plus'];
  const validEnvironments = ['commercial_gym', 'home_gym', 'minimal_equipment', 'bodyweight'];
  const validProgramPreferences = [
    'app_decide',
    'push_pull_legs',
    'upper_lower',
    'full_body',
    'other',
  ];

  if (row.goal !== null && !validGoals.includes(row.goal as string)) {
    issues.push('goal');
  }
  if (row.experience !== null && !validExperiences.includes(row.experience as string)) {
    issues.push('experience');
  }
  if (
    row.training_frequency !== null &&
    !validFrequencies.includes(row.training_frequency as string)
  ) {
    issues.push('training_frequency');
  }
  if (
    row.training_environment !== null &&
    !validEnvironments.includes(row.training_environment as string)
  ) {
    issues.push('training_environment');
  }
  if (
    row.program_preference !== null &&
    !validProgramPreferences.includes(row.program_preference as string)
  ) {
    issues.push('program_preference');
  }

  return issues;
}

/* ------------------------------------------------------------------ */
/*  Repository factory                                                  */
/* ------------------------------------------------------------------ */

export function createTrainingProfileRepository(client: SupabaseClient) {
  async function requireAuthenticatedUserId(): Promise<string> {
    const { data, error } = await client.auth.getUser();
    const userId = data.user?.id;

    if (error || !userId) {
      throw new ProfileRepositoryError(
        'PROFILE_AUTH_REQUIRED',
        'Your session is unavailable. Sign in again and retry.',
      );
    }

    return userId;
  }

  /**
   * Loads the authenticated user's profile.
   *
   * Returns:
   * - TrainingProfile when a completed profile exists
   * - null when no profile row exists or onboarding is incomplete
   * - throws ProfileRepositoryError on load failure
   */
  async function loadProfile(): Promise<TrainingProfile | null> {
    const userId = await requireAuthenticatedUserId();
    const { data, error } = await client
      .from('profiles')
      .select(
        'id,goal,experience,training_frequency,typical_duration_minutes,training_environment,program_preference,has_current_discomfort,onboarding_completed',
      )
      .eq('id', userId)
      .single();

    if (error) {
      // PGRST116 = no rows returned by .single()
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new ProfileRepositoryError(
        'PROFILE_LOAD_FAILED',
        'Failed to load your profile. Please try again.',
      );
    }

    if (!data) return null;

    const profile = mapProfileRow(data);
    return profile;
  }

  /**
   * Upserts a completed training profile.
   *
   * Inserts a new row or updates the existing one with all profile fields
   * and sets onboarding_completed = true. Used only at onboarding completion.
   */
  async function upsertCompletedProfile(profile: TrainingProfile): Promise<void> {
    const userId = await requireAuthenticatedUserId();
    const { error } = await client.from('profiles').upsert(
      {
        id: userId,
        goal: profile.goal,
        experience: profile.experience,
        training_frequency: profile.frequency,
        typical_duration_minutes: profile.typicalDurationMinutes,
        training_environment: profile.environment,
        program_preference: profile.programPreference,
        has_current_discomfort: profile.hasCurrentDiscomfort,
        onboarding_completed: true,
      },
      { onConflict: 'id' },
    );

    if (error) {
      throw new ProfileRepositoryError(
        'PROFILE_SAVE_FAILED',
        'Failed to save your setup. Please try again.',
      );
    }
  }

  /**
   * Updates all profile fields for an already-completed profile.
   *
   * Used by Settings to persist changes. Preserves onboarding_completed = true.
   * The caller must have an existing completed profile.
   */
  async function updateProfile(profile: TrainingProfile): Promise<void> {
    const userId = await requireAuthenticatedUserId();
    const { error } = await client
      .from('profiles')
      .update({
        goal: profile.goal,
        experience: profile.experience,
        training_frequency: profile.frequency,
        typical_duration_minutes: profile.typicalDurationMinutes,
        training_environment: profile.environment,
        program_preference: profile.programPreference,
        has_current_discomfort: profile.hasCurrentDiscomfort,
      })
      .eq('id', userId)
      .eq('onboarding_completed', true);

    if (error) {
      throw new ProfileRepositoryError(
        'PROFILE_UPDATE_FAILED',
        'Failed to save changes. Please try again.',
      );
    }
  }

  return {
    loadProfile,
    upsertCompletedProfile,
    updateProfile,
  };
}

export type TrainingProfileRepository = ReturnType<typeof createTrainingProfileRepository>;
