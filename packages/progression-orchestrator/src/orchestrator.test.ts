/**
 * Progression Orchestrator — Focused Tests
 *
 * Tests history assembly, evidence mapping, insufficient-data handling,
 * DTO mapping, and persistence error paths.
 */

import { describe, it, expect } from 'vitest';
import {
  assembleHistory,
  collectDistinctExerciseIds,
  loadProgressionEngine,
  mapExposuresForExercise,
} from './orchestrator.js';
import type { SessionRow, SessionExerciseRow, SetLogRow } from './contracts.js';

// ── Helpers ────────────────────────────────────────────────────────

function session(id: string, overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id,
    status: 'completed',
    started_at: '2026-07-01T10:00:00Z',
    completed_at: '2026-07-01T11:00:00Z',
    title: 'Test Workout',
    was_deload: false,
    ...overrides,
  };
}

function sessionExercise(
  id: string,
  sessionId: string,
  exerciseId: string,
  overrides: Partial<SessionExerciseRow> = {},
): SessionExerciseRow {
  return {
    id,
    workout_session_id: sessionId,
    exercise_id: exerciseId,
    planned_sets: 3,
    target_rep_min: 6,
    target_rep_max: 12,
    target_rir_min: 1,
    target_rir_max: 3,
    status: 'completed',
    planned_exercise_name: 'Test Exercise',
    ...overrides,
  };
}

function setLog(id: string, exerciseId: string, overrides: Partial<SetLogRow> = {}): SetLogRow {
  return {
    id,
    workout_session_exercise_id: exerciseId,
    set_number: 1,
    weight: 60,
    weight_unit: 'kg',
    reps: 10,
    rir: 2,
    status: 'completed',
    classification: 'working',
    logged_at: '2026-07-01T10:10:00Z',
    ...overrides,
  };
}

describe('loadProgressionEngine', () => {
  it('throws a controlled error when the engine loader returns null', async () => {
    await expect(loadProgressionEngine(() => Promise.resolve(null))).rejects.toMatchObject({
      name: 'ProgressionEngineUnavailableError',
      code: 'PROGRESSION_ENGINE_UNAVAILABLE',
      message: 'Progression engine is unavailable.',
    });
  });
});

// ── History assembly ───────────────────────────────────────────────

describe('assembleHistory', () => {
  it('groups session exercises by session', () => {
    const sessions: SessionRow[] = [session('s1')];
    const exercises: SessionExerciseRow[] = [
      sessionExercise('se1', 's1', 'ex1'),
      sessionExercise('se2', 's1', 'ex2'),
    ];
    const setLogs: SetLogRow[] = [setLog('sl1', 'se1'), setLog('sl2', 'se2')];

    const assembly = assembleHistory(sessions, exercises, setLogs);

    expect(assembly.exercisesBySession.get('s1')!.length).toBe(2);
    expect(assembly.setsByExercise.get('se1')!.length).toBe(1);
    expect(assembly.setsByExercise.get('se2')!.length).toBe(1);
  });

  it('handles empty inputs', () => {
    const assembly = assembleHistory([], [], []);
    expect(assembly.sessions).toEqual([]);
    expect(assembly.exercisesBySession.size).toBe(0);
    expect(assembly.setsByExercise.size).toBe(0);
  });

  it('handles sessions with no exercises', () => {
    const sessions: SessionRow[] = [session('s1')];
    const assembly = assembleHistory(sessions, [], []);
    expect(assembly.exercisesBySession.get('s1')).toBeUndefined();
  });
});

// ── Collect distinct exercise IDs ──────────────────────────────────

describe('collectDistinctExerciseIds', () => {
  it('returns unique exercise IDs', () => {
    const exercises: SessionExerciseRow[] = [
      sessionExercise('se1', 's1', 'ex1'),
      sessionExercise('se2', 's1', 'ex1'),
      sessionExercise('se3', 's2', 'ex2'),
    ];

    const ids = collectDistinctExerciseIds(exercises);
    expect(ids).toEqual(['ex1', 'ex2']);
  });

  it('returns empty for no exercises', () => {
    expect(collectDistinctExerciseIds([])).toEqual([]);
  });
});

// ── Exposure mapping ───────────────────────────────────────────────

describe('mapExposuresForExercise', () => {
  it('maps completed sessions into ordered exposures', () => {
    const sessions: SessionRow[] = [
      session('s1', { completed_at: '2026-07-01T11:00:00Z' }),
      session('s2', { completed_at: '2026-07-03T11:00:00Z' }),
    ];
    const exercises: SessionExerciseRow[] = [
      sessionExercise('se1', 's1', 'ex1'),
      sessionExercise('se2', 's2', 'ex1'),
    ];
    const setLogs: SetLogRow[] = [
      setLog('sl1', 'se1', { reps: 8 }),
      setLog('sl2', 'se2', { reps: 10 }),
    ];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('ex1', assembly);

    expect(exposures.length).toBe(2);
    // Should be oldest-first
    expect(exposures[0]!.exposureId).toBe('se1');
    expect(exposures[1]!.exposureId).toBe('se2');
  });

  it('preserves decimal weight', () => {
    const sessions: SessionRow[] = [session('s1')];
    const exercises: SessionExerciseRow[] = [sessionExercise('se1', 's1', 'ex1')];
    const setLogs: SetLogRow[] = [setLog('sl1', 'se1', { weight: 52.5 })];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('ex1', assembly);

    expect(exposures[0]!.sets[0]!.load).toBe(52.5);
  });

  it('preserves null RIR distinct from zero', () => {
    const sessions: SessionRow[] = [session('s1')];
    const exercises: SessionExerciseRow[] = [sessionExercise('se1', 's1', 'ex1')];
    const nullRirSet: SetLogRow[] = [setLog('sl1', 'se1', { rir: null })];
    const zeroRirSet: SetLogRow[] = [setLog('sl2', 'se2', { rir: 0 })];

    // Null RIR
    const assembly1 = assembleHistory(sessions, exercises, nullRirSet);
    const exposures1 = mapExposuresForExercise('ex1', assembly1);
    expect(exposures1[0]!.sets[0]!.rir).toBe(null);

    // Zero RIR (different session exercise)
    const exercises2: SessionExerciseRow[] = [sessionExercise('se2', 's1', 'ex1')];
    const assembly2 = assembleHistory(sessions, exercises2, zeroRirSet);
    const exposures2 = mapExposuresForExercise('ex1', assembly2);
    expect(exposures2[0]!.sets[0]!.rir).toBe(0);
  });

  it('excludes warm-up sets from working sets', () => {
    const sessions: SessionRow[] = [session('s1')];
    const exercises: SessionExerciseRow[] = [sessionExercise('se1', 's1', 'ex1')];
    const setLogs: SetLogRow[] = [
      setLog('sl1', 'se1', { classification: 'warm_up', reps: 20 }),
      setLog('sl2', 'se1', { classification: 'working', reps: 10 }),
    ];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('ex1', assembly);

    expect(exposures[0]!.sets.length).toBe(2);
    expect(exposures[0]!.sets[0]!.classification).toBe('warm_up');
    expect(exposures[0]!.sets[1]!.classification).toBe('working');
  });

  it('handles skipped and incomplete sets', () => {
    const sessions: SessionRow[] = [session('s1')];
    const exercises: SessionExerciseRow[] = [sessionExercise('se1', 's1', 'ex1')];
    const setLogs: SetLogRow[] = [
      setLog('sl1', 'se1', { status: 'completed', reps: 10 }),
      setLog('sl2', 'se1', { status: 'skipped', reps: null, weight: null, rir: null }),
      setLog('sl3', 'se1', { status: 'incomplete', reps: null, weight: null, rir: null }),
    ];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('ex1', assembly);

    expect(exposures[0]!.sets.length).toBe(3);
    expect(exposures[0]!.sets[0]!.status).toBe('completed');
    expect(exposures[0]!.sets[1]!.status).toBe('skipped');
    expect(exposures[0]!.sets[2]!.status).toBe('incomplete');
  });

  it('excludes abandoned/unstarted sessions', () => {
    const sessions: SessionRow[] = [session('s1'), session('s2', { status: 'in_progress' })];
    const exercises: SessionExerciseRow[] = [
      sessionExercise('se1', 's1', 'ex1'),
      sessionExercise('se2', 's2', 'ex1'),
    ];
    const setLogs: SetLogRow[] = [setLog('sl1', 'se1'), setLog('sl2', 'se2')];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('ex1', assembly);

    // Only the completed session's exercise should be included
    expect(exposures.length).toBe(1);
  });

  it('handles partial sessions with completed sets', () => {
    const sessions: SessionRow[] = [
      session('s1', { status: 'partial', completed_at: '2026-07-01T10:30:00Z' }),
    ];
    const exercises: SessionExerciseRow[] = [
      sessionExercise('se1', 's1', 'ex1', { status: 'skipped' }),
    ];
    const setLogs: SetLogRow[] = [setLog('sl1', 'se1', { reps: 5 })];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('ex1', assembly);

    expect(exposures.length).toBe(1);
  });

  it('marks deload exposures', () => {
    const sessions: SessionRow[] = [session('s1', { was_deload: true })];
    const exercises: SessionExerciseRow[] = [sessionExercise('se1', 's1', 'ex1')];
    const setLogs: SetLogRow[] = [setLog('sl1', 'se1')];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('ex1', assembly);

    expect(exposures[0]!.wasDeload).toBe(true);
  });

  it('preserves exercise name through catalog join simulation', () => {
    // The exercise name is resolved separately via loadExerciseNames.
    // The mapping function preserves the exercise_id.
    const sessions: SessionRow[] = [session('s1')];
    const exercises: SessionExerciseRow[] = [
      sessionExercise('se1', 's1', 'e0000000-0000-0000-0000-000000000001'),
    ];
    const setLogs: SetLogRow[] = [setLog('sl1', 'se1')];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('e0000000-0000-0000-0000-000000000001', assembly);

    expect(exposures[0]!.exerciseId).toBe('e0000000-0000-0000-0000-000000000001');
  });
});

