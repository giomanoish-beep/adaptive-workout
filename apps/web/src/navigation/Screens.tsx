import type { AppRoute } from './routes';

/**
 * Minimal placeholder screens for routes not yet implemented (WEB_APP-003
 * through WEB_APP-006). Kept intentionally sparse — these exist only to make the
 * navigation scaffold feel coherent and to signal where each product flow will
 * land. No domain logic, no data fetching.
 */
const screenCopy: Record<
  AppRoute,
  { readonly eyebrow: string; readonly title: string; readonly detail: string }
> = {
  today: {
    eyebrow: 'Today',
    title: 'Ready to train.',
    detail: 'Your next session and daily focus will appear here.',
  },
  program: {
    eyebrow: 'Program',
    title: 'Your program.',
    detail: 'Create a program from Today to see its weeks and prescriptions here.',
  },
  workout: {
    eyebrow: 'Workout',
    title: 'Generate a session.',
    detail: 'Request a workout by muscles, time, and equipment.',
  },
  progress: {
    eyebrow: 'Progress',
    title: 'History & progression.',
    detail: 'Past sessions and progression recommendations will appear here.',
  },
  settings: {
    eyebrow: 'Settings',
    title: 'Preferences.',
    detail: 'Training preferences and account settings.',
  },
  active_workout: {
    eyebrow: 'Active session',
    title: 'In progress.',
    detail: 'Set logging and the active workout will appear here.',
  },
};

export function Screen({ route }: { readonly route: AppRoute }) {
  const copy = screenCopy[route];
  return (
    <section className="screen">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2>{copy.title}</h2>
      <p className="screen__detail">{copy.detail}</p>
    </section>
  );
}
