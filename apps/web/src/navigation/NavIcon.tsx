import type { NavIcon as NavIconKind } from './routes';

/**
 * Minimal inline SVG icons for bottom navigation. No icon library dependency —
 * keeps the bundle small and the visual language consistent. Each glyph is a
 * simple stroke shape optimized for 24px display at thumb reach.
 */
export function NavIcon({
  kind,
  filled,
}: {
  readonly kind: NavIconKind;
  readonly filled: boolean;
}) {
  const stroke = filled ? 'currentColor' : 'currentColor';
  const strokeWidth = filled ? 2.25 : 1.75;
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (kind) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M4 11.5 12 4l8 7.5" />
          <path
            d={filled ? 'M6 10v9h12v-9' : 'M6 10v9h12v-9'}
            fill={filled ? 'currentColor' : 'none'}
            stroke="none"
          />
          <path d="M6 10v9h12v-9" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16M8 14h3M13 14h3" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg {...common}>
          <path d="M12 4v8M12 16v4M5 12h3M16 12h3" />
          <path d="M9 9l3-3 3 3-3 3z" fill={filled ? 'currentColor' : 'none'} stroke="none" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common}>
          <path d="M5 19h14" />
          <path d="M7 16V11M12 16V7M17 16v-3" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.25" fill={filled ? 'currentColor' : 'none'} stroke="none" />
          <circle cx="12" cy="12" r="3.25" />
          <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...common}>
          <path
            d="M13 3 5 13h6l-1 8 8-10h-6l1-8z"
            fill={filled ? 'currentColor' : 'none'}
            stroke={stroke}
          />
        </svg>
      );
  }
}
