import { useEffect } from 'react';

export function useAndroidBack(enabled: boolean, handleBack: () => boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void import('./android-runtime')
      .then(({ subscribeAndroidBackIfAvailable }) => {
        if (cancelled) return;
        unsubscribe = subscribeAndroidBackIfAvailable(handleBack);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [enabled, handleBack]);
}
