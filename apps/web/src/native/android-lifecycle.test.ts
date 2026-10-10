import { describe, expect, it, vi } from 'vitest';
import type { AppPlugin, AppState } from '@capacitor/app';
import { subscribeAndroidAuth, subscribeAndroidBack } from './android-lifecycle';

function fakeApp() {
  let backListener: (() => void) | undefined;
  let stateListener: ((state: AppState) => void) | undefined;
  const removeBack = vi.fn();
  const removeState = vi.fn();
  const minimizeApp = vi.fn().mockResolvedValue(undefined);
  const app = {
    addListener: vi.fn((event: string, listener: (...args: never[]) => void) => {
      if (event === 'backButton') backListener = listener;
      if (event === 'appStateChange') stateListener = listener as (state: AppState) => void;
      return Promise.resolve({ remove: event === 'backButton' ? removeBack : removeState });
    }),
    minimizeApp,
  } as unknown as AppPlugin;
  return {
    app,
    minimizeApp,
    removeBack,
    removeState,
    fireBack: () => backListener?.(),
    fireState: (isActive: boolean) => stateListener?.({ isActive }),
  };
}

describe('Android lifecycle integration', () => {
  it('handles an in-app back action without minimizing the app', () => {
    const native = fakeApp();
    const handleBack = vi.fn(() => true);
    subscribeAndroidBack(native.app, handleBack);

    native.fireBack();

    expect(handleBack).toHaveBeenCalledOnce();
    expect(native.minimizeApp).not.toHaveBeenCalled();
  });

  it('minimizes when the app has no in-app back destination', () => {
    const native = fakeApp();
    subscribeAndroidBack(native.app, () => false);

    native.fireBack();

    expect(native.minimizeApp).toHaveBeenCalledOnce();
  });

  it('starts and stops Supabase token refresh with the native app lifecycle', () => {
    const native = fakeApp();
    const startAutoRefresh = vi.fn();
    const stopAutoRefresh = vi.fn();
    const unsubscribe = subscribeAndroidAuth(native.app, {
      startAutoRefresh,
      stopAutoRefresh,
    });

    native.fireState(false);
    native.fireState(true);
    unsubscribe();
    native.fireState(false);

    expect(stopAutoRefresh).toHaveBeenCalledOnce();
    expect(startAutoRefresh).toHaveBeenCalledOnce();
  });
});
