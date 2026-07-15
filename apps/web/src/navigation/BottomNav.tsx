import { bottomNavDestinations, resolveActiveBottomNav, type AppRoute } from './routes';
import { NavIcon } from './NavIcon';

/**
 * Fixed bottom navigation bar for authenticated mobile use. The active
 * destination is visually obvious (filled icon + accent color). Reachable with
 * one thumb; safe-area aware for installed iPhone web-app use. Purely
 * presentational — route state is owned by the parent.
 */
export interface BottomNavProps {
  readonly activeRoute: AppRoute;
  readonly onSelect: (route: AppRoute) => void;
}

export function BottomNav({ activeRoute, onSelect }: BottomNavProps) {
  const activeTab = resolveActiveBottomNav(activeRoute);

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {bottomNavDestinations.map((destination) => {
        const isActive = destination.route === activeTab;
        return (
          <button
            key={destination.route}
            type="button"
            className={`bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-pressed={isActive}
            onClick={() => onSelect(destination.route)}
          >
            <span className="bottom-nav__icon">
              <NavIcon kind={destination.icon} filled={isActive} />
            </span>
            <span className="bottom-nav__label">{destination.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
