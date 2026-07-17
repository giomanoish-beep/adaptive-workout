import type { ObservabilityEvent, ObservabilitySink } from './contracts.js';

/**
 * No-op sink. Accepts all events and discards them silently. Useful as a
 * default or when observability is intentionally disabled.
 */
export class NoopSink implements ObservabilitySink {
  emit(_: ObservabilityEvent): void {
    // intentionally empty
  }
}

/**
 * In-memory sink. Stores every emitted event in insertion order. Designed
 * for deterministic tests — call `clear()` between test cases.
 */
export class InMemorySink implements ObservabilitySink {
  private readonly _events: ObservabilityEvent[] = [];

  emit(event: ObservabilityEvent): void {
    this._events.push(event);
  }

  get events(): readonly ObservabilityEvent[] {
    return this._events;
  }

  clear(): void {
    this._events.length = 0;
  }
}

/**
 * Console sink for server development. Emits sanitized structured events to
 * `console.debug`, `console.info`, `console.warn`, or `console.error` based
 * on the event level. Never logs the raw unsanitized original metadata.
 */
export class ConsoleSink implements ObservabilitySink {
  emit(event: ObservabilityEvent): void {
    // Never emit the original raw event — build a sanitized display payload.
    const display = {
      eventName: event.eventName,
      level: event.level,
      domain: event.domain,
      timestamp: event.timestamp,
      ...(event.correlationId ? { correlationId: event.correlationId } : {}),
      metadata: event.metadata,
    };

    switch (event.level) {
      case 'debug':
        console.debug(display);
        break;
      case 'info':
        console.info(display);
        break;
      case 'warn':
        console.warn(display);
        break;
      case 'error':
        console.error(display);
        break;
    }
  }
}