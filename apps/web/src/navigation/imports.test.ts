import { describe, expect, it } from 'vitest';
// Raw source imports (?raw) keep this a static-source check without touching
// the Node fs API, so it stays compatible with the browser-oriented tsconfig.
import routesSource from './routes.ts?raw';
import appNavSource from './AppNav.tsx?raw';
import bottomNavSource from './BottomNav.tsx?raw';
import screensSource from './Screens.tsx?raw';
import navIconSource from './NavIcon.tsx?raw';
import appSource from '../App.tsx?raw';

/**
 * WEB_APP-002 guard: the browser navigation must not import any server-only
 * package or fitness-data persistence. This reads the committed source so it
 * fails the build the moment a forbidden import is introduced, with no DOM or
 * bundle execution required.
 */
const navigationSources: ReadonlyArray<readonly [string, string]> = [
  ['routes', routesSource],
  ['AppNav', appNavSource],
  ['BottomNav', bottomNavSource],
  ['Screens', screensSource],
  ['NavIcon', navIconSource],
  ['App', appSource],
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
  /indexedDB/,
  /from ['"]dexie['"]/,
];

describe('navigation source hygiene', () => {
  it.each(navigationSources)('%s imports no server-only AI packages', (_name, source) => {
    for (const pattern of forbiddenPatterns) {
      expect(source).not.toMatch(pattern);
    }
  });

  it('introduces no local workout-data persistence in navigation modules', () => {
    const allSources = navigationSources.map(([, source]) => source).join('\n');
    expect(allSources).not.toMatch(/localStorage\.setItem/);
    expect(allSources).not.toMatch(/sessionStorage\.setItem/);
  });
});
