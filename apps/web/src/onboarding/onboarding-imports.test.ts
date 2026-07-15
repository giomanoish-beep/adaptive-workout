import { describe, expect, it } from 'vitest';
// Raw source imports (?raw) keep this a static-source check without touching the
// Node fs API or a DOM, matching the repo's existing non-rendering web tests.
import onboardingStateSource from './onboarding-state.ts?raw';
import trainingProfileSource from './training-profile.ts?raw';
import onboardingFlowSource from './OnboardingFlow.tsx?raw';
import appSource from '../App.tsx?raw';

/**
 * ONBOARDING-001 guard: onboarding must not import AI providers, the workout
 * engine, pain-safety, decision persistence, or Supabase server-only packages,
 * and must never persist data in the browser. Also asserts the app-entry
 * behavior (unauthenticated -> sign-in, authenticated without profile ->
 * onboarding, authenticated with profile -> app navigation) without rendering.
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
});

describe('app entry behavior (ONBOARDING-001)', () => {
  it('an authenticated user without a completed profile sees onboarding', () => {
    // App renders OnboardingFlow until an in-memory profile is set.
    expect(appSource).toMatch(/OnboardingFlow/);
    expect(appSource).toMatch(/profile \? <AppNav \/> : <OnboardingFlow/);
  });

  it('an authenticated user with a completed profile enters existing navigation', () => {
    // profile === true renders the existing AppNav navigation.
    expect(appSource).toMatch(/profile \? <AppNav \/> :/);
  });

  it('holds onboarding completion in React memory only, not browser storage', () => {
    expect(appSource).toMatch(/useState<TrainingProfile \| null>/);
    expect(appSource).not.toMatch(/localStorage\./);
    expect(appSource).not.toMatch(/sessionStorage\./);
    expect(appSource).not.toMatch(/document\.cookie/);
  });

  it('keeps the unauthenticated path on the existing SignIn flow', () => {
    // App still hands the unauthenticated shell to AuthShell + SignIn.
    expect(appSource).toMatch(/AuthShell state=\{auth\}/);
  });
});
