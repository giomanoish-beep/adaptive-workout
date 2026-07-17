/**
 * CLOUD-003: React hook that bridges the progress repository and the
 * Progress screen. Handles loading, empty, error, retry, and refresh states.
 *
 * - History and Progression load independently.
 * - Switching tabs preserves loaded data (no refetch).
 * - No browser storage.
 * - No fixture fallback in production paths.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createProgressRepository } from './progress-repository';
import { refreshProgressionGateway } from './progression-refresh-gateway';
import type {
  ProgressHistoryResult,
  ProgressProgressionResult,
  ProgressHistoryData,
  ProgressProgressionData,
  ProgressLoadError,
} from './progress-types';

export interface UseProgressDataResult {
  readonly history: ProgressHistoryResult;
  readonly progression: ProgressProgressionResult;
  readonly loadHistory: () => Promise<void>;
  readonly loadProgression: () => Promise<void>;
  readonly refreshProgression: () => Promise<void>;
  /** True while either history or progression is in initial load */
  readonly isHistoryLoading: boolean;
  readonly isProgressionLoading: boolean;
  readonly isProgressionRefreshing: boolean;
  readonly progressionRefreshError: string | null;
}

function errorResult(message: string): ProgressLoadError {
  return { status: 'error', message };
}

/**
 * Hook that provides progress data. Created once per client and recreated
 * when auth identity changes (via the dependency on client).
 */
export function useProgressData(client: SupabaseClient): UseProgressDataResult {
  const repo = useMemo(() => createProgressRepository(client), [client]);

  const [history, setHistory] = useState<ProgressHistoryResult>(() => ({
    status: 'loaded',
    summary: { totalWorkouts: 0, totalWorkingSets: 0, streakWeeks: 0 },
    recentWorkouts: [],
  } satisfies ProgressHistoryData));
  const [progression, setProgression] = useState<ProgressProgressionResult>(
    () =>
      ({
        status: 'loaded',
        exerciseProgressions: [],
      }) satisfies ProgressProgressionData,
  );

  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isProgressionLoading, setIsProgressionLoading] = useState(false);
  const [isProgressionRefreshing, setIsProgressionRefreshing] = useState(false);
  const [progressionRefreshError, setProgressionRefreshError] = useState<string | null>(null);

  // Track whether initial loads have happened
  const historyLoaded = useRef(false);
  const progressionLoaded = useRef(false);

  // Prevent duplicate concurrent operations
  const historyLoadingRef = useRef(false);
  const progressionLoadingRef = useRef(false);

  const loadHistory = useCallback(async () => {
    if (historyLoadingRef.current) return;
    historyLoadingRef.current = true;
    setIsHistoryLoading(true);

    try {
      const { recentWorkouts, allFinishedTimestamps } = await repo.loadHistory();

      if (recentWorkouts.length === 0) {
        setHistory({
          status: 'empty',
          summary: { totalWorkouts: 0, totalWorkingSets: 0, streakWeeks: 0 },
          recentWorkouts: [],
        } satisfies ProgressHistoryData);
      } else {
        const summary = repo.deriveSummary(allFinishedTimestamps, recentWorkouts);
        setHistory({
          status: 'loaded',
          summary,
          recentWorkouts,
        } satisfies ProgressHistoryData);
      }
      historyLoaded.current = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load workout history.';
      setHistory(errorResult(message));
    } finally {
      setIsHistoryLoading(false);
      historyLoadingRef.current = false;
    }
  }, [repo]);

  const loadProgressionInternal = useCallback(
    async (refreshing: boolean) => {
      if (progressionLoadingRef.current) return;
      progressionLoadingRef.current = true;
      if (refreshing) {
        setIsProgressionRefreshing(true);
      } else {
        setIsProgressionLoading(true);
      }

      try {
        const { exerciseProgressions } = await repo.loadProgression();

        if (exerciseProgressions.length === 0) {
          setProgression({
            status: 'empty',
            exerciseProgressions: [],
          } satisfies ProgressProgressionData);
        } else {
          setProgression({
            status: 'loaded',
            exerciseProgressions,
          } satisfies ProgressProgressionData);
        }
        progressionLoaded.current = true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load progression data.';
        setProgression(errorResult(message));
      } finally {
        setIsProgressionLoading(false);
        setIsProgressionRefreshing(false);
        progressionLoadingRef.current = false;
      }
    },
    [repo],
  );

  const loadProgression = useCallback(async () => {
    await loadProgressionInternal(false);
  }, [loadProgressionInternal]);

  const refreshProgression = useCallback(async () => {
    if (progressionLoadingRef.current) return;
    progressionLoadingRef.current = true;
    setIsProgressionRefreshing(true);
    setProgressionRefreshError(null);

    try {
      // 1. Call the server-side refresh
      const refreshResult = await refreshProgressionGateway(client);
      if (!refreshResult.ok) {
        setProgressionRefreshError(
          refreshResult.message ?? 'Progression refresh failed.',
        );
        return;
      }
      // 2. Reload from DB (server has now written fresh state)
      progressionLoadingRef.current = false;
      await loadProgressionInternal(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Progression refresh failed.';
      setProgressionRefreshError(message);
    } finally {
      setIsProgressionRefreshing(false);
      progressionLoadingRef.current = false;
    }
  }, [client, loadProgressionInternal]);

  // Auto-load on mount
  useEffect(() => {
    if (!historyLoaded.current) {
      void loadHistory();
    }
  }, [loadHistory]);

  useEffect(() => {
    if (!progressionLoaded.current) {
      void loadProgression();
    }
  }, [loadProgression]);

  return {
    history,
    progression,
    loadHistory,
    loadProgression,
    refreshProgression,
    isHistoryLoading,
    isProgressionLoading,
    isProgressionRefreshing,
    progressionRefreshError,
  };
}
