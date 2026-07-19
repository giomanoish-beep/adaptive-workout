/**
 * Pure, React-free route definitions for the app navigation (WEB_APP-002).
 * Bottom-tab destinations stay simple and fast; the active workout is a focused
 * flow that is structurally reachable but intentionally NOT a bottom-tab
 * destination — it takes over the full screen when entered (docs/PRODUCT.md,
 * docs/ARCHITECTURE.md). Deterministic and testable in isolation.
 */

export const appRoutes = [
  'today',
  'program',
  'workout',
  'progress',
  'settings',
  'active_workout',
] as const;
export type AppRoute = (typeof appRoutes)[number];

/**
 * The bottom navigation destinations, in display order. These are the stable
 * primary destinations an authenticated user switches between with one thumb.
 * `active_workout` is deliberately excluded — it is a focused flow.
 */
export const bottomNavRoutes: readonly AppRoute[] = [
  'today',
  'program',
  'workout',
  'progress',
  'settings',
];

export interface BottomNavDestination {
  readonly route: AppRoute;
  readonly label: string;
  readonly icon: NavIcon;
}

export const navIcons = ['home', 'calendar', 'sparkles', 'chart', 'gear', 'bolt'] as const;
export type NavIcon = (typeof navIcons)[number];

export const bottomNavDestinations: readonly BottomNavDestination[] = [
  { route: 'today', label: 'Today', icon: 'home' },
  { route: 'program', label: 'Program', icon: 'calendar' },
  { route: 'workout', label: 'Workout', icon: 'sparkles' },
  { route: 'progress', label: 'Progress', icon: 'chart' },
  { route: 'settings', label: 'Settings', icon: 'gear' },
];

/**
 * Routes that take over the full screen and hide the bottom navigation while
 * active. Only `active_workout` is a focused flow today; later WEB_APP tasks
 * may add report/follow-up focused flows to this set without changing the
 * bottom-tab contract.
 */
export const focusedFlowRoutes: readonly AppRoute[] = ['active_workout'];

/**
 * Returns true when the route is a focused flow that should hide the bottom
 * navigation and render full-screen.
 */
export function isFocusedFlow(route: AppRoute): boolean {
  return focusedFlowRoutes.includes(route);
}

/**
 * The route an authenticated user lands on. Deterministic single source of
 * truth for the initial destination.
 */
export const defaultRoute: AppRoute = 'today';

/**
 * Resolves the active bottom-tab destination for a given route. A focused flow
 * like `active_workout` keeps the Workout tab active so the user returns to it
 * when the focused flow exits, matching the product intent that an active
 * session originates from the Workout area.
 */
export function resolveActiveBottomNav(route: AppRoute): AppRoute {
  if (route === 'active_workout') return 'workout';
  if (bottomNavRoutes.includes(route)) return route;
  return defaultRoute;
}

/**
 * Validates that a value is a known app route. Used to guard against unknown
 * route strings before rendering navigation state.
 */
export function isAppRoute(value: unknown): value is AppRoute {
  return typeof value === 'string' && (appRoutes as readonly string[]).includes(value);
}
