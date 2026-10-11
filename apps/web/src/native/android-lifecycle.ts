import type { AppPlugin } from '@capacitor/app';
import type { SupabaseClient } from '@supabase/supabase-js';

/** A late native registration must still be removed after React cleanup. */
export function subscribeAndroidBack(app: AppPlugin, handleBack: () => boolean): () => void {
  let active = true;
  const listener = app.addListener('backButton', () => {
    if (active && !handleBack()) void app.minimizeApp();
  });
  return () => {
    active = false;
    void listener.then((handle) => handle.remove());
  };
}

export function subscribeAndroidAuth(
  app: AppPlugin,
  auth: Pick<SupabaseClient['auth'], 'startAutoRefresh' | 'stopAutoRefresh'>,
): () => void {
  let active = true;
  const listener = app.addListener('appStateChange', ({ isActive }) => {
    if (!active) return;
    if (isActive) void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  });
  return () => {
    active = false;
    void listener.then((handle) => handle.remove());
  };
}
