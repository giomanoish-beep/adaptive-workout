import { describe, expect, it } from 'vitest';
import {
  appRoutes,
  bottomNavDestinations,
  bottomNavRoutes,
  defaultRoute,
  focusedFlowRoutes,
  isAppRoute,
  isFocusedFlow,
  resolveActiveBottomNav,
} from './routes';

describe('route definitions', () => {
  it('defines exactly the documented destinations plus the active-workout focused flow', () => {
    expect(appRoutes).toEqual(['today', 'workout', 'progress', 'settings', 'active_workout']);
  });

  it('exposes four bottom navigation destinations in a stable order', () => {
    expect(bottomNavRoutes).toEqual(['today', 'workout', 'progress', 'settings']);
    expect(bottomNavDestinations.map((d) => d.route)).toEqual(bottomNavRoutes);
  });

  it('gives every bottom destination a concise label and icon', () => {
    for (const destination of bottomNavDestinations) {
      expect(destination.label.length).toBeLessThanOrEqual(10);
      expect(destination.icon).toBeTruthy();
    }
  });

  it('excludes the active workout from bottom navigation', () => {
    expect(bottomNavRoutes).not.toContain('active_workout');
  });
});

describe('focused flow semantics', () => {
  it('treats active_workout as a focused flow', () => {
    expect(focusedFlowRoutes).toEqual(['active_workout']);
    expect(isFocusedFlow('active_workout')).toBe(true);
  });

  it('does not treat any bottom-tab route as a focused flow', () => {
    for (const route of bottomNavRoutes) {
      expect(isFocusedFlow(route)).toBe(false);
    }
  });
});

describe('resolveActiveBottomNav', () => {
  it('maps each bottom-tab route to itself', () => {
    expect(resolveActiveBottomNav('today')).toBe('today');
    expect(resolveActiveBottomNav('workout')).toBe('workout');
    expect(resolveActiveBottomNav('progress')).toBe('progress');
    expect(resolveActiveBottomNav('settings')).toBe('settings');
  });

  it('maps the active-workout focused flow back to the workout tab', () => {
    expect(resolveActiveBottomNav('active_workout')).toBe('workout');
  });

  it('is deterministic for identical inputs', () => {
    for (const route of appRoutes) {
      expect(resolveActiveBottomNav(route)).toBe(resolveActiveBottomNav(route));
    }
  });
});

describe('default route', () => {
  it('defaults authenticated users to today', () => {
    expect(defaultRoute).toBe('today');
    expect(isFocusedFlow(defaultRoute)).toBe(false);
  });
});

describe('isAppRoute guard', () => {
  it.each(appRoutes)('accepts known route %s', (route) => {
    expect(isAppRoute(route)).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isAppRoute('dashboard')).toBe(false);
    expect(isAppRoute('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isAppRoute(null)).toBe(false);
    expect(isAppRoute(42)).toBe(false);
    expect(isAppRoute(undefined)).toBe(false);
  });
});
