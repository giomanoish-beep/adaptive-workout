import type {
  GlmRequestMessage,
  GlmResponsePayload,
  GlmTaskHandler,
} from '@adaptive-workout/ai-glm-provider';
import type { AIProviderRequest } from '@adaptive-workout/ai';
import {
  buildDiscomfortPromptMessages,
  discomfortContractVersion,
  discomfortPromptTemperature,
  parseDiscomfortOutput,
} from './discomfort-prompt.js';

/**
 * GLM task handler for `discomfort_observation_extraction`. A thin adapter over
 * the shared prompt/parser: it formats the deterministic prompt into GLM's
 * message convention and parses the raw response content through the shared
 * validator. Registered with
 * `registerGlmTaskHandler('discomfort_observation_extraction', ...)`.
 */
export const glmDiscomfortHandler: GlmTaskHandler<'discomfort_observation_extraction'> = {
  buildRequestPayload(request: AIProviderRequest<'discomfort_observation_extraction'>) {
    const messages = buildDiscomfortPromptMessages(request).map<GlmRequestMessage>((message) => ({
      role: message.role,
      content: message.content,
    }));
    return {
      model: 'glm-4-plus',
      messages,
      responseFormat: { type: 'json_object' },
      temperature: discomfortPromptTemperature,
      requestId: request.metadata.requestId,
      task: 'discomfort_observation_extraction',
      contractVersion: discomfortContractVersion,
    };
  },

  parseTaskOutput(
    request: AIProviderRequest<'discomfort_observation_extraction'>,
    response: GlmResponsePayload,
  ) {
    const result = parseDiscomfortOutput(request, response.content);
    if (result.status === 'failure') {
      return { status: 'failure' as const, message: result.message };
    }
    return { status: 'ok' as const, output: result.output };
  },
};
