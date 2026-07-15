/**
 * Pure, React-free rest-timer logic for the active workout (WEB_APP-004
 * follow-up). Timer math is timestamp-based so the countdown stays correct
 * after delayed React renders: the remaining time is always recomputed from a
 * fixed start instant and the current timestamp, never from an accumulated
 * interval decrement.
 *
 * Determinism: helpers never read `Date.now()` themselves. Every timestamp is
 * passed in by the caller, so the same inputs always produce the same output
 * and the timer logic is fully unit-testable. No localStorage/sessionStorage/
 * IndexedDB (docs/ARCHITECTURE.md).
 */

import type { ActiveExercise } from './active-workout-state';

/**
 * In-memory rest-timer state. Carries a fixed instant the rest was anchored at
 * plus the absolute deadline. The deadline moves when the user adds or
 * subtracts time; the start instant anchors the original duration so the target
 * rest stays displayable. All fields are epoch milliseconds.
 */
export interface RestTimerState {
  /** Epoch ms when this rest began (anchors the original target duration). */
  readonly startedAtMs: number;
  /** Epoch ms when this rest should end. May move with +/-15 controls. */
  readonly endsAtMs: number;
  /** The exercise index this rest was started for. */
  readonly exerciseIndex: number;
  /** The set number whose completion started this rest. */
  readonly setNumber: number;
  /** The original target rest in seconds (for display). */
  readonly targetSeconds: number;
}

/** Amount added/removed by the +/-15 controls, in seconds. */
export const REST_ADJUSTMENT_SECONDS = 15;

/**
 * Deterministic temporary UI default for an exercise's target rest, in seconds.
 *
 * The current review fixture does not expose authoritative per-exercise rest
 * guidance to the UI, so this centralizes the interim default so a later task
 * can swap in planned rest unchanged. Compound-style fixture exercises default
 * to 120s; isolation-style fixture exercises default to 75s.
 *
 * Pure: depends only on the exercise name.
 */
export function targetRestSecondsForExercise(exercise: ActiveExercise): number {
  if (ISOLATION_EXERCISE_NAMES.has(exercise.name)) {
    return REST_ISOLATION_SECONDS;
  }
  return REST_COMPOUND_SECONDS;
}

/** Compound-style fixture exercises default rest, in seconds. */
export const REST_COMPOUND_SECONDS = 120;
/** Isolation-style fixture exercises default rest, in seconds. */
export const REST_ISOLATION_SECONDS = 75;

/**
 * Fixture exercise names treated as isolation-style for the interim rest
 * default. The current review fixture is compound-only, so this set is empty;
 * it exists so {@link targetRestSecondsForExercise} has a single, explicit
 * source of truth that is trivial to replace with authoritative guidance later.
 */
const ISOLATION_EXERCISE_NAMES: ReadonlySet<string> = new Set();

/**
 * Starts a rest timer for the given exercise and set. Pure: the caller supplies
 * `nowMs` (epoch ms) so no clock is read inside. The target rest comes from
 * {@link targetRestSecondsForExercise}.
 */
export function startRest(
  exercise: ActiveExercise,
  exerciseIndex: number,
  setNumber: number,
  nowMs: number,
): RestTimerState {
  const targetSeconds = targetRestSecondsForExercise(exercise);
  return {
    startedAtMs: nowMs,
    endsAtMs: nowMs + targetSeconds * MS_PER_SECOND,
    exerciseIndex,
    setNumber,
    targetSeconds,
  };
}

/**
 * Remaining rest in whole seconds at `nowMs`, never negative. Derived purely
 * from the deadline and the supplied timestamp, so it is correct regardless of
 * how much time passed between renders. Floors fractional seconds so the
 * display counts down 120 -> 119 -> ... rather than showing sub-second values.
 */
export function remainingRestSeconds(rest: RestTimerState, nowMs: number): number {
  const ms = rest.endsAtMs - nowMs;
  if (ms <= 0) return 0;
  return Math.floor(ms / MS_PER_SECOND);
}

/** True when the rest deadline has passed at `nowMs`. Pure. */
export function isRestExpired(rest: RestTimerState, nowMs: number): boolean {
  return nowMs >= rest.endsAtMs;
}

/**
 * Subtracts {@link REST_ADJUSTMENT_SECONDS} from the deadline, clamped so the
 * deadline is never moved before `nowMs` (remaining time never drops below 0).
 * The start instant and target rest are preserved.
 */
export function subtractRestSeconds(rest: RestTimerState, nowMs: number): RestTimerState {
  const minEndsAt = nowMs;
  const nextEndsAt = rest.endsAtMs - REST_ADJUSTMENT_SECONDS * MS_PER_SECOND;
  return { ...rest, endsAtMs: Math.max(nextEndsAt, minEndsAt) };
}

/**
 * Adds {@link REST_ADJUSTMENT_SECONDS} to the deadline, extending the rest. The
 * start instant and target rest are preserved.
 */
export function addRestSeconds(rest: RestTimerState): RestTimerState {
  return { ...rest, endsAtMs: rest.endsAtMs + REST_ADJUSTMENT_SECONDS * MS_PER_SECOND };
}

/**
 * Completes rest immediately: moves the deadline to `nowMs` so the next read of
 * remaining time is 0. The start instant and target rest are preserved so a
 * late re-render of the original state is unaffected.
 */
export function skipRest(rest: RestTimerState, nowMs: number): RestTimerState {
  if (rest.endsAtMs <= nowMs) return rest;
  return { ...rest, endsAtMs: nowMs };
}

/** Milliseconds per second. */
const MS_PER_SECOND = 1000;

/**
 * Formats a duration in seconds as `M:SS` (zero-padded minutes and seconds),
 * e.g. 120 -> "2:00", 75 -> "1:15", 5 -> "0:05". Clamps negatives to 0. Pure.
 */
export function formatRestClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  const paddedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`;
  return `${minutes}:${paddedSeconds}`;
}
