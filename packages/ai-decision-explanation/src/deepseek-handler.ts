import type {
  DeepSeekRequestMessage,
  DeepSeekResponsePayload,
  DeepSeekTaskHandler,
} from '@adaptive-workout/ai-deepseek-provider';
import type { AIProviderRequest } from '@adaptive-workout/ai';
import {
  buildExplanationPromptMessages,
  explanationContractVersion,
  explanationPromptTemperature,
  parseExplanationOutput,
} from './explanation-prompt.js';

/**
 * DeepSeek task handler for `grounded_decision_explanation`. A thin adapter
 * over the shared prompt/parser: it formats the deterministic prompt into
 * DeepSeek's message convention and parses the raw response content through the
 * shared validator. Registered with
 * `registerDeepSeekTaskHandler('grounded_decision_explanation', ...)`.
 */
export const deepseekExplanationHandler: DeepSeekTaskHandler<'grounded_decision_explanation'> = {
  buildRequestPayload(request: AIProviderRequest<'grounded_decision_explanation'>) {
    const messages = buildExplanationPromptMessages(request).map<DeepSeekRequestMessage>(
      (message) => ({ role: message.role, content: message.content }),
    );
    return {
      model: 'deepseek-chat',
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
    response: DeepSeekResponsePayload,
  ) {
    const result = parseExplanationOutput(request, response.content);
    if (result.status === 'failure') {
      return { status: 'failure' as const, message: result.message };
    }
    return { status: 'ok' as const, output: result.output };
  },
};
