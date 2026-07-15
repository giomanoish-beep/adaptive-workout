import { describe, expect, it } from 'vitest';
// Raw source imports (?raw) keep this a static-source check without touching
// the Node fs API, so it stays compatible with the browser-oriented tsconfig.
import validationSource from './active-workout-validation.ts?raw';
import stateSource from './active-workout-state.ts?raw';
import restSource from './active-workout-rest.ts?raw';
import viewSource from './ActiveWorkout.tsx?raw';

/**
 * WEB_APP-004 guard: the browser active-workout flow must not import any
 * server-only package, AI provider, decision persistence, workout-engine
 * invocation, or Supabase client, and must not persist workout/fitness data in
 * the browser (docs/ARCHITECTURE.md, docs/PRODUCT.md). This reads committed
 * source so it fails the build the moment a forbidden import is introduced,
 * with no DOM or bundle execution required.
 */
const activeWorkoutSources: ReadonlyArray<readonly [string, string]> = [
  ['active-workout-validation', validationSource],
  ['active-workout-state', stateSource],
  ['active-workout-rest', restSource],
  ['ActiveWorkout', viewSource],
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
  /@adaptive-workout\/pain-safety/,
  /@adaptive-workout\/workout-engine/,
  /@supabase\/supabase-js/,
  /@supabase\/functions-js/,
  /indexedDB/,
  /from ['"]dexie['"]/,
];

describe('active-workout source hygiene', () => {
  it.each(activeWorkoutSources)(
    '%s imports no server-only, engine, or persistence packages',
    (_name, source) => {
      for (const pattern of forbiddenPatterns) {
        expect(source).not.toMatch(pattern);
      }
    },
  );

  it('introduces no local workout-data persistence in active-workout modules', () => {
    const allSources = activeWorkoutSources.map(([, source]) => source).join('\n');
    expect(allSources).not.toMatch(/localStorage\.setItem/);
    expect(allSources).not.toMatch(/sessionStorage\.setItem/);
    expect(allSources).not.toMatch(/indexedDB/);
  });
});
