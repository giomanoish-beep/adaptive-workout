import { describe, expect, it, vi } from 'vitest';
import { createWorkoutSessionRepository, WorkoutSessionError } from './workout-session-repository';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkoutReview } from '../workout/workout-review';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildMockClient(overrides?: {
  getUserResponse?: { data: { user: { id: string } | null }; error: Error | null };
  insertResponse?: { data: unknown; error: Error | null };
}) {
  const getUser = vi.fn().mockResolvedValue(
    overrides?.getUserResponse ?? {
      data: { user: { id: 'auth-user-123' } },
      error: null,
    },
  );

  const insert = vi.fn();
  const deleteFn = vi.fn();

  // Default: return a successful insert that resolves with the expected row
  insert.mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        overrides?.insertResponse ?? {
          data: {
            id: 'session-001',
            user_id: 'auth-user-123',
            title: 'Test Workout',
            origin: 'generated',
            status: 'in_progress',
            started_at: '2026-07-17T10:00:00.000Z',
            completed_at: null,
            planned_duration_minutes: 45,
            created_at: '2026-07-17T10:00:00.000Z',
          },
          error: null,
        },
      ),
    }),
  });

  deleteFn.mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const from = vi.fn().mockReturnValue({
    insert,
    select: vi.fn(),
    delete: deleteFn,
    update: vi.fn(),
    upsert: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
  });

  const auth = {
    getUser,
    getSession: vi.fn(),
    signOut: vi.fn(),
  };

  return {
    client: { auth, from } as unknown as SupabaseClient,
    getUser,
    insert,
    delete: deleteFn,
  };
}

function buildReview(overrides?: Partial<WorkoutReview>): WorkoutReview {
  return {
    title: 'Test Workout',
    estimatedDurationMinutes: 45,
    totalWorkingSets: 6,
    exercises: [
      {
        position: 1,
        name: 'Bench Press',
        sets: 3,
        reps: { minimum: 8, maximum: 12 },
        rir: 2,
      },
      {
        position: 2,
        name: 'Squat',
        sets: 3,
        reps: { minimum: 8, maximum: 10 },
        rir: 2,
      },
    ],
    muscleVolume: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWorkoutSessionRepository', () => {
  describe('createSession', () => {
    it('includes the authenticated user_id in the insert payload', async () => {
      const { client, insert } = buildMockClient();
      const repo = createWorkoutSessionRepository(client);
      const review = buildReview();

      await repo.createSession(review);

      // Verify insert was called with user_id from auth.getUser()
      const insertCall = insert.mock.calls[0] as [Record<string, unknown>];
      expect(insertCall[0]).toHaveProperty('user_id', 'auth-user-123');
    });

    it('rejects with AUTH_REQUIRED when no authenticated user exists', async () => {
      const { client } = buildMockClient({
        getUserResponse: { data: { user: null }, error: new Error('No session') },
      });
      const repo = createWorkoutSessionRepository(client);

      await expect(repo.createSession(buildReview())).rejects.toThrow(WorkoutSessionError);

      try {
        await repo.createSession(buildReview());
      } catch (err) {
        expect(err).toBeInstanceOf(WorkoutSessionError);
        expect((err as WorkoutSessionError).code).toBe('AUTH_REQUIRED');
        expect((err as WorkoutSessionError).message).toBe(
          'You must be signed in to start a workout.',
        );
      }
    });

    it('rejects with AUTH_REQUIRED when getUser returns an error', async () => {
      const { client } = buildMockClient({
        getUserResponse: { data: { user: null }, error: new Error('token expired') },
      });
      const repo = createWorkoutSessionRepository(client);

      try {
        await repo.createSession(buildReview());
        expect.fail('Expected WorkoutSessionError');
      } catch (err) {
        expect(err).toBeInstanceOf(WorkoutSessionError);
        expect((err as WorkoutSessionError).code).toBe('AUTH_REQUIRED');
        // Message must not expose the raw error
        expect((err as WorkoutSessionError).message).not.toContain('token');
        expect((err as WorkoutSessionError).message).not.toContain('expired');
      }
    });

    it('never uses a userId from the review — ownership comes from auth.getUser()', async () => {
      // The repository does not even accept a userId parameter; it derives it
      // internally from client.auth.getUser(). This test verifies the insert
      // always uses the user ID from the auth client.
      const { client } = buildMockClient({
        getUserResponse: { data: { user: { id: 'real-auth-user' } }, error: null },
      });
      const repo = createWorkoutSessionRepository(client);

      // Pass a review with no ownership concept at all
      const review = buildReview();
      await repo.createSession(review);

      // The repo should have called auth.getUser() once
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest mock assertion on a mocked method
      expect(client.auth.getUser).toHaveBeenCalledOnce();
    });

    it('inserts all deployed columns for the workout_sessions row', async () => {
      const { client, insert } = buildMockClient();
      const repo = createWorkoutSessionRepository(client);
      const review = buildReview({ title: 'Upper Body', estimatedDurationMinutes: 60 });

      await repo.createSession(review);

      const insertCall = insert.mock.calls[0] as [Record<string, unknown>];
      const payload = insertCall[0];

      // Required identity column
      expect(payload).toHaveProperty('user_id', 'auth-user-123');
      // Snapshot columns
      expect(payload).toHaveProperty('title', 'Upper Body');
      expect(payload).toHaveProperty('origin', 'generated');
      expect(payload).toHaveProperty('status', 'in_progress');
      expect(payload).toHaveProperty('planned_duration_minutes', 60);
      expect(payload).toHaveProperty('started_at');
      expect(typeof payload['started_at']).toBe('string');
    });

    it('inserts exercise rows linked to the created session', async () => {
      const { client, insert } = buildMockClient({
        insertResponse: {
          data: {
            id: 'session-001',
            user_id: 'auth-user-123',
            title: 'Test Workout',
            origin: 'generated',
            status: 'in_progress',
            started_at: '2026-07-17T10:00:00.000Z',
            completed_at: null,
            planned_duration_minutes: 45,
            created_at: '2026-07-17T10:00:00.000Z',
          },
          error: null,
        },
      });
      const repo = createWorkoutSessionRepository(client);

      await repo.createSession(buildReview());

      // insert should have been called at least 2 times (session + exercises)
      expect(insert.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Second call should be an exercise insert with workout_session_id matching
      // the session ID
      const exerciseCall = insert.mock.calls[1] as [Record<string, unknown>];
      expect(exerciseCall[0]).toHaveProperty('workout_session_id', 'session-001');
      expect(exerciseCall[0]).toHaveProperty('planned_exercise_name');
    });

    it('redacts raw database errors on insert failure', async () => {
      const { client } = buildMockClient({
        insertResponse: {
          data: null,
          error: Object.assign(
            new Error('new row violates row-level security policy for table "workout_sessions"'),
            { code: '42501' },
          ),
        },
      });
      const repo = createWorkoutSessionRepository(client);

      try {
        await repo.createSession(buildReview());
        expect.fail('Expected WorkoutSessionError');
      } catch (err) {
        expect(err).toBeInstanceOf(WorkoutSessionError);
        expect((err as WorkoutSessionError).code).toBe('SESSION_CREATE_FAILED');
        const message = (err as WorkoutSessionError).message;
        // Must NOT contain raw PostgreSQL/Supabase details
        expect(message).not.toContain('row-level security');
        expect(message).not.toContain('violates');
        expect(message).not.toContain('42501');
        expect(message).not.toContain('workout_sessions');
        // Must be a user-friendly message
        expect(message).toBe("We couldn't start your workout. Please try again.");
      }
    });

    it('redacts raw database errors on exercise insert failure', async () => {
      let callCount = 0;
      const insert = vi.fn().mockImplementation(() => {
        callCount++;
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(
              // First call (session) succeeds, second call (exercise) fails
              callCount === 1
                ? {
                    data: {
                      id: 'session-001',
                      user_id: 'auth-user-123',
                      title: 'Test Workout',
                      origin: 'generated',
                      status: 'in_progress',
                      started_at: '2026-07-17T10:00:00.000Z',
                      completed_at: null,
                      planned_duration_minutes: 45,
                      created_at: '2026-07-17T10:00:00.000Z',
                    },
                    error: null,
                  }
                : {
                    data: null,
                    error: Object.assign(
                      new Error(
                        'new row violates row-level security policy for table "workout_session_exercises"',
                      ),
                      { code: '42501' },
                    ),
                  },
            ),
          }),
        };
      });

      const deleteFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const from = vi.fn().mockReturnValue({
        insert,
        select: vi.fn(),
        delete: deleteFn,
        update: vi.fn(),
        upsert: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        in: vi.fn(),
        limit: vi.fn(),
      });

      const client = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'auth-user-123' } },
            error: null,
          }),
          getSession: vi.fn(),
          signOut: vi.fn(),
        },
        from,
      } as unknown as SupabaseClient;

      const repo = createWorkoutSessionRepository(client);

      try {
        await repo.createSession(buildReview());
        expect.fail('Expected WorkoutSessionError');
      } catch (err) {
        expect(err).toBeInstanceOf(WorkoutSessionError);
        expect((err as WorkoutSessionError).code).toBe('EXERCISE_CREATE_FAILED');
        const message = (err as WorkoutSessionError).message;
        // Must NOT contain raw PostgreSQL/Supabase details
        expect(message).not.toContain('row-level security');
        expect(message).not.toContain('violates');
        expect(message).not.toContain('workout_session_exercises');
        // Must be a user-friendly message
        expect(message).toBe("We couldn't start your workout. Please try again.");
      }
    });

    it('cleans up the session when exercise insert fails', async () => {
      let callCount = 0;
      const insert = vi.fn().mockImplementation(() => {
        callCount++;
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(
              callCount === 1
                ? {
                    data: {
                      id: 'session-001',
                      user_id: 'auth-user-123',
                      title: 'Test Workout',
                      origin: 'generated',
                      status: 'in_progress',
                      started_at: '2026-07-17T10:00:00.000Z',
                      completed_at: null,
                      planned_duration_minutes: 45,
                      created_at: '2026-07-17T10:00:00.000Z',
                    },
                    error: null,
                  }
                : {
                    data: null,
                    error: new Error('simulated exercise insert failure'),
                  },
            ),
          }),
        };
      });

      const deleteEq = vi.fn().mockResolvedValue({ error: null });
      const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });

      const from = vi.fn().mockReturnValue({
        insert,
        select: vi.fn(),
        delete: deleteFn,
        update: vi.fn(),
        upsert: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        in: vi.fn(),
        limit: vi.fn(),
      });

      const client = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'auth-user-123' } },
            error: null,
          }),
          getSession: vi.fn(),
          signOut: vi.fn(),
        },
        from,
      } as unknown as SupabaseClient;

      const repo = createWorkoutSessionRepository(client);

      await expect(repo.createSession(buildReview())).rejects.toThrow(WorkoutSessionError);

      // Verify cleanup: delete was called on workout_sessions with the session ID
      expect(deleteFn).toHaveBeenCalled();
      expect(deleteEq).toHaveBeenCalledWith('id', 'session-001');
    });

    it('returns the sessionId and mapped exercise rows on success', async () => {
      const { client } = buildMockClient({
        insertResponse: {
          data: {
            id: 'session-002',
            user_id: 'auth-user-123',
            title: 'Test Workout',
            origin: 'generated',
            status: 'in_progress',
            started_at: '2026-07-17T10:00:00.000Z',
            completed_at: null,
            planned_duration_minutes: 45,
            created_at: '2026-07-17T10:00:00.000Z',
          },
          error: null,
        },
      });
      const repo = createWorkoutSessionRepository(client);

      const result = await repo.createSession(buildReview());

      expect(result.sessionId).toBe('session-002');
      expect(Array.isArray(result.exercises)).toBe(true);
      expect(result.exercises.length).toBe(2); // matches our fixture
    });
  });

  describe('error redaction — all public methods', () => {
    it('loadActiveSession returns redacted error message', () => {
      const selectFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: null,
                error: new Error('permission denied for table workout_sessions'),
              }),
            }),
          }),
        }),
      });

      const client = {
        auth: {
          getUser: vi.fn(),
          getSession: vi.fn(),
          signOut: vi.fn(),
        },
        from: vi.fn().mockReturnValue({ select: selectFn }),
      } as unknown as SupabaseClient;

      const repo = createWorkoutSessionRepository(client);

      return expect(repo.loadActiveSession('user-1')).rejects.toMatchObject({
        code: 'SESSION_LOAD_FAILED',
        message: "We couldn't load your workout session. Please try again.",
      });
    });

    it('upsertSetLog returns redacted error message', () => {
      const upsertFn = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: new Error('duplicate key value violates unique constraint'),
          }),
        }),
      });

      const client = {
        auth: { getUser: vi.fn(), getSession: vi.fn(), signOut: vi.fn() },
        from: vi.fn().mockReturnValue({ upsert: upsertFn }),
      } as unknown as SupabaseClient;

      const repo = createWorkoutSessionRepository(client);

      return expect(
        repo.upsertSetLog('exercise-1', 1, { weight: 80, reps: 10, rir: 2 }),
      ).rejects.toMatchObject({
        code: 'SET_LOG_UPSERT_FAILED',
        message: "We couldn't save your set. Please try again.",
      });
    });

    it('finishSession returns redacted error message', () => {
      const updateFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('new row violates row-level security policy'),
            }),
          }),
        }),
      });

      const client = {
        auth: { getUser: vi.fn(), getSession: vi.fn(), signOut: vi.fn() },
        from: vi.fn().mockReturnValue({ update: updateFn }),
      } as unknown as SupabaseClient;

      const repo = createWorkoutSessionRepository(client);

      return expect(repo.finishSession('session-1', false)).rejects.toMatchObject({
        code: 'SESSION_FINISH_FAILED',
        message: "We couldn't finish your workout. Please try again.",
      });
    });
  });

  describe('error type contract', () => {
    it('WorkoutSessionError carries a controlled code', () => {
      const err = new WorkoutSessionError('TEST_CODE', 'A safe message');
      expect(err.name).toBe('WorkoutSessionError');
      expect(err.code).toBe('TEST_CODE');
      expect(err.message).toBe('A safe message');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
