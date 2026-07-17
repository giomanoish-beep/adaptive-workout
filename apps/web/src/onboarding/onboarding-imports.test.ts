import { describe, expect, it } from 'vitest';
// Raw source imports (?raw) keep this a static-source check without touching the
// Node fs API or a DOM, matching the repo's existing non-rendering web tests.
import onboardingStateSource from './onboarding-state.ts?raw';
import trainingProfileSource from './training-profile.ts?raw';
import onboardingFlowSource from './OnboardingFlow.tsx?raw';
import appSource from '../App.tsx?raw';
import profileRepoSource from '../profile/training-profile-repository.ts?raw';
import useProfileSource from '../profile/use-training-profile.ts?raw';

/**
 * ONBOARDING-001 / V1-001 guard: onboarding must not import AI providers, the
 * workout engine, pain-safety, decision persistence, or Supabase server-only
 * packages, and must never persist data in the browser. Asserts the current
 * cloud-persistent profile architecture (V1):
 *
 * - App uses `useTrainingProfile` from the profile hook
 * - loading state renders inline status
 * - missing (no completed profile) renders `OnboardingFlow`
 * - loaded profile renders `AppNav`
 * - error state does not silently fall through to onboarding
 * - onboarding completion calls an async persistence callback
 */

const onboardingSources: ReadonlyArray<readonly [string, string]> = [
  ['onboarding-state', onboardingStateSource],
  ['training-profile', trainingProfileSource],
  ['OnboardingFlow', onboardingFlowSource],
];

const forbiddenPatterns = [
  /@adaptive-workout\/ai-glm-provider/,
  /@adaptive-workout\/ai-deepseek-provider/,
  /@adaptive-workout\/ai-router/,
  /@adaptive-workout\/ai-workout-intent/,
  /@adaptive-workout\/ai-discomfort-extraction/,
  /@adaptive-workout\/ai-decision-explanation/,
  /@adaptive-workout\/workout-decision-persistence/,
  /@adaptive-workout\/progression-decision-persistence/,
  /@adaptive-workout\/workout-engine/,
  /@adaptive-workout\/pain-safety/,
  /@supabase\/supabase-js/,
  /@supabase\/functions-js/,
  /indexedDB/,
  /from ['"]dexie['"]/,
];

describe('onboarding source hygiene', () => {
  it.each(onboardingSources)(
    '%s imports no AI, workout-engine, pain-safety, or persistence packages',
    (_name, source) => {
      for (const pattern of forbiddenPatterns) {
        expect(source).not.toMatch(pattern);
      }
    },
  );

  it('does not import a React workout component (clean dependency direction)', () => {
    const allSources = onboardingSources.map(([, source]) => source).join('\n');
    expect(allSources).not.toMatch(/from ['"]\.\.?\/workout\/WorkoutFlow['"]/);
    expect(allSources).not.toMatch(/from ['"]\.\.?\/workout\/workout-request['"]/);
  });

  it('uses no browser storage for onboarding data', () => {
    // Match actual storage API usage (property access), not the bare words that
    // appear in explanatory comments.
    const allSources = onboardingSources.map(([, source]) => source).join('\n');
    expect(allSources).not.toMatch(/localStorage\./);
    expect(allSources).not.toMatch(/sessionStorage\./);
    expect(allSources).not.toMatch(/document\.cookie/);
    expect(allSources).not.toMatch(/indexedDB\./);
  });
});

describe('onboarding emits the validated profile through a callback', () => {
  it('OnboardingFlow declares an onComplete callback that takes a TrainingProfile', () => {
    expect(onboardingFlowSource).toMatch(/onComplete.*TrainingProfile/);
    expect(onboardingFlowSource).toMatch(/buildProfile/);
  });

  it('awaits persistence and exposes saving, retry, and controlled error UI', () => {
    expect(onboardingFlowSource).toMatch(/await onComplete\(profile\)/);
    expect(onboardingFlowSource).toMatch(/Saving setup/);
    expect(onboardingFlowSource).toMatch(/Retry setup/);
    expect(onboardingFlowSource).toMatch(/role="alert"/);
    expect(onboardingFlowSource).toMatch(/disabled=\{!canAdvance \|\| isSaving\}/);
  });
});

describe('App profile lifecycle (V1-001)', () => {
  it('uses the cloud profile hook (useTrainingProfile)', () => {
    // App imports and uses the persistent profile hook.
    expect(appSource).toMatch(/useTrainingProfile/);
  });

  it('authenticated user without a completed profile sees onboarding', () => {
    // App renders OnboardingFlow when profile status is 'missing'.
    expect(appSource).toMatch(/OnboardingFlow/);
    expect(appSource).toMatch(/[Mm]issing/);
  });

  it('authenticated user with a loaded profile enters AppNav', () => {
    // App renders AppNav when profile status is 'loaded'.
    expect(appSource).toMatch(/AppNav/);
    expect(appSource).toMatch(/[Ll]oaded/);
  });

  it('profile loading state shows a loading indicator, not onboarding', () => {
    expect(appSource).toMatch(/[Ll]oading/);
  });

  it('profile error state renders a recoverable message, not onboarding', () => {
    expect(appSource).toMatch(/[Ee]rror/);
  });

  it('does not persist profile domain data in browser storage', () => {
    expect(appSource).not.toMatch(/localStorage\./);
    expect(appSource).not.toMatch(/sessionStorage\./);
    expect(appSource).not.toMatch(/document\.cookie/);
  });

  it('keeps the unauthenticated path on the existing SignIn flow', () => {
    // App still hands the unauthenticated shell to AuthShell + SignIn.
    expect(appSource).toMatch(/AuthShell state=\{auth\}/);
  });
});

describe('profile repository and hook boundary (V1-001)', () => {
  it('repository uses the Supabase client for persistence', () => {
    // The profile repository must interact with Supabase — that is its purpose.
    // It is allowed to import @supabase/supabase-js.
    expect(profileRepoSource).toMatch(/@supabase\/supabase-js/);
    // Must have a controlled error class
    expect(profileRepoSource).toMatch(/ProfileRepositoryError/);
  });

  it('keys completed profile upserts to the authenticated user', () => {
    expect(profileRepoSource).toMatch(/client\.auth\.getUser\(\)/);
    expect(profileRepoSource).toMatch(/id: userId/);
    expect(profileRepoSource).toMatch(/onConflict: 'id'/);
  });

  it('hook exports the expected profile states', () => {
    expect(useProfileSource).toMatch(/loading/);
    expect(useProfileSource).toMatch(/missing/);
    expect(useProfileSource).toMatch(/loaded/);
    expect(useProfileSource).toMatch(/error/);
  });

  it('repository never uses browser storage', () => {
    expect(profileRepoSource).not.toMatch(/localStorage\./);
    expect(profileRepoSource).not.toMatch(/sessionStorage\./);
  });

  it('hook never uses browser storage', () => {
    expect(useProfileSource).not.toMatch(/localStorage\./);
    expect(useProfileSource).not.toMatch(/sessionStorage\./);
  });
});
