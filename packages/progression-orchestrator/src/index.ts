export { refreshProgression, createNoopSink } from './orchestrator.js';
export type { RefreshProgressionContext } from './orchestrator.js';
export type {
  ProgressionRefreshDto,
  RefreshProgressionSuccessResponse,
  RefreshProgressionErrorResponse,
  RefreshProgressionResponse,
  ObservabilitySink,
  ObservabilityEvent,
  ObservabilityEventKind,
  PerformanceStateUpsert,
  SupabaseServiceClient,
  MappedExposure,
  MappedSet,
  SessionRow,
  SessionExerciseRow,
  SetLogRow,
  ExerciseCatalogRow,
} from './contracts.js';
export {
  engineName,
  engineVersion,
  ruleSetVersion,
} from './contracts.js';

export const packageName = '@adaptive-workout/progression-orchestrator';
export const progressionOrchestratorBoundary = 'server-only' as const;