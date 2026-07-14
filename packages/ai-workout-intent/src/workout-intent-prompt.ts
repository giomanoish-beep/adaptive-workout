import type {
  AIProviderRequest,
  WorkoutIntentExtractionInput,
  WorkoutIntentExtractionOutput,
} from '@adaptive-workout/ai';
import { validateWorkoutIntentExtractionOutput } from '@adaptive-workout/ai';
import type { ContractVersion } from '@adaptive-workout/domain';

/**
 * Shared, provider-agnostic prompt construction and structured-output parsing
 * for the `workout_intent_extraction` task (docs/AI.md). AI extracts structured
 * user intent only; it never produces the authoritative workout, and unknown or
 * unstated values remain unknown. Provider handlers are thin adapters over this
 * module so prompt semantics stay identical across GLM and DeepSeek.
 */

export const workoutIntentContractVersion = 'ai-contract-1' as ContractVersion;
export const workoutIntentPromptTemperature = 0;

const maximumRequestTextLength = 4_000;

export interface WorkoutIntentPromptMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

/**
 * Builds the deterministic prompt messages handed to every provider. The
 * controlled vocabulary is injected as the only legal set of IDs so the model
 * can echo them back; it must never invent IDs. Unknown or unstated values are
 * explicitly requested to remain null/empty rather than guessed.
 */
export function buildWorkoutIntentPromptMessages(
  request: AIProviderRequest<'workout_intent_extraction'>,
): readonly WorkoutIntentPromptMessage[] {
  const input = request.input;
  const vocabulary = input.controlledVocabulary;
  const system = [
    'You extract structured workout intent from natural-language requests.',
    'You do not generate workouts, choose exercises, or prescribe sets.',
    'Return ONLY a single JSON object that matches the requested schema.',
    'Use ONLY the identifiers listed in the provided vocabulary.',
    'Never invent or hallucinate muscle, equipment, exercise, or family ids.',
    'If a value is not explicitly stated, leave it empty or null — never guess.',
    'Omitting equipment means equipment intent is "unspecified", not "none".',
    'Report unresolved required information through missingInformation codes.',
  ].join(' ');

  const user = [
    `Request text: ${truncate(input.requestText)}`,
    `Vocabulary: ${serializeVocabulary(vocabulary)}`,
    input.currentWorkout ? `Current workout context: ${serializeCurrentWorkout(input)}` : '',
    'Extracted JSON schema:',
    JSON.stringify(schemaDescription, null, 2),
  ]
    .filter((line) => line.length > 0)
    .join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

const schemaDescription = {
  task: 'workout_intent_extraction',
  targetMuscleIds: 'array of vocabulary muscle ids the user wants to train',
  excludedMuscleIds: 'array of vocabulary muscle ids the user wants to avoid',
  availableDurationMinutes: 'integer minutes, or null if unstated',
  equipmentIntent: {
    kind: '"unspecified" when no equipment context is given, otherwise "specified"',
    availableEquipmentIds: 'array of vocabulary equipment ids (only when kind is "specified")',
    unavailableEquipmentIds: 'array of vocabulary equipment ids (only when kind is "specified")',
  },
  excludedExerciseIds: 'array of vocabulary exercise ids the user wants to avoid',
  excludedExerciseFamilyIds: 'array of vocabulary exercise family ids the user wants to avoid',
  preferredMuscleIds: 'array of vocabulary muscle ids the user emphasizes',
  constraints:
    'array of {kind:"preferred_exercises"|"reduced_exercise_priority"|"maximum_workout_duration", ...}',
  missingInformation:
    'array of "target_muscles_unclear"|"duration_unclear"|"equipment_context_unclear"|"constraint_unclear"',
} as const;

function truncate(text: string): string {
  if (text.length <= maximumRequestTextLength) return text;
  return `${text.slice(0, maximumRequestTextLength)}…`;
}

function serializeVocabulary(
  vocabulary: WorkoutIntentExtractionInput['controlledVocabulary'],
): string {
  return JSON.stringify({
    muscleIds: vocabulary.muscleIds,
    equipmentIds: vocabulary.equipmentIds,
    exerciseIds: vocabulary.exerciseIds,
    exerciseFamilyIds: vocabulary.exerciseFamilyIds,
  });
}

function serializeCurrentWorkout(input: WorkoutIntentExtractionInput): string {
  const current = input.currentWorkout;
  if (current === null) return 'none';
  return JSON.stringify({
    origin: current.origin,
    targetMuscleIds: current.targetMuscleIds,
    exerciseIds: current.exerciseIds,
  });
}

export type WorkoutIntentParseResult =
  | { readonly status: 'ok'; readonly output: WorkoutIntentExtractionOutput }
  | { readonly status: 'failure'; readonly message: string };

/**
 * Parses raw provider JSON content into the typed, validated
 * `WorkoutIntentExtractionOutput`. Provider JSON is never trusted merely
 * because it parsed: it is run through the existing contract validator, which
 * rejects invented ids, malformed constraints, and unsupported fields. Any
 * failure becomes a typed structured-output failure rather than a guess.
 */
export function parseWorkoutIntentOutput(
  request: AIProviderRequest<'workout_intent_extraction'>,
  rawContent: unknown,
): WorkoutIntentParseResult {
  if (rawContent === null || rawContent === undefined) {
    return parseFailure('Provider returned no workout-intent content.');
  }

  let candidate: unknown = rawContent;
  if (typeof rawContent === 'string') {
    const trimmed = rawContent.trim();
    if (trimmed.length === 0) {
      return parseFailure('Provider returned empty workout-intent content.');
    }
    try {
      candidate = JSON.parse(trimmed) as unknown;
    } catch {
      return parseFailure('Provider workout-intent content was not valid JSON.');
    }
  }

  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return parseFailure('Provider workout-intent content was not a JSON object.');
  }

  const withTask = injectContractFields(request.input, candidate as Record<string, unknown>);
  const validation = validateWorkoutIntentExtractionOutput(request.input, withTask);
  if (!validation.ok) {
    return parseFailure(formatValidationIssues(validation.failure.issues));
  }
  return { status: 'ok', output: validation.value };
}

/**
 * The validator checks task/contractVersion against the input. The model is
 * instructed to echo them, but to be robust we stamp the authoritative values
 * before validation so a model that omits them still validates when every other
 * field is correct. Invented ids and malformed shapes are still rejected.
 */
function injectContractFields(
  input: WorkoutIntentExtractionInput,
  value: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...value,
    task: input.task,
    contractVersion: input.contractVersion,
  };
}

function formatValidationIssues(
  issues: readonly { readonly path: string; readonly reasonCode: string }[],
): string {
  const summary = issues
    .slice(0, 5)
    .map((entry) => `${entry.path} (${entry.reasonCode})`)
    .join('; ');
  return `Workout-intent structured output failed validation: ${summary}.`;
}

function parseFailure(message: string): WorkoutIntentParseResult {
  return { status: 'failure', message };
}
