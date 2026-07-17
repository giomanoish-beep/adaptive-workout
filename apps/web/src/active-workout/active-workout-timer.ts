import { useEffect, useState } from 'react';

/**
 * Hook that holds the current timestamp in state and refreshes it every
 * second while `active` is true. Returns `Date.now()` pulses so
 * downstream timestamp-based rest logic (remainingRestSeconds, isRestExpired)
 * can react.
 *
 * Timestamp-based: no decrementing counter — the rest state's deadline is
 * the source of truth. This hook only triggers re-renders so the component
 * recomputes remaining time from the deadline and the current pulse.
 */
export function useNow(active: boolean): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!active) {
      setNowMs(Date.now());
      return;
    }

    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(id);
  }, [active]);

  return nowMs;
}