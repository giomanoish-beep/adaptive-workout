import type { LoadedProgram, ProgramTemplateDto, ScheduledWorkoutState } from './program-types';
import type { WorkoutReview } from '../workout/workout-review';

export function currentWeek(program: LoadedProgram, today = localDate()): number {
  const elapsed = Math.floor(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${program.startDate}T00:00:00Z`)) / 604_800_000,
  );
  return Math.min(program.durationWeeks, Math.max(1, elapsed + 1));
}

export function nextWorkout(
  program: LoadedProgram,
  today = localDate(),
): ScheduledWorkoutState | null {
  return (
    program.schedule.find(
      (item) => ['upcoming', 'rescheduled'].includes(item.status) && item.scheduledDate >= today,
    ) ??
    program.schedule.find((item) => ['upcoming', 'rescheduled'].includes(item.status)) ??
    null
  );
}

export function lastCompleted(program: LoadedProgram): ScheduledWorkoutState | null {
  return [...program.schedule].reverse().find((item) => item.status === 'completed') ?? null;
}

export function templateFor(
  program: LoadedProgram,
  scheduled: ScheduledWorkoutState,
): ProgramTemplateDto {
  const template = program.generated.templates.find(
    (item) => item.templateKey === scheduled.templateKey,
  );
  if (!template) throw new Error('The scheduled workout template is unavailable.');
  return template;
}

export function scheduledWorkoutReview(
  program: LoadedProgram,
  scheduled: ScheduledWorkoutState,
): WorkoutReview {
  const template = templateFor(program, scheduled);
  const adaptedPatterns = new Set(
    program.adaptations.flatMap((item) => item.affectedMovementPatterns),
  );
  const exercises = template.prescriptions
    .filter(
      (item) =>
        !adaptedPatterns.has(item.movementPattern) ||
        program.adaptations.every((a) => a.severity !== 'severe'),
    )
    .map((item) => ({
      position: item.position,
      exerciseId: item.exerciseId,
      exerciseVersion: 1,
      name: adaptedPatterns.has(item.movementPattern)
        ? `${item.exerciseName} · adapted`
        : item.exerciseName,
      sets: adaptedPatterns.has(item.movementPattern) ? Math.max(1, item.sets - 1) : item.sets,
      reps: { minimum: item.repsMin, maximum: item.repsMax },
      rir: item.targetRir,
      restSeconds: item.restSeconds,
    }));
  return {
    title: template.name,
    estimatedDurationMinutes: template.expectedDurationMinutes,
    totalWorkingSets: exercises.reduce((sum, item) => sum + item.sets, 0),
    exercises,
    muscleVolume: template.focus.map((muscle) => ({ muscle: titleCase(muscle), volume: 0 })),
  };
}

export function localDate(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function titleCase(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
