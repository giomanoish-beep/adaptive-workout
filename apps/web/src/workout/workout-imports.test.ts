import { describe, expect, it } from 'vitest';
// Raw source imports (?raw) keep this a static-source check without touching
// the Node fs API, so it stays compatible with the browser-oriented tsconfig.
import requestSource from './workout-request.ts?raw';
import reviewSource from './workout-review.ts?raw';
import flowSource from './workout-flow.ts?raw';
import requestFormSource from './WorkoutRequestForm.tsx?raw';
import reviewViewSource from './WorkoutReview.tsx?raw';
import flowViewSource from './WorkoutFlow.tsx?raw';

/**
 * WEB_APP-003 / V1-002 guard: the browser workout flow must not import any
 * server-only package, AI provider, decision persistence, or workout-engine
 * modules, and must not persist workout/fitness data in the browser
 * (docs/ARCHITECTURE.md, docs/PRODUCT.md).
 *
 * DI architecture: WorkoutFlow receives `generateReview` as a function prop
 * and does NOT import Supabase, the gateway, or any server packages.
 * The gateway is constructed by AppNav and injected into WorkoutFlow.
 */
const workoutSources: ReadonlyArray<readonly [string, string]> = [
  ['workout-request', requestSource],
  ['workout-review', reviewSource],
  ['workout-flow', flowSource],
  ['WorkoutRequestForm', requestFormSource],
  ['WorkoutReview', reviewViewSource],
  ['WorkoutFlow', flowViewSource],
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

describe('workout source hygiene', () => {
  it.each(workoutSources)('%s imports no server-only or persistence packages', (_name, source) => {
    for (const pattern of forbiddenPatterns) {
      expect(source).not.toMatch(pattern);
    }
  });

  it('introduces no local workout-data persistence in workout modules', () => {
    const allSources = workoutSources.map(([, source]) => source).join('\n');
    expect(allSources).not.toMatch(/localStorage\.setItem/);
    expect(allSources).not.toMatch(/sessionStorage\.setItem/);
  });

  it('WorkoutFlow receives generation as a dependency-injected function', () => {
    // WorkoutFlow's props include generateReview, a function prop — not a
    // direct Supabase or gateway import.
    expect(flowViewSource).toMatch(/generateReview/);
  });

  it('WorkoutFlow does NOT import the workout-engine package', () => {
    // The pure flow module must not depend on engine types; the review fixture
    // is a local presentational model that stands in for server generation.
    expect(flowSource).not.toMatch(/@adaptive-workout\/workout-engine/);
  });

  it('WorkoutFlow does NOT import workout-generation-gateway directly', () => {
    // The gateway is injected by AppNav, not imported by WorkoutFlow.
    expect(flowViewSource).not.toMatch(/workout-generation-gateway/);
  });
});