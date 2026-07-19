import { describe, expect, it } from 'vitest';
import { deriveAuthState, initialAuthState } from './auth-state';

describe('initialAuthState', () => {
  it('starts in the loading state with no user or error', () => {
    expect(initialAuthState).toEqual({
      status: 'loading',
      user: null,
      errorMessage: null,
      otpEmail: null,
    });
  });
});

describe('deriveAuthState', () => {
  it('derives authenticated from a session with a user id', () => {
    const state = deriveAuthState({ user: { id: 'user-1', email: 'athlete@example.com' } }, null);
    expect(state.status).toBe('authenticated');
    expect(state.user).toEqual({ id: 'user-1', email: 'athlete@example.com' });
    expect(state.errorMessage).toBeNull();
  });

  it('derives unauthenticated from a null session with no error', () => {
    const state = deriveAuthState(null, null);
    expect(state.status).toBe('unauthenticated');
    expect(state.user).toBeNull();
    expect(state.errorMessage).toBeNull();
  });

  it('derives error from an auth error, ignoring the session', () => {
    const state = deriveAuthState({ user: { id: 'user-1' } }, { message: 'Session expired.' });
    expect(state.status).toBe('error');
    expect(state.user).toBeNull();
    expect(state.errorMessage).toBe('Session expired.');
  });

  it('uses a fallback message when the error has none', () => {
    const state = deriveAuthState(null, {});
    expect(state.status).toBe('error');
    expect(state.errorMessage).toBe('Authentication error.');
  });

  it('treats a session without a string user id as unauthenticated', () => {
    const state = deriveAuthState({ user: { id: undefined } }, null);
    expect(state.status).toBe('unauthenticated');
  });

  it('treats a session with an empty user id as unauthenticated', () => {
    const state = deriveAuthState({ user: { id: '' } }, null);
    expect(state.status).toBe('unauthenticated');
  });

  it('keeps email null when the user has no email', () => {
    const state = deriveAuthState({ user: { id: 'user-1' } }, null);
    expect(state.user?.email).toBeNull();
  });

  it('keeps email null when email is an empty string', () => {
    const state = deriveAuthState({ user: { id: 'user-1', email: '' } }, null);
    expect(state.user?.email).toBeNull();
  });

  it('derives the documented statuses without extras', () => {
    const statuses = new Set([
      deriveAuthState(null, null).status,
      deriveAuthState({ user: { id: 'x' } }, null).status,
      deriveAuthState(null, { message: 'e' }).status,
      initialAuthState.status,
    ]);
    expect(statuses).toEqual(new Set(['loading', 'unauthenticated', 'authenticated', 'error']));
  });
});
