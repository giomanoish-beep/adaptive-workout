import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { TrainingProfile } from '../onboarding/training-profile';
import { createTrainingProfileRepository } from './training-profile-repository';
import {
  beginOnboardingSave,
  failOnboardingSave,
  finishOnboardingSave,
} from './use-training-profile';

const profile: TrainingProfile = {
  goal: 'recomposition',
  experience: 'intermediate',
  frequency: '4',
  typicalDurationMinutes: 90,
  environment: 'commercial_gym',
  programPreference: 'app_decide',
  hasCurrentDiscomfort: false,
};

function createUpsertClient(options?: {
  readonly userId?: string | null;
  readonly databaseError?: { readonly code: string; readonly message: string };
}) {
  const upsert = vi.fn().mockResolvedValue({
    data: null,
    error: options?.databaseError ?? null,
  });
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: options?.userId === null ? null : { id: options?.userId ?? 'test-user-id' },
        },
        error: null,
      }),
    },
    from: vi.fn(() => ({ upsert })),
  } as unknown as SupabaseClient;

  return { client, upsert };
}

describe('training profile completion persistence', () => {
  it('upserts the deployed column mapping with the authenticated primary key', async () => {
    const { client, upsert } = createUpsertClient({ userId: 'authenticated-user-id' });

    await createTrainingProfileRepository(client).upsertCompletedProfile(profile);

    expect(upsert).toHaveBeenCalledWith(
      {
        id: 'authenticated-user-id',
        goal: 'recomposition',
        experience: 'intermediate',
        training_frequency: '4',
        typical_duration_minutes: 90,
        training_environment: 'commercial_gym',
        program_preference: 'app_decide',
        has_current_discomfort: false,
        onboarding_completed: true,
      },
      { onConflict: 'id' },
    );
  });

  it('returns a controlled error when the authenticated user is missing', async () => {
    const { client, upsert } = createUpsertClient({ userId: null });

    await expect(
      createTrainingProfileRepository(client).upsertCompletedProfile(profile),
    ).rejects.toMatchObject({
      code: 'PROFILE_AUTH_REQUIRED',
      message: 'Your session is unavailable. Sign in again and retry.',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not expose raw database errors', async () => {
    const { client } = createUpsertClient({
      databaseError: { code: '23502', message: 'private SQL detail' },
    });

    await expect(
      createTrainingProfileRepository(client).upsertCompletedProfile(profile),
    ).rejects.toMatchObject({
      code: 'PROFILE_SAVE_FAILED',
      message: 'Failed to save your setup. Please try again.',
    });
  });
});

describe('onboarding profile state transitions', () => {
  it('transitions saving to loaded after persistence succeeds', () => {
    expect(beginOnboardingSave()).toEqual({
      status: 'missing',
      saving: true,
      saveError: null,
    });
    expect(finishOnboardingSave(profile)).toEqual({
      status: 'loaded',
      profile,
      saving: false,
      saveError: null,
    });
  });

  it('returns to a retryable missing state after persistence fails', () => {
    expect(failOnboardingSave('Could not save your setup. Please try again.')).toEqual({
      status: 'missing',
      saving: false,
      saveError: 'Could not save your setup. Please try again.',
    });
  });
});
