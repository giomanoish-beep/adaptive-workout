import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageSource = (packageName: string) =>
  fileURLToPath(new URL(`./packages/${packageName}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@adaptive-workout/ai': packageSource('ai'),
      '@adaptive-workout/ai-decision-explanation': packageSource('ai-decision-explanation'),
      '@adaptive-workout/ai-deepseek-provider': packageSource('ai-deepseek-provider'),
      '@adaptive-workout/ai-discomfort-extraction': packageSource('ai-discomfort-extraction'),
      '@adaptive-workout/ai-glm-provider': packageSource('ai-glm-provider'),
      '@adaptive-workout/ai-router': packageSource('ai-router'),
      '@adaptive-workout/ai-workout-intent': packageSource('ai-workout-intent'),
      '@adaptive-workout/domain': packageSource('domain'),
      '@adaptive-workout/observability': packageSource('observability'),
      '@adaptive-workout/pain-safety': packageSource('pain-safety'),
      '@adaptive-workout/progression-decision-persistence': packageSource(
        'progression-decision-persistence',
      ),
      '@adaptive-workout/progression-engine': packageSource('progression-engine'),
      '@adaptive-workout/progression-orchestrator': packageSource('progression-orchestrator'),
      '@adaptive-workout/workout-decision-persistence': packageSource(
        'workout-decision-persistence',
      ),
      '@adaptive-workout/workout-engine': packageSource('workout-engine'),
      '@adaptive-workout/workout-gen-orchestrator': packageSource('workout-gen-orchestrator'),
    },
  },
  test: {
    coverage: {
      reporter: ['text', 'html'],
    },
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
  },
});
