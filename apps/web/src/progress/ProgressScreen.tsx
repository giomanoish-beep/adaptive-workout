import { useCallback, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useProgressData } from './use-progress-data';
import type {
  ProgressViewMode,
  ProgressionRecommendationLabel,
} from './progress-types';
import { defaultProgressViewMode } from './progress-types';
import {
  workoutCompletionPercent,
  workoutStatusLabel,
  formatTargetRir,
} from './progress-view-model';

/**
 * Mobile-first Progress / History screen (CLOUD-003).
 *
 * Uses real authenticated-user data loaded from Supabase via the progress
 * repository. No fixture data is used in production paths.
 *
 * State distinctions:
 * - Initial loading (history or progression)
 * - Loaded History with summary + recent workout cards
 * - Loaded Progression with exercise progression cards
 * - Refreshing Progression
 * - Empty (no finished workouts / no exercise data)
 * - Recoverable error with Retry
 */

const viewModes: readonly { value: ProgressViewMode; label: string }[] = [
  { value: 'history', label: 'History' },
  { value: 'progression', label: 'Progression' },
];

export interface ProgressScreenProps {
  readonly client: SupabaseClient;
}

export function ProgressScreen({ client }: ProgressScreenProps) {
  const [mode, setMode] = useState<ProgressViewMode>(defaultProgressViewMode);
  const progress = useProgressData(client);

  const handleModeChange = useCallback((next: ProgressViewMode) => {
    setMode(next);
  }, []);

  return (
    <section className="progress-screen">
      <header className="progress-screen__header">
        <p className="eyebrow">PROGRESS</p>
        <h2 className="progress-screen__title">Your training</h2>
        <p className="progress-screen__subtitle">
          Track sessions and review progression recommendations.
        </p>
      </header>

      {/* Segmented view-mode control */}
      <div
        className="progress-segments"
        role="group"
        aria-label="Progress view mode"
      >
        {viewModes.map((vm) => (
          <button
            key={vm.value}
            type="button"
            className={`progress-segment${mode === vm.value ? ' progress-segment--active' : ''}`}
            aria-pressed={mode === vm.value}
            onClick={() => handleModeChange(vm.value)}
          >
            {vm.label}
          </button>
        ))}
      </div>

      {mode === 'history' ? (
        <HistoryView
          progress={progress}
          onRetry={() => void progress.loadHistory()}
        />
      ) : (
        <ProgressionView
          progress={progress}
          onRetry={() => void progress.loadProgression()}
          onRefresh={() => void progress.refreshProgression()}
        />
      )}
    </section>
  );
}

// ─── History View ────────────────────────────────────────────────────

interface HistoryViewProps {
  readonly progress: ReturnType<typeof useProgressData>;
  readonly onRetry: () => void;
}

