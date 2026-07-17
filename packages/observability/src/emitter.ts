import type { ObservabilityConfig, ObservabilityEvent, ObservabilitySink } from './contracts.js';

/**
 * Wraps a sink so that any exception thrown by the sink is silently swallowed.
 * The authoritative operation continues unchanged. No recursive observability
 * events are emitted about the sink failure.
 */
export function safeSink(sink: ObservabilitySink): ObservabilitySink {
  return {
    emit(event: ObservabilityEvent): void {
      try {
        sink.emit(event);
      } catch {
        // Silently swallow sink failures to preserve the authoritative path.
      }
    },
  };
}

/**
 * Creates a safe emitter function that wraps the configured sink. If the sink
 * throws, that failure is isolated and the emitted event is discarded.
 *
 * Callers inject a config with their chosen sink. The returned emitter is
 * a simple function suitable for passing into observability-using code.
 */
export function createEmitter(config: ObservabilityConfig): (event: ObservabilityEvent) => void {
  const sink = safeSink(config.sink);
  return (event: ObservabilityEvent) => {
    sink.emit(event);
  };
}