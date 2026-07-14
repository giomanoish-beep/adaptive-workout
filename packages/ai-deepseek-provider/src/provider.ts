import {
  validateAIProviderResult,
  type AIProvider,
  type AIProviderDefinition,
  type AIProviderFailure,
  type AIProviderRequest,
  type AIProviderResponseMetadata,
  type AIProviderResult,
  type AIUsageMetadata,
  type AITaskKind,
} from '@adaptive-workout/ai';
import {
  deepseekDefaultModelId,
  deepseekProviderId,
  deepseekRequestErrorReasons,
  type DeepSeekTaskHandler,
  type DeepSeekTransport,
  type DeepSeekTransportCall,
  type DeepSeekTransportFailure,
} from './contracts.js';

const supportedDeepSeekTasks: readonly AITaskKind[] = [
  'workout_intent_extraction',
  'discomfort_observation_extraction',
  'grounded_decision_explanation',
];

export const deepseekProviderDefinition: AIProviderDefinition = Object.freeze({
  providerId: deepseekProviderId,
  modelId: deepseekDefaultModelId,
  supportedTasks: supportedDeepSeekTasks,
});

export function defineDeepSeekProviderDefinition(modelId: string): AIProviderDefinition {
  return Object.freeze({
    providerId: deepseekProviderId,
    modelId,
    supportedTasks: supportedDeepSeekTasks,
  });
}

export interface DeepSeekAiProviderOptions {
  /**
   * Server-side transport only. The transport owns the API key and auth
   * headers; the provider never reads credentials.
   */
  readonly transport: DeepSeekTransport;
  readonly modelId?: string;
  readonly clock?: () => string;
}

/**
 * Configured fallback AI provider behind the `AIProvider` abstraction. It owns
 * provider identity, request lifecycle (timeout via AbortController),
 * failure-code mapping, and structured-output validation. It never calls a
 * provider SDK or reads an API key; the injected `DeepSeekTransport` does that
 * on the server only. The router invokes this provider only after the primary
 * (GLM) provider returns a fallback-eligible failure.
 */
export class DeepSeekAiProvider implements AIProvider {
  readonly definition: AIProviderDefinition;
  private readonly transport: DeepSeekTransport;
  private readonly clock: () => string;

  constructor(options: DeepSeekAiProviderOptions) {
    this.transport = options.transport;
    this.clock = options.clock ?? defaultIsoClock;
    this.definition = defineDeepSeekProviderDefinition(options.modelId ?? deepseekDefaultModelId);
  }

  async execute<Task extends AITaskKind>(
    request: AIProviderRequest<Task>,
  ): Promise<AIProviderResult<Task>> {
    if (!this.definition.supportedTasks.includes(request.task)) {
      return unsupportedTaskFailure<Task>(request.task);
    }

    const handler = resolveDeepSeekTaskHandler(request.task);
    if (handler === null) {
      // AI-003 ships the provider shell; per-task handlers arrive in AI-004/005/006.
      return unsupportedTaskFailure<Task>(request.task);
    }

    const payload = handler.buildRequestPayload(request);
    const startedAt = Date.now();
    const abortController = new AbortController();
    const timeout = createTimeout(request.metadata.timeoutMilliseconds, () =>
      abortController.abort(),
    );

    let transportOutcome;
    try {
      transportOutcome = await this.transport.call({
        payload,
        abortSignal: abortController.signal,
      } satisfies DeepSeekTransportCall);
    } catch (error) {
      timeout.clear();
      return transportExceptionFailure<Task>(request.task, error);
    }
    timeout.clear();

    if (transportOutcome.status === 'failure') {
      return transportFailureResult<Task>(
        request.task,
        transportOutcome.failure,
        startedAt,
        this.clock,
      );
    }

    const { responseMetadata, payload: responsePayload, usage } = transportOutcome.value;
    const parsed = handler.parseTaskOutput(request, responsePayload);
    if (parsed.status === 'failure') {
      return structuredOutputFailure<Task>(request.task, responseMetadata, usage, parsed.message);
    }

    const result: AIProviderResult<Task> = {
      status: 'success',
      task: request.task,
      output: parsed.output,
      responseMetadata,
      usage,
    };

    const validation = validateAIProviderResult<Task>(request, result);
    if (!validation.ok) {
      return structuredOutputFailure<Task>(
        request.task,
        responseMetadata,
        usage,
        'DeepSeek response failed provider-result validation.',
      );
    }
    return result;
  }
}

const deepseekTaskHandlers = new Map<AITaskKind, DeepSeekTaskHandler<AITaskKind>>();

/**
 * AI-003 ships the DeepSeek transport and provider shell. Per-task
 * prompt/schema handlers are registered by the structured-task tasks AI-004,
 * AI-005, and AI-006. Until a task is registered it resolves to a typed
 * `UNSUPPORTED_TASK` failure at execution time even though the provider
 * advertises support for it.
 */
export function registerDeepSeekTaskHandler<Task extends AITaskKind>(
  task: Task,
  handler: DeepSeekTaskHandler<Task>,
): void {
  deepseekTaskHandlers.set(task, handler);
}

/** Test helper to reset handler registrations between test cases. */
export function clearDeepSeekTaskHandlers(): void {
  deepseekTaskHandlers.clear();
}

function resolveDeepSeekTaskHandler(task: AITaskKind): DeepSeekTaskHandler<AITaskKind> | null {
  return deepseekTaskHandlers.get(task) ?? null;
}

function createTimeout(
  timeoutMilliseconds: number,
  onTimeout: () => void,
): { readonly clear: () => void } {
  const handle = setTimeout(onTimeout, timeoutMilliseconds);
  return {
    clear() {
      clearTimeout(handle);
    },
  };
}

function defaultIsoClock(): string {
  return new Date().toISOString();
}

function unsupportedTaskFailure<Task extends AITaskKind>(task: Task): AIProviderResult<Task> {
  return failureResult(task, {
    code: 'UNSUPPORTED_TASK',
    message: `DeepSeek provider does not support task "${task}".`,
    retryable: false,
    reasonCodes: [deepseekRequestErrorReasons.unsupportedTask],
  });
}

function transportExceptionFailure<Task extends AITaskKind>(
  task: Task,
  error: unknown,
): AIProviderResult<Task> {
  const message = error instanceof Error ? error.message : 'DeepSeek transport threw unexpectedly.';
  return failureResult(task, {
    code: 'PROVIDER_UNAVAILABLE',
    message,
    retryable: true,
    reasonCodes: [deepseekRequestErrorReasons.transportException],
  });
}

function structuredOutputFailure<Task extends AITaskKind>(
  task: Task,
  responseMetadata: AIProviderResponseMetadata,
  usage: AIUsageMetadata | null,
  message: string,
): AIProviderResult<Task> {
  return {
    status: 'failure',
    task,
    failure: {
      code: 'STRUCTURED_OUTPUT_VALIDATION_FAILED',
      message,
      retryable: false,
      reasonCodes: [deepseekRequestErrorReasons.structuredOutputInvalid],
    },
    responseMetadata,
    usage,
  };
}

function transportFailureResult<Task extends AITaskKind>(
  task: Task,
  failure: DeepSeekTransportFailure,
  startedAt: number,
  clock: () => string,
): AIProviderResult<Task> {
  const mapped = mapTransportFailure(failure);
  const responseMetadata: AIProviderResponseMetadata = {
    providerId: deepseekProviderId,
    modelId: deepseekDefaultModelId,
    providerRequestId: null,
    receivedAt: clock(),
    latencyMilliseconds: Date.now() - startedAt,
  };
  return {
    status: 'failure',
    task,
    failure: mapped.failure,
    responseMetadata,
    usage: null,
  };
}

function mapTransportFailure(failure: DeepSeekTransportFailure): {
  readonly failure: AIProviderFailure;
} {
  switch (failure.kind) {
    case 'timeout':
      return {
        failure: {
          code: 'PROVIDER_TIMEOUT',
          message: 'DeepSeek request exceeded the configured timeout.',
          retryable: true,
          reasonCodes: [deepseekRequestErrorReasons.timeout],
        },
      };
    case 'authentication_failed':
      return {
        failure: {
          code: 'PROVIDER_AUTHENTICATION_FAILED',
          message: 'DeepSeek rejected the configured API key.',
          retryable: false,
          reasonCodes: [deepseekRequestErrorReasons.authenticationFailed],
        },
      };
    case 'rate_limited':
      return {
        failure: {
          code: 'PROVIDER_RATE_LIMITED',
          message: 'DeepSeek rate-limited the request.',
          retryable: true,
          reasonCodes: [deepseekRequestErrorReasons.rateLimited],
        },
      };
    case 'unavailable':
      return {
        failure: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'DeepSeek endpoint was unavailable.',
          retryable: true,
          reasonCodes: [deepseekRequestErrorReasons.unavailable],
        },
      };
    case 'malformed_response':
      return {
        failure: {
          code: 'MALFORMED_PROVIDER_RESPONSE',
          message: failure.message,
          retryable: false,
          reasonCodes: [deepseekRequestErrorReasons.malformedResponse],
        },
      };
  }
}

function failureResult<Task extends AITaskKind>(
  task: Task,
  failure: AIProviderFailure,
): AIProviderResult<Task> {
  return {
    status: 'failure',
    task,
    failure,
    responseMetadata: null,
    usage: null,
  };
}