function HistoryView({ progress, onRetry }: HistoryViewProps) {
  if (progress.isHistoryLoading) {
    return (
      <div className="progress-loading" role="status">
        <p>Loading workout history…</p>
      </div>
    );
  }

  if (progress.history.status === 'error') {
    return (
      <div className="progress-error" role="alert">
        <p>{progress.history.message}</p>
        <button
          type="button"
          className="progress-retry-button"
          onClick={onRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  const { history } = progress;

  if (history.status === 'empty') {
    return (
      <div className="progress-empty">
        <p className="progress-empty__title">No completed workouts yet</p>
        <p className="progress-empty__copy">
          Finish a workout and it will appear here.
        </p>
        {/* Summary shows zeros */}
        <div className="progress-summary">
          <div className="progress-summary__item">
            <span className="progress-summary__value">0</span>
            <span className="progress-summary__label">Workouts</span>
          </div>
          <div className="progress-summary__item">
            <span className="progress-summary__value">0</span>
            <span className="progress-summary__label">Working sets</span>
          </div>
          <div className="progress-summary__item">
            <span className="progress-summary__value">0 weeks</span>
            <span className="progress-summary__label">Training streak</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Summary metrics */}
      <div className="progress-summary">
        <div className="progress-summary__item">
          <span className="progress-summary__value">
            {history.summary.totalWorkouts}
          </span>
          <span className="progress-summary__label">Workouts</span>
        </div>
        <div className="progress-summary__item">
          <span className="progress-summary__value">
            {history.summary.totalWorkingSets}
          </span>
          <span className="progress-summary__label">Working sets</span>
        </div>
        <div className="progress-summary__item">
          <span className="progress-summary__value">
            {history.summary.streakWeeks} weeks
          </span>
          <span className="progress-summary__label">Training streak</span>
        </div>
      </div>

      {/* Recent workouts */}
      <h3 className="progress-section-title">Recent Workouts</h3>
      <ol className="progress-history-list">
        {history.recentWorkouts.map((w) => {
          const pct = workoutCompletionPercent(w);
          return (
            <li key={w.sessionId} className="progress-history-card">
              <div className="progress-history-card__top">
                <span className="progress-history-card__date">
                  {w.dateLabel}
                </span>
                <span
                  className={`progress-history-card__status progress-history-card__status--${w.status}`}
                >
                  {workoutStatusLabel(w.status)}
                </span>
              </div>
              <p className="progress-history-card__title">{w.title}</p>
              <div className="progress-history-card__metrics">
                <span className="progress-history-card__metric">
                  {w.durationMinutes} min
                </span>
                <span className="progress-history-card__metric">
                  {w.completedSets}/{w.totalSets} sets
                </span>
                <span className="progress-history-card__metric">{pct}%</span>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ─── Progression View ────────────────────────────────────────────────

interface ProgressionViewProps {
  readonly progress: ReturnType<typeof useProgressData>;
  readonly onRetry: () => void;
  readonly onRefresh: () => void;
}

function ProgressionView({
  progress,
  onRetry,
  onRefresh,
}: ProgressionViewProps) {
  if (progress.isProgressionLoading) {
    return (
      <div className="progress-loading" role="status">
        <p>Loading exercise progression…</p>
      </div>
    );
  }

  if (progress.progression.status === 'error') {
    return (
      <div className="progress-error" role="alert">
        <p>{progress.progression.message}</p>
        <button
          type="button"
          className="progress-retry-button"
          onClick={onRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  const { progression, isProgressionRefreshing } = progress;

  if (progression.status === 'empty') {
    return (
      <div className="progress-empty">
        <p className="progress-empty__title">
          No exercise progression data yet
        </p>
        <p className="progress-empty__copy">
          Complete workouts with logged sets to see your progression
          recommendations.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="progress-progression-header">
        <h3 className="progress-section-title">Exercise Progression</h3>
        <button
          type="button"
          className="progress-refresh-button"
          disabled={isProgressionRefreshing}
          onClick={onRefresh}
          aria-label="Refresh progression recommendations"
        >
          {isProgressionRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {isProgressionRefreshing && (
        <div className="progress-refreshing-note" role="status">
          Updating recommendations…
        </div>
      )}

      {progress.progressionRefreshError && (
        <div className="progress-error" role="alert">
          <p>{progress.progressionRefreshError}</p>
          <button
            type="button"
            className="progress-retry-button"
            onClick={onRefresh}
          >
            Retry refresh
          </button>
        </div>
      )}

      <ol className="progress-progression-list">
        {progression.exerciseProgressions.map((ex) => (
          <li key={ex.exerciseId} className="progress-progression-card">
            <p className="progress-progression-card__name">
              {ex.exerciseName}
            </p>

            {/* Primary recommendation — strongest visual hierarchy */}
            <div className="progress-progression-card__recommendation">
              <span className="progress-progression-card__rec-label">
                Recommendation
              </span>
              <span
                className={`progress-progression-card__rec-value progress-progression-card__rec--${recommendationCssClass(ex.recommendation)}`}
              >
                {ex.recommendation}
              </span>
              {ex.nextSuggestedWeightKg !== null && (
                <span className="progress-progression-card__rec-next">
                  {ex.nextSuggestedWeightKg}{' '}
                  {ex.weightUnit ?? 'kg'}
                </span>
              )}
            </div>

            {/* Secondary metrics */}
            <div className="progress-progression-card__metrics">
              <div className="progress-progression-card__metric">
                <span className="progress-progression-card__metric-label">
                  Working weight
                </span>
                <span className="progress-progression-card__metric-value">
                  {ex.currentWorkingWeightKg !== null
                    ? `${ex.currentWorkingWeightKg} ${ex.weightUnit ?? 'kg'}`
                    : '\u2014'}
                </span>
              </div>
              <div className="progress-progression-card__metric">
                <span className="progress-progression-card__metric-label">
                  Recent reps
                </span>
                <span className="progress-progression-card__metric-value">
                  {ex.recentPerformanceReps !== null
                    ? ex.recentPerformanceReps
                    : '\u2014'}
                </span>
              </div>
              <div className="progress-progression-card__metric">
                <span className="progress-progression-card__metric-label">
                  Target RIR
                </span>
                <span className="progress-progression-card__metric-value">
                  {ex.targetRir === null
                    ? '\u2014'
                    : formatTargetRir(ex.targetRir)}
                </span>
              </div>
              <div className="progress-progression-card__metric">
                <span className="progress-progression-card__metric-label">
                  Trend
                </span>
                <span
                  className={`progress-progression-card__metric-value ${ex.trend ? `progress-progression-card__trend--${ex.trend.toLowerCase()}` : ''}`}
                >
                  {ex.trend ?? '\u2014'}
                </span>
              </div>
            </div>

            {/* Reason codes for accessibility (screen-reader only) */}
            {ex.reasonCodes.length > 0 && (
              <div className="progress-progression-card__reasons sr-only">
                {ex.reasonCodes.join(', ')}
              </div>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

/** Maps a recommendation label to the existing CSS class suffix. */
function recommendationCssClass(label: ProgressionRecommendationLabel): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}