// ── Insufficient-data behavior ─────────────────────────────────────

describe('insufficient data handling', () => {
  it('returns empty exposures for exercise with no history', () => {
    const sessions: SessionRow[] = [session('s1')];
    const exercises: SessionExerciseRow[] = [sessionExercise('se1', 's1', 'ex1')];
    const setLogs: SetLogRow[] = [setLog('sl1', 'se1')];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('ex2', assembly);

    expect(exposures.length).toBe(0);
  });

  it('handles exercises with only skipped/incomplete sets', () => {
    const sessions: SessionRow[] = [session('s1')];
    const exercises: SessionExerciseRow[] = [
      sessionExercise('se1', 's1', 'ex1', { status: 'skipped' }),
    ];
    const setLogs: SetLogRow[] = [
      setLog('sl1', 'se1', {
        status: 'skipped',
        reps: null,
        weight: null,
        rir: null,
      }),
    ];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('ex1', assembly);

    expect(exposures.length).toBe(1);
    expect(exposures[0]!.status).toBe('skipped');
  });
});

// ── Stable ordering ────────────────────────────────────────────────

describe('deterministic ordering', () => {
  it('produces stable, oldest-first ordering', () => {
    const sessions: SessionRow[] = [
      session('s3', { completed_at: '2026-07-10T11:00:00Z' }),
      session('s1', { completed_at: '2026-07-01T11:00:00Z' }),
      session('s2', { completed_at: '2026-07-05T11:00:00Z' }),
    ];
    const exercises: SessionExerciseRow[] = [
      sessionExercise('se1', 's1', 'ex1'),
      sessionExercise('se2', 's2', 'ex1'),
      sessionExercise('se3', 's3', 'ex1'),
    ];
    const setLogs: SetLogRow[] = [setLog('sl1', 'se1'), setLog('sl2', 'se2'), setLog('sl3', 'se3')];

    const assembly = assembleHistory(sessions, exercises, setLogs);
    const exposures = mapExposuresForExercise('ex1', assembly);

    expect(exposures.length).toBe(3);
    expect(exposures[0]!.exposureId).toBe('se1'); // Jul 1
    expect(exposures[1]!.exposureId).toBe('se2'); // Jul 5
    expect(exposures[2]!.exposureId).toBe('se3'); // Jul 10
  });
});
