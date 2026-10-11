import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeAndroidAuth, subscribeAndroidBack } from './android-lifecycle';

export function subscribeAndroidBackIfAvailable(
  handleBack: () => boolean,
): (() => void) | undefined {
  if (Capacitor.getPlatform() !== 'android') return undefined;
  return subscribeAndroidBack(App, handleBack);
}

export function subscribeAndroidAuthIfAvailable(
  auth: Pick<SupabaseClient['auth'], 'startAutoRefresh' | 'stopAutoRefresh'>,
): (() => void) | undefined {
  if (Capacitor.getPlatform() !== 'android') return undefined;
  return subscribeAndroidAuth(App, auth);
}
