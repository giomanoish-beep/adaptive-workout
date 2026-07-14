import type {
  DeepSeekRequestMessage,
  DeepSeekResponsePayload,
  DeepSeekTaskHandler,
} from '@adaptive-workout/ai-deepseek-provider';
import type { AIProviderRequest } from '@adaptive-workout/ai';
import {
  buildDiscomfortPromptMessages,
  discomfortContractVersion,
  discomfortPromptTemperature,
  parseDiscomfortOutput,
} from './discomfort-prompt.js';

/**
 * DeepSeek task handler for `discomfort_observation_extraction`. A thin adapter
 * over the shared prompt/parser: it formats the deterministic prompt into
 * DeepSeek's message convention and parses the raw response content through the
 * shared validator. Registered with
 * `registerDeepSeekTaskHandler('discomfort_observation_extraction', ...)`.
 */
export const deepseekDiscomfortHandler: DeepSeekTaskHandler<'discomfort_observation_extraction'> = {
  buildRequestPayload(request: AIProviderRequest<'discomfort_observation_extraction'>) {
    const messages = buildDiscomfortPromptMessages(request).map<DeepSeekRequestMessage>(
      (message) => ({ role: message.role, content: message.content }),
    );
    return {
      model: 'deepseek-chat',
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
    response: DeepSeekResponsePayload,
  ) {
    const result = parseDiscomfortOutput(request, response.content);
    if (result.status === 'failure') {
      return { status: 'failure' as const, message: result.message };
    }
    return { status: 'ok' as const, output: result.output };
  },
};
