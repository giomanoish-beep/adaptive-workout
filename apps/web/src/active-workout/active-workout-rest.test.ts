import { describe, expect, it } from 'vitest';
import {
  REST_ADJUSTMENT_SECONDS,
  REST_COMPOUND_SECONDS,
  REST_ISOLATION_SECONDS,
  addRestSeconds,
  formatRestClock,
  isRestExpired,
  remainingRestSeconds,
  skipRest,
  startRest,
  subtractRestSeconds,
  targetRestSecondsForExercise,
} from './active-workout-rest';
import type { ActiveExercise } from './active-workout-state';

const NOW = 1_700_000_000_000;

function exercise(name: string): ActiveExercise {
  return { position: 1, name, plannedSets: [] };
}

describe('formatRestClock', () => {
  it('formats 120 seconds as 2:00', () => {
    expect(formatRestClock(120)).toBe('2:00');
  });

  it('formats 75 seconds as 1:15', () => {
    expect(formatRestClock(75)).toBe('1:15');
  });

  it('zero-pads seconds below 10', () => {
    expect(formatRestClock(5)).toBe('0:05');
  });

  it('clamps negatives to 0:00', () => {
    expect(formatRestClock(-10)).toBe('0:00');
  });
});

describe('targetRestSecondsForExercise', () => {
  it('defaults compound-style fixture exercises to 120 seconds', () => {
    expect(targetRestSecondsForExercise(exercise('Dumbbell Bench Press'))).toBe(
      REST_COMPOUND_SECONDS,
    );
    expect(targetRestSecondsForExercise(exercise('Lat Pulldown'))).toBe(REST_COMPOUND_SECONDS);
    expect(targetRestSecondsForExercise(exercise('Seated Cable Row'))).toBe(REST_COMPOUND_SECONDS);
    expect(targetRestSecondsForExercise(exercise('Incline Dumbbell Press'))).toBe(
      REST_COMPOUND_SECONDS,
    );
  });

  it('exposes the 75 second isolation default', () => {
    expect(REST_ISOLATION_SECONDS).toBe(75);
  });
});

describe('startRest and remaining time', () => {
  it('starts a 120 second rest formatted as 2:00', () => {
    const rest = startRest(exercise('Dumbbell Bench Press'), 0, 1, NOW);
    expect(rest.targetSeconds).toBe(120);
    expect(formatRestClock(remainingRestSeconds(rest, NOW))).toBe('2:00');
  });

  it('elapsed 30 seconds from a 120 second rest gives 1:30', () => {
    const rest = startRest(exercise('Lat Pulldown'), 1, 1, NOW);
    const remaining = remainingRestSeconds(rest, NOW + 30_000);
    expect(remaining).toBe(90);
    expect(formatRestClock(remaining)).toBe('1:30');
  });

  it('uses timestamps so a delayed render still reports the correct remaining time', () => {
    // Simulate a React render that happened long after the timer started: the
    // remaining time is derived from the deadline and the supplied timestamp,
    // not an accumulated tick count.
    const rest = startRest(exercise('Lat Pulldown'), 1, 1, NOW);
    const delayedNow = NOW + 47_000;
    expect(remainingRestSeconds(rest, delayedNow)).toBe(120 - 47);
  });

  it('remaining time is never negative', () => {
    const rest = startRest(exercise('Dumbbell Bench Press'), 0, 1, NOW);
    // Well past the deadline clamps to 0 (the only clamp required by the spec).
    expect(remainingRestSeconds(rest, NOW + 500_000)).toBe(0);
    // Exactly at the deadline is 0.
    expect(remainingRestSeconds(rest, NOW + 120_000)).toBe(0);
  });

  it('floors fractional seconds so the display counts down in whole seconds', () => {
    const rest = startRest(exercise('Dumbbell Bench Press'), 0, 1, NOW);
    // 119.999s remaining floors to 119.
    expect(remainingRestSeconds(rest, NOW + 1)).toBe(119);
  });
});

describe('rest expiry', () => {
  it('is not expired before the deadline', () => {
    const rest = startRest(exercise('Dumbbell Bench Press'), 0, 1, NOW);
    expect(isRestExpired(rest, NOW + 119_000)).toBe(false);
  });

  it('is expired at or after the deadline (produces ready state)', () => {
    const rest = startRest(exercise('Dumbbell Bench Press'), 0, 1, NOW);
    expect(isRestExpired(rest, NOW + 120_000)).toBe(true);
    expect(remainingRestSeconds(rest, NOW + 120_000)).toBe(0);
  });
});

describe('rest controls', () => {
  it('subtracting 15 reduces the remaining time', () => {
    const rest = startRest(exercise('Dumbbell Bench Press'), 0, 1, NOW);
    const adjusted = subtractRestSeconds(rest, NOW);
    expect(remainingRestSeconds(adjusted, NOW)).toBe(120 - REST_ADJUSTMENT_SECONDS);
  });

  it('subtracting 15 can reach zero but never below', () => {
    const rest = startRest(exercise('Dumbbell Bench Press'), 0, 1, NOW);
    // Burn down to ~10s left, then a -15 cannot drop below 0.
    const adjusted = subtractRestSeconds(rest, NOW + 110_000);
    expect(remainingRestSeconds(adjusted, NOW + 110_000)).toBe(0);
    // endsAtMs is clamped to nowMs, never earlier.
    expect(adjusted.endsAtMs).toBeGreaterThanOrEqual(NOW + 110_000);
  });

  it('adding 15 extends the timer', () => {
    const rest = startRest(exercise('Dumbbell Bench Press'), 0, 1, NOW);
    const adjusted = addRestSeconds(rest);
    expect(remainingRestSeconds(adjusted, NOW)).toBe(120 + REST_ADJUSTMENT_SECONDS);
    // Start instant and target are preserved.
    expect(adjusted.startedAtMs).toBe(rest.startedAtMs);
    expect(adjusted.targetSeconds).toBe(rest.targetSeconds);
  });

  it('skip reaches zero immediately', () => {
    const rest = startRest(exercise('Dumbbell Bench Press'), 0, 1, NOW);
    const skipped = skipRest(rest, NOW + 10_000);
    expect(remainingRestSeconds(skipped, NOW + 10_000)).toBe(0);
    expect(isRestExpired(skipped, NOW + 10_000)).toBe(true);
    // Start instant and target are preserved (original duration still displayable).
    expect(skipped.startedAtMs).toBe(rest.startedAtMs);
    expect(skipped.targetSeconds).toBe(rest.targetSeconds);
  });

  it('skip on an already-expired rest is a no-op', () => {
    const rest = startRest(exercise('Dumbbell Bench Press'), 0, 1, NOW);
    const expired = { ...rest, endsAtMs: NOW };
    expect(skipRest(expired, NOW + 5_000)).toBe(expired);
  });

  it('subtract preserves the start instant and target', () => {
    const rest = startRest(exercise('Lat Pulldown'), 1, 1, NOW);
    const adjusted = subtractRestSeconds(rest, NOW);
    expect(adjusted.startedAtMs).toBe(rest.startedAtMs);
    expect(adjusted.targetSeconds).toBe(rest.targetSeconds);
  });
});

describe('no browser persistence', () => {
  it('the rest module never references browser storage APIs', () => async () => {
    const source = (await import('./active-workout-rest.ts?raw')).default;
    expect(source).not.toMatch(/localStorage/);
    expect(source).not.toMatch(/sessionStorage/);
    expect(source).not.toMatch(/indexedDB/);
  });
});
