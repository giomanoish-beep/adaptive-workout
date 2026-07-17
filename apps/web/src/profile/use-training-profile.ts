/**
 * V1-001: React hook for training profile persistence lifecycle.
 *
 * Bridges the profile repository to the auth-aware entry point (App.tsx).
 * Handles loading, missing, loaded, saving, and error states.
 * No browser storage. All persistence via the single Supabase client.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createTrainingProfileRepository,
  ProfileRepositoryError,
  type TrainingProfileRepository,
} from './training-profile-repository';
import type { TrainingProfile } from '../onboarding/training-profile';

/* ------------------------------------------------------------------ */
/*  State types                                                        */
/* ------------------------------------------------------------------ */

export type ProfileLoadStatus = 'loading' | 'missing' | 'loaded' | 'error';

export interface ProfileLoadingState {
  readonly status: 'loading';
}

export interface ProfileMissingState {
  readonly status: 'missing';
}

export interface ProfileLoadedState {
  readonly status: 'loaded';
  readonly profile: TrainingProfile;
  readonly saving: boolean;
  readonly saveError: string | null;
}

export interface ProfileErrorState {
  readonly status: 'error';
  readonly message: string;
}

export type ProfileState =
  | ProfileLoadingState
  | ProfileMissingState
  | ProfileLoadedState
  | ProfileErrorState;

/* ------------------------------------------------------------------ */
/*  Hook result                                                        */
/* ------------------------------------------------------------------ */

export interface UseTrainingProfileResult {
  readonly profileState: ProfileState;
  /** Called once when onboarding finishes. Persists and transitions to loaded. */
  readonly completeOnboarding: (profile: TrainingProfile) => Promise<void>;
  /** Called by Settings to persist an updated profile. */
  readonly updateProfile: (profile: TrainingProfile) => Promise<void>;
  /** Retry loading after a load error. */
  readonly retryLoad: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useTrainingProfile(client: SupabaseClient): UseTrainingProfileResult {
  const repo = useMemo<TrainingProfileRepository>(
    () => createTrainingProfileRepository(client),
    [client],
  );

  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  // Track whether a load has been initiated for this client/identity
  const loadedRef = useRef(false);
  const savingRef = useRef(false);

  const doLoad = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const profile = await repo.loadProfile();
      if (profile === null) {
        setState({ status: 'missing' });
      } else {
        setState({ status: 'loaded', profile, saving: false, saveError: null });
      }
    } catch (err) {
      const message =
        err instanceof ProfileRepositoryError
          ? err.message
          : 'Failed to load your profile.';
      setState({ status: 'error', message });
    } finally {
      loadedRef.current = true;
    }
  }, [repo]);

  // Load on mount / client change
  useEffect(() => {
    loadedRef.current = false;
    void doLoad();
  }, [doLoad]);

  const completeOnboarding = useCallback(
    async (profile: TrainingProfile) => {
      if (savingRef.current) return;
      savingRef.current = true;

      // Transition to a temporary "saving" view on the current loaded state
      if (state.status === 'loaded') {
        setState({ ...state, saving: true, saveError: null });
      }

      try {
        await repo.upsertCompletedProfile(profile);
        setState({ status: 'loaded', profile, saving: false, saveError: null });
      } catch (err) {
        const message =
          err instanceof ProfileRepositoryError
            ? err.message
            : 'Failed to save your profile. Please try again.';
        // Preserve the missing state so user stays on onboarding
        setState({ status: 'missing' });
        // Re-throw so the onboarding can surface the error inline
        throw new ProfileRepositoryError(
          'ONBOARDING_SAVE_FAILED',
          message,
        );
      } finally {
        savingRef.current = false;
      }
    },
    [repo, state],
  );

  const updateProfile = useCallback(
    async (profile: TrainingProfile) => {
      if (state.status !== 'loaded') return;
      if (savingRef.current) return;
      savingRef.current = true;

      const previousProfile = state.profile;
      setState({ ...state, saving: true, saveError: null });

      try {
        await repo.updateProfile(profile);
        setState({ status: 'loaded', profile, saving: false, saveError: null });
      } catch (err) {
        const message =
          err instanceof ProfileRepositoryError
            ? err.message
            : 'Failed to save changes.';
        // Restore previous profile on failure
        setState({
          status: 'loaded',
          profile: previousProfile,
          saving: false,
          saveError: message,
        });
      } finally {
        savingRef.current = false;
      }
    },
    [repo, state],
  );

  const retryLoad = useCallback(async () => {
    await doLoad();
  }, [doLoad]);

  return {
    profileState: state,
    completeOnboarding,
    updateProfile,
    retryLoad,
  };
}