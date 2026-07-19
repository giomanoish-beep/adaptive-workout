import type {
  ExerciseHistorySummary,
  ProgramPrescription,
  ScheduledProgramSession,
} from './contracts.js';

export type ScheduledState = 'upcoming' | 'completed' | 'skipped' | 'rescheduled';

export interface SessionProgress {
  readonly scheduleKey: string;
  readonly state: ScheduledState;
  readonly scheduledDate: string;
}

export function currentProgramWeek(
  startDate: string,
  today: string,
  durationWeeks: number,
): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return 1;
  return Math.min(durationWeeks, Math.max(1, Math.floor((now - start) / 604_800_000) + 1));
}

export function nextScheduledSession(
  schedule: readonly ScheduledProgramSession[],
  progress: readonly SessionProgress[],
): ScheduledProgramSession | null {
  const states = new Map(progress.map((item) => [item.scheduleKey, item.state]));
  return (
    schedule.find(
      (item) => !['completed', 'skipped'].includes(states.get(item.scheduleKey) ?? 'upcoming'),
    ) ?? null
  );
}

export function adherence(progress: readonly SessionProgress[]): number {
  const resolved = progress.filter(
    (item) => item.state === 'completed' || item.state === 'skipped',
  );
  if (resolved.length === 0) return 0;
  return Math.round(
    (resolved.filter((item) => item.state === 'completed').length / resolved.length) * 100,
  );
}

export function completeScheduled(
  progress: readonly SessionProgress[],
  scheduleKey: string,
): readonly SessionProgress[] {
  return progress.map((item) =>
    item.scheduleKey === scheduleKey ? { ...item, state: 'completed' } : item,
  );
}

export function completeAdHoc(progress: readonly SessionProgress[]): readonly SessionProgress[] {
  return progress.map((item) => ({ ...item }));
}

export function applyExerciseHistory(
  prescription: ProgramPrescription,
  history: ExerciseHistorySummary | null,
): ProgramPrescription {
  if (history === null || history.recommendedWeightKg === null) return prescription;
  return {
    ...prescription,
    initialLoadKg: history.recommendedWeightKg,
    calibrationStatus: 'history_based',
    recommendationReason: `Based on ${history.weightKg} kg × ${history.reps} @ RIR ${history.rir === null ? 'Unknown' : history.rir}.`,
  };
}
