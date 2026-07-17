/**
 * Controlled observability event emission for workout generation.
 *
 * Emits structured events with sanitized metadata through the injected sink.
 * Forbidden data (auth headers, raw profiles, SQL errors, full candidate lists)
 * is never included in metadata.
 */

import { createEmitter, safeSink, type ObservabilitySink } from '@adaptive-workout/observability';

export interface GenerationObservability {
  /** Emit a controlled generation event with sanitized metadata. */
  emitGenerationRequestReceived(metadata: {
    readonly correlationId: string;
    readonly targetCount: number;
    readonly requestedDuration: number;
    readonly equipmentContext: string;
  }): void;
  emitValidationFailed(metadata: {
    readonly correlationId: string;
    readonly errorCode: string;
  }): void;
  emitProfileLoadFailed(metadata: {
    readonly correlationId: string;
    readonly reason: string;
  }): void;
  emitCatalogLoadFailed(metadata: {
    readonly correlationId: string;
    readonly reason: string;
  }): void;
  emitEngineGenerationSucceeded(metadata: {
    readonly correlationId: string;
    readonly appliedGoal: string;
    readonly candidateCount: number;
    readonly resultExerciseCount: number;
    readonly engineVersion: string;
    readonly ruleSetVersion: string;
    readonly prescriptionVersion: string;
    readonly latencyMs: number;
  }): void;
  emitEngineGenerationFailed(metadata: {
    readonly correlationId: string;
    readonly errorCode: string;
    readonly latencyMs: number;
  }): void;
}

export function createGenerationObservability(sink: ObservabilitySink): GenerationObservability {
  const emitEvent = createEmitter({ sink: safeSink(sink) });

  return {
    emitGenerationRequestReceived(metadata) {
      emitEvent({
        eventName: 'generation_request_received',
        level: 'info',
        domain: 'workout_decision',
        timestamp: new Date().toISOString(),
        correlationId: metadata.correlationId,
        metadata,
      });
    },

    emitValidationFailed(metadata) {
      emitEvent({
        eventName: 'generation_validation_failed',
        level: 'warn',
        domain: 'workout_decision',
        timestamp: new Date().toISOString(),
        correlationId: metadata.correlationId,
        metadata,
      });
    },

    emitProfileLoadFailed(metadata) {
      emitEvent({
        eventName: 'generation_profile_load_failed',
        level: 'warn',
        domain: 'workout_decision',
        timestamp: new Date().toISOString(),
        correlationId: metadata.correlationId,
        metadata,
      });
    },

    emitCatalogLoadFailed(metadata) {
      emitEvent({
        eventName: 'generation_catalog_load_failed',
        level: 'error',
        domain: 'workout_decision',
        timestamp: new Date().toISOString(),
        correlationId: metadata.correlationId,
        metadata,
      });
    },

    emitEngineGenerationSucceeded(metadata) {
      emitEvent({
        eventName: 'generation_engine_succeeded',
        level: 'info',
        domain: 'workout_decision',
        timestamp: new Date().toISOString(),
        correlationId: metadata.correlationId,
        metadata,
      });
    },

    emitEngineGenerationFailed(metadata) {
      emitEvent({
        eventName: 'generation_engine_failed',
        level: 'error',
        domain: 'workout_decision',
        timestamp: new Date().toISOString(),
        correlationId: metadata.correlationId,
        metadata,
      });
    },
  };
}
