import { useCallback, useState } from 'react';
import { defaultRoute, isFocusedFlow, type AppRoute } from './routes';
import { BottomNav } from './BottomNav';
import { Screen } from './Screens';
import { WorkoutFlow } from '../workout/WorkoutFlow';
import { ActiveWorkout } from '../active-workout/ActiveWorkout';

/**
 * Authenticated navigation container. Owns the active route and decides whether
 * the bottom navigation is visible. Focused flows (e.g. active workout) render
 * full-screen with no bottom bar, but the parent can hand the user back to the
 * originating tab via `onExitFocusedFlow`. No domain logic lives here.
 */
export interface AppNavProps {
  readonly initialRoute?: AppRoute;
  readonly onExitFocusedFlow?: () => void;
}

export function AppNav({ initialRoute = defaultRoute, onExitFocusedFlow }: AppNavProps) {
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const focused = isFocusedFlow(route);

  const handleSelect = useCallback((next: AppRoute) => {
    setRoute(next);
  }, []);

  const handleExit = useCallback(() => {
    setRoute('workout');
    onExitFocusedFlow?.();
  }, [onExitFocusedFlow]);

  return (
    <div className={`app-nav${focused ? ' app-nav--focused' : ''}`}>
      <div className="app-nav__content">
        {route === 'workout' ? (
          <WorkoutFlow onStartWorkout={() => setRoute('active_workout')} />
        ) : route === 'active_workout' ? (
          <ActiveWorkout onExit={handleExit} />
        ) : (
          <Screen route={route} />
        )}
      </div>
      {!focused && <BottomNav activeRoute={route} onSelect={handleSelect} />}
    </div>
  );
}
