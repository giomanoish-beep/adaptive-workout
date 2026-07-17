import { describe, expect, it } from 'vitest';
import type { ObservabilityEvent } from './contracts.js';
import { createEmitter } from './emitter.js';
import { ConsoleSink, InMemorySink, NoopSink } from './sinks.js';

function createEvent(overrides: Partial<ObservabilityEvent> = {}): ObservabilityEvent {
  return {
    eventName: 'test.event',
    level: 'info',
    domain: 'system',
    timestamp: '2026-01-01T00:00:00.000Z',
    metadata: { key: 'value' },
    ...overrides,
  };
}

describe('NoopSink', () => {
  it('accepts events without throwing', () => {
    const sink = new NoopSink();
    expect(() => sink.emit(createEvent())).not.toThrow();
  });
});

describe('InMemorySink', () => {
  it('stores sanitized events', () => {
    const sink = new InMemorySink();
    const event = createEvent({ correlationId: 'corr-1' });
    sink.emit(event);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toEqual(event);
  });

  it('stores multiple events in insertion order', () => {
    const sink = new InMemorySink();
    sink.emit(createEvent({ eventName: 'first' }));
    sink.emit(createEvent({ eventName: 'second' }));
    expect(sink.events).toHaveLength(2);
    expect(sink.events[0]?.eventName).toBe('first');
    expect(sink.events[1]?.eventName).toBe('second');
  });

  it('can be cleared', () => {
    const sink = new InMemorySink();
    sink.emit(createEvent());
    sink.clear();
    expect(sink.events).toHaveLength(0);
  });
});

describe('ConsoleSink', () => {
  it('does not throw for any level', () => {
    const sink = new ConsoleSink();
    const levels = ['debug', 'info', 'warn', 'error'] as const;
    for (const level of levels) {
      expect(() => sink.emit(createEvent({ level }))).not.toThrow();
    }
  });
});

describe('safe emitter', () => {
  it('creates a working emitter', () => {
    const sink = new InMemorySink();
    const emitter = createEmitter({ sink });
    emitter(createEvent({ eventName: 'test.hello' }));
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.eventName).toBe('test.hello');
  });

  it('preserves correlation ID', () => {
    const sink = new InMemorySink();
    const emitter = createEmitter({ sink });
    emitter(createEvent({ correlationId: 'op-42' }));
    expect(sink.events[0]?.correlationId).toBe('op-42');
  });

  it('structured fields are preserved', () => {
    const sink = new InMemorySink();
    const emitter = createEmitter({ sink });
    const event = createEvent({
      eventName: 'test.structured',
      level: 'warn',
      domain: 'ai',
      timestamp: '2026-06-01T12:00:00.000Z',
      metadata: { attempt: 1, provider: 'glm' },
    });
    emitter(event);
    expect(sink.events[0]).toEqual(event);
  });

  it('sink failure does not escape', () => {
    const throwingSink = {
      emit: (): never => {
        throw new Error('sink exploded');
      },
    };
    const emitter = createEmitter({ sink: throwingSink });
    expect(() => emitter(createEvent())).not.toThrow();
  });

  it('sink failure does not change the returned value of emitter', () => {
    const sink = new InMemorySink();
    let throwOnce = true;
    const flakySink = {
      emit(event: ObservabilityEvent): void {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('first emit fails');
        }
        sink.emit(event);
      },
    };
    const emitter = createEmitter({ sink: flakySink });
    // First emit throws internally but is caught by safeSink
    emitter(createEvent({ eventName: 'first' }));
    expect(sink.events).toHaveLength(0);

    // Second emit works normally
    emitter(createEvent({ eventName: 'second' }));
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.eventName).toBe('second');
  });
});