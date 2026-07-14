import type {
  GlmRequestMessage,
  GlmResponsePayload,
  GlmTaskHandler,
} from '@adaptive-workout/ai-glm-provider';
import type { AIProviderRequest } from '@adaptive-workout/ai';
import {
  buildWorkoutIntentPromptMessages,
  parseWorkoutIntentOutput,
  workoutIntentContractVersion,
  workoutIntentPromptTemperature,
} from './workout-intent-prompt.js';

/**
 * GLM task handler for `workout_intent_extraction`. A thin adapter over the
 * shared prompt/parser: it formats the deterministic prompt into GLM's message
 * convention and parses the raw response content through the shared validator.
 * Registered with `registerGlmTaskHandler('workout_intent_extraction', ...)`.
 */
export const glmWorkoutIntentHandler: GlmTaskHandler<'workout_intent_extraction'> = {
  buildRequestPayload(request: AIProviderRequest<'workout_intent_extraction'>) {
    const messages = buildWorkoutIntentPromptMessages(request).map<GlmRequestMessage>(
      (message) => ({
        role: message.role,
        content: message.content,
      }),
    );
    return {
      model: 'glm-4-plus',
      messages,
      responseFormat: { type: 'json_object' },
      temperature: workoutIntentPromptTemperature,
      requestId: request.metadata.requestId,
      task: 'workout_intent_extraction',
      contractVersion: workoutIntentContractVersion,
    };
  },

  parseTaskOutput(
    request: AIProviderRequest<'workout_intent_extraction'>,
    response: GlmResponsePayload,
  ) {
    const result = parseWorkoutIntentOutput(request, response.content);
    if (result.status === 'failure') {
      return { status: 'failure' as const, message: result.message };
    }
    return { status: 'ok' as const, output: result.output };
  },
};
