import { describe, expect, it } from 'vitest';
// Raw source imports (?raw) keep this a static-source check without a DOM
// environment, matching the repo's existing non-rendering auth tests.
import authShellSource from './AuthShell.tsx?raw';
import signInSource from './SignIn.tsx?raw';
import useEmailSignInSource from './use-email-sign-in.ts?raw';
import emailSource from './email.ts?raw';
import useAuthSource from './use-auth.ts?raw';

/**
 * WEB_APP-001 fix guard: the unauthenticated AuthShell must render a real
 * sign-in form (email input + Continue action), not just static copy. Asserts
 * the wiring without a DOM, and that session logic stays separate.
 */
describe('AuthShell sign-in wiring (WEB_APP-001 fix)', () => {
  it('renders the SignIn form in the unauthenticated state', () => {
    expect(authShellSource).toMatch(/status === 'unauthenticated'/);
    expect(authShellSource).toMatch(/<SignIn client=\{client\}/);
  });

  it('accepts an optional Supabase client prop', () => {
    expect(authShellSource).toMatch(/readonly client\?: SupabaseClient/);
  });

  it('still renders children for authenticated users', () => {
    expect(authShellSource).toMatch(/auth-shell--authenticated/);
    expect(authShellSource).toMatch(/\{children\}/);
  });
});

describe('SignIn form contract', () => {
  it('has an email input and a Continue with email primary action', () => {
    expect(signInSource).toMatch(/type="email"/);
    expect(signInSource).toMatch(/Continue with email/);
  });

  it('submits through the email sign-in action, not passwords or OAuth', () => {
    expect(signInSource).toMatch(/useEmailSignIn/);
    expect(signInSource).not.toMatch(/signInWithPassword/);
    expect(signInSource).not.toMatch(/signInWithOAuth/);
    expect(signInSource).not.toMatch(/type="password"/);
  });

  it('does not block the UI with window.alert', () => {
    // Browser-storage persistence is already forbidden repo-wide; here we only
    // guard the additionally-requested no-alert rule on actual call sites.
    expect(signInSource).not.toMatch(/window\.alert/);
  });
});

describe('sign-in action wiring', () => {
  it('calls Supabase email OTP with the normalized email', () => {
    expect(useEmailSignInSource).toMatch(/signInWithOtp\(\{/);
    expect(useEmailSignInSource).toMatch(/email: result\.normalized/);
    expect(useEmailSignInSource).toMatch(/options:\s*\{\s*shouldCreateUser: true/);
  });

  it('imports only the client type, never server-only session internals', () => {
    // The action module touches Supabase solely through the passed-in client's
    // auth.signInWithOtp; it does not import session-restore helpers.
    expect(useEmailSignInSource).toMatch(/from '@supabase\/supabase-js'/);
    expect(useEmailSignInSource).not.toMatch(/onAuthStateChange\(/);
    expect(useEmailSignInSource).not.toMatch(/\.getSession\(/);
  });
});

describe('OTP shell wiring (STAB-001)', () => {
  it('renders the OTP screen only for the awaitingOtp state', () => {
    expect(authShellSource).toMatch(/status === 'awaitingOtp'/);
    expect(authShellSource).toMatch(/<VerifyOtp/);
  });

  it('passes resend in-flight and error state to the OTP screen', () => {
    expect(authShellSource).toMatch(
      /resendSubmitting=\{emailSignIn\?\.state\.stage\s+=== 'submitting'\}/,
    );
    expect(authShellSource).toMatch(/resendErrorMessage=/);
  });

  it('guards duplicate resend requests while submitting or cooling down', () => {
    expect(authShellSource).toMatch(/emailSignIn\.state\.stage !== 'submitting'/);
    expect(authShellSource).toMatch(/cooldownSeconds <= 0/);
  });

  it('changes email by resetting local sign-in state without sending a new email', () => {
    const handleBack = authShellSource.slice(
      authShellSource.indexOf('const handleBack = useCallback'),
      authShellSource.indexOf("if (state.status === 'loading')"),
    );
    expect(handleBack).toMatch(/emailSignIn\?\.reset\(\)/);
    expect(handleBack).toMatch(/onOtpBack\?\.\(\)/);
    expect(handleBack).not.toMatch(/signIn\(/);
  });

  it('bypasses the OTP screen when the auth state is authenticated', () => {
    expect(authShellSource).toMatch(/auth-shell--authenticated/);
    expect(authShellSource).toMatch(/\{children\}/);
  });

  it('restores sessions through Supabase auth state rather than a new email request', () => {
    expect(useAuthSource).toMatch(/client\.auth\.getSession\(\)/);
    expect(useAuthSource).toMatch(/client\.auth\.onAuthStateChange/);
    expect(useAuthSource).not.toMatch(/signInWithOtp/);
  });
});

describe('email helper contract', () => {
  it('normalizes by trimming and lowercasing', () => {
    expect(emailSource).toMatch(/\.trim\(\)\.toLowerCase\(\)/);
  });
});
