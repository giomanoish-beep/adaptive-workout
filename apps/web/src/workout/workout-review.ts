/**
 * Pure, React-free workout review model and deterministic fixture for the
 * Workout tab review screen (WEB_APP-003). This task is UI and pure web-flow
 * state only; the review fixture stands in for server-side generation, which a
 * later integration task wires (docs/ARCHITECTURE.md). The browser never
 * invokes the workout engine.
 *
 * The fixture is the exact representative review specified by the task so the
 * review UI can be built and tested against a stable shape.
 */

export interface WorkoutReviewRepRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface WorkoutReviewExercise {
  readonly position: number;
  readonly name: string;
  readonly sets: number;
  readonly reps: WorkoutReviewRepRange;
  readonly rir: number;
}

export interface WorkoutReviewMuscleVolume {
  readonly muscle: string;
  readonly volume: number;
}

export interface WorkoutReview {
  readonly title: string;
  readonly estimatedDurationMinutes: number;
  readonly totalWorkingSets: number;
  readonly exercises: readonly WorkoutReviewExercise[];
  readonly muscleVolume: readonly WorkoutReviewMuscleVolume[];
}

/**
 * The deterministic local REVIEW FIXTURE for the initial review UI (task spec).
 * Pure constant — no timers, no async, no engine call. It represents a
 * Chest + Back session of 16 working sets across 4 exercises.
 */
export const workoutReviewFixture: WorkoutReview = {
  title: 'Chest + Back',
  estimatedDurationMinutes: 45,
  totalWorkingSets: 16,
  exercises: [
    {
      position: 1,
      name: 'Dumbbell Bench Press',
      sets: 4,
      reps: { minimum: 8, maximum: 10 },
      rir: 2,
    },
    {
      position: 2,
      name: 'Lat Pulldown',
      sets: 4,
      reps: { minimum: 8, maximum: 10 },
      rir: 2,
    },
    {
      position: 3,
      name: 'Seated Cable Row',
      sets: 4,
      reps: { minimum: 10, maximum: 12 },
      rir: 2,
    },
    {
      position: 4,
      name: 'Incline Dumbbell Press',
      sets: 4,
      reps: { minimum: 8, maximum: 10 },
      rir: 2,
    },
  ],
  muscleVolume: [
    { muscle: 'Chest', volume: 7.6 },
    { muscle: 'Back', volume: 8.0 },
  ],
};

/**
 * Sums the working sets across the review's exercises. Pure projection used by
 * the UI and tests to confirm the fixture totals 16 working sets.
 */
export function totalReviewWorkingSets(review: WorkoutReview): number {
  return review.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
}

/**
 * Formats a rep range for compact display, e.g. "8–10". Pure.
 */
export function formatRepRange(reps: WorkoutReviewRepRange): string {
  return `${reps.minimum}\u2013${reps.maximum}`;
}
