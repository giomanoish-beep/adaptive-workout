import { describe, expect, it } from 'vitest';
import indexSource from './index.ts?raw';
import explainerSource from './ai-explainer.ts?raw';

describe('generate-workout AI production boundary', () => {
  it('wires the Edge Function to create a server-side decision explainer from Deno env', () => {
    expect(indexSource).toMatch(/createProductionDecisionExplainer/);
    expect(indexSource).toMatch(/env: Deno\.env/);
    expect(indexSource).toMatch(/decisionExplainer/);
    expect(indexSource).toMatch(/generateWorkout\(body, userId, dependencies, sink\)/);
  });

  it('registers only the grounded decision explanation handlers', () => {
    expect(explainerSource).toMatch(
      /registerDeepSeekTaskHandler\('grounded_decision_explanation', deepseekExplanationHandler\)/,
    );
    expect(explainerSource).toMatch(
      /registerGlmTaskHandler\('grounded_decision_explanation', glmExplanationHandler\)/,
    );
    expect(explainerSource).not.toMatch(/discomfort_observation_extraction/);
    expect(explainerSource).not.toMatch(/workout_intent_extraction/);
  });

  it('does not expose provider internals through the browser-facing result', () => {
    expect(explainerSource).not.toMatch(/providerRequestId.*explanation/);
    expect(explainerSource).not.toMatch(/responseMetadata.*explanation/);
    expect(explainerSource).not.toMatch(/prompt.*explanation/);
  });
});
