import { describe, expect, it } from 'vitest';
// Raw source imports (?raw) keep this a static-source check without touching
// the Node fs API, so it stays compatible with the browser-oriented tsconfig.
import validationSource from './active-workout-validation.ts?raw';
import stateSource from './active-workout-state.ts?raw';
import restSource from './active-workout-rest.ts?raw';
import viewSource from './ActiveWorkout.tsx?raw';

/**
 * V1-003 guard: the browser active-workout flow may import the Supabase client
 * type (needed for cloud session persistence), but must NOT import server-only
 * packages, AI providers, workout-engine, or decision persistence.
 *
 * The ActiveWorkout component uses `useWorkoutSession` which bridges the
 * cloud repository. This is the intended V1 architecture — no in-memory
 * fixture, no browser storage.
 */
const activeWorkoutSources: ReadonlyArray<readonly [string, string]> = [
  ['active-workout-validation', validationSource],
  ['active-workout-state', stateSource],
  ['active-workout-rest', restSource],
  ['ActiveWorkout', viewSource],
];

// Server-only and engine patterns still forbidden
const forbiddenServerPatterns = [
  /@adaptive-workout\/ai-glm-provider/,
  /@adaptive-workout\/ai-deepseek-provider/,
  /@adaptive-workout\/ai-router/,
  /@adaptive-workout\/ai-workout-intent/,
  /@adaptive-workout\/ai-discomfort-extraction/,
  /@adaptive-workout\/ai-decision-explanation/,
  /@adaptive-workout\/workout-decision-persistence/,
  /@adaptive-workout\/progression-decision-persistence/,
  /@adaptive-workout\/pain-safety/,
  /@adaptive-workout\/workout-engine/,
  /@supabase\/functions-js/,
  /indexedDB/,
  /from ['"]dexie['"]/,
];

// The Supabase client type import is allowed ONLY in ActiveWorkout (view)
// because it needs it for the persistence hook. Pure state/validation/rest
// files still forbid it.
const supabasePattern = /@supabase\/supabase-js/;

describe('active-workout source hygiene', () => {
  it('pure modules import no server-only, engine, or persistence packages', () => {
    const pureSources = [
      validationSource,
      stateSource,
      restSource,
    ];
    for (const source of pureSources) {
      for (const pattern of forbiddenServerPatterns) {
        expect(source).not.toMatch(pattern);
      }
      // Pure files still forbid Supabase
      expect(source).not.toMatch(supabasePattern);
    }
  });

  it('ActiveWorkout view may import Supabase for persistence but not server packages', () => {
    // Allow Supabase client (needed for useWorkoutSession)
    expect(viewSource).toMatch(supabasePattern);
    // But still forbid server-only packages
    for (const pattern of forbiddenServerPatterns) {
      expect(viewSource).not.toMatch(pattern);
    }
  });

  it('introduces no local workout-data persistence in active-workout modules', () => {
    const allSources = activeWorkoutSources.map(([, source]) => source).join('\n');
    expect(allSources).not.toMatch(/localStorage\.setItem/);
    expect(allSources).not.toMatch(/sessionStorage\.setItem/);
    expect(allSources).not.toMatch(/indexedDB/);
  });

  it('does not import the workout-generation-gateway (generation is upstream)', () => {
    // Workout generation happens in AppNav/WorkoutFlow; ActiveWorkout only
    // receives the review result and starts a session.
    expect(viewSource).not.toMatch(/workout-generation-gateway/);
  });

  it('uses no workout import fixture in production view', () => {
    // ActiveWorkout must not import workoutReviewFixture for state initialization.
    expect(viewSource).not.toMatch(/workoutReviewFixture/);
  });

  it('uses the cloud session hook (useWorkoutSession)', () => {
    // V1-003: ActiveWorkout persists through useWorkoutSession, not pure in-memory.
    expect(viewSource).toMatch(/useWorkoutSession/);
  });
});