import type {
  GlmRequestMessage,
  GlmResponsePayload,
  GlmTaskHandler,
} from '@adaptive-workout/ai-glm-provider';
import type { AIProviderRequest } from '@adaptive-workout/ai';
import {
  buildExplanationPromptMessages,
  explanationContractVersion,
  explanationPromptTemperature,
  parseExplanationOutput,
} from './explanation-prompt.js';

/**
 * GLM task handler for `grounded_decision_explanation`. A thin adapter over the
 * shared prompt/parser: it formats the deterministic prompt into GLM's message
 * convention and parses the raw response content through the shared validator.
 * Registered with
 * `registerGlmTaskHandler('grounded_decision_explanation', ...)`.
 */
export const glmExplanationHandler: GlmTaskHandler<'grounded_decision_explanation'> = {
  buildRequestPayload(request: AIProviderRequest<'grounded_decision_explanation'>) {
    const messages = buildExplanationPromptMessages(request).map<GlmRequestMessage>((message) => ({
      role: message.role,
      content: message.content,
    }));
    return {
      model: 'glm-4-plus',
      messages,
      responseFormat: { type: 'json_object' },
      temperature: explanationPromptTemperature,
      requestId: request.metadata.requestId,
      task: 'grounded_decision_explanation',
      contractVersion: explanationContractVersion,
    };
  },

  parseTaskOutput(
    request: AIProviderRequest<'grounded_decision_explanation'>,
    response: GlmResponsePayload,
  ) {
    const result = parseExplanationOutput(request, response.content);
    if (result.status === 'failure') {
      return { status: 'failure' as const, message: result.message };
    }
    return { status: 'ok' as const, output: result.output };
  },
};
