import type {
  AIProviderRequest,
  DiscomfortObservationExtractionInput,
  DiscomfortObservationExtractionOutput,
} from '@adaptive-workout/ai';
import { validateDiscomfortObservationExtractionOutput } from '@adaptive-workout/ai';
import type { ContractVersion } from '@adaptive-workout/domain';

/**
 * Shared, provider-agnostic prompt construction and structured-output parsing
 * for the `discomfort_observation_extraction` task (docs/AI.md, docs/PAIN_SAFETY.md).
 *
 * AI extracts only user-reported discomfort information. It never diagnoses,
 * never classifies GREEN/ADAPT/STOP, and never generates constraints or
 * workouts. Omitted safety information remains "unknown" (never "absent");
 * severity 0 is valid observed data and distinct from null (unknown). Only
 * controlled body-area, side, onset, trend, movement-trigger, and tri-state
 * values are permitted. Provider handlers are thin adapters over this module so
 * semantics stay identical across GLM and DeepSeek.
 */

export const discomfortContractVersion = 'ai-contract-1' as ContractVersion;
export const discomfortPromptTemperature = 0;

const maximumReportTextLength = 4_000;

export interface DiscomfortPromptMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

/**
 * Builds the deterministic prompt messages handed to every provider. The
 * controlled vocabularies are injected as the only legal values so the model
 * echoes them back; it must never invent body areas, sides, movement patterns,
 * or medical conditions. Safety fields default to "unknown" when unstated.
 */
export function buildDiscomfortPromptMessages(
  request: AIProviderRequest<'discomfort_observation_extraction'>,
): readonly DiscomfortPromptMessage[] {
  const input = request.input;
  const vocabulary = input.controlledVocabulary;
  const system = [
    'You extract structured, non-diagnostic discomfort observations from natural-language reports.',
    'You never diagnose, identify injuries, name medical conditions, or give treatment advice.',
    'You never classify safety (GREEN, ADAPT, STOP) and never generate training constraints or workouts.',
    'Return ONLY a single JSON object that matches the requested schema.',
    'Use ONLY the controlled values listed in the provided vocabulary.',
    'Never invent body areas, sides, movement patterns, activity contexts, or medical terms.',
    'Every safety field is one of: present, absent, unknown.',
    'If a safety signal is NOT explicitly reported by the user, it MUST be "unknown" — never "absent".',
    'Only set a safety field to "absent" when the user explicitly denies that symptom.',
    'severity is an integer from 0 to 10. Use 0 when the user reports zero pain. Use null when severity is not stated. Never conflate the two.',
    'Omitting equipment or movement context means "unknown", not "none" or "absent".',
  ].join(' ');

  const user = [
    `Report text: ${truncate(input.reportText)}`,
    input.knownEvent ? `Known event context: ${JSON.stringify(input.knownEvent)}` : '',
    `Vocabulary: ${serializeVocabulary(vocabulary)}`,
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
  task: 'discomfort_observation_extraction',
  bodyArea: 'one vocabulary body area, or null if unstated',
  side: 'one vocabulary body side, or null if unstated',
  severity: 'integer 0-10, or null if unstated (0 means zero reported pain)',
  onsetPattern: 'one of: sudden, gradual, unknown',
  activityContext: 'one vocabulary activity context',
  trend: 'one of: improving, unchanged, worsening, resolved, unknown',
  movementTriggerStatus: 'present, absent, or unknown',
  movementTriggers:
    'array of {kind:"movement_pattern",movementPattern} | {kind:"exercise",exerciseId} | {kind:"exercise_family",exerciseFamilyId} | {kind:"activity",activityContext}',
  safety: {
    traumaticOrSuddenOnset: 'present | absent | unknown',
    swelling: 'present | absent | unknown',
    instabilityOrGivingWay: 'present | absent | unknown',
    weightBearingLimitation: 'present | absent | unknown',
    visibleDeformity: 'present | absent | unknown',
    numbnessOrWeakness: 'present | absent | unknown',
    chestPainOrBreathingDifficulty: 'present | absent | unknown',
    fainting: 'present | absent | unknown',
    severeSystemicSymptoms: 'present | absent | unknown',
  },
} as const;

function truncate(text: string): string {
  if (text.length <= maximumReportTextLength) return text;
  return `${text.slice(0, maximumReportTextLength)}…`;
}

function serializeVocabulary(
  vocabulary: DiscomfortObservationExtractionInput['controlledVocabulary'],
): string {
  return JSON.stringify({
    bodyAreas: vocabulary.bodyAreas,
    bodySides: vocabulary.bodySides,
    movementPatterns: vocabulary.movementPatterns,
    activityContexts: vocabulary.activityContexts,
    triStateValues: vocabulary.triStateValues,
    exerciseIds: vocabulary.exerciseIds,
    exerciseFamilyIds: vocabulary.exerciseFamilyIds,
  });
}

export type DiscomfortParseResult =
  | { readonly status: 'ok'; readonly output: DiscomfortObservationExtractionOutput }
  | { readonly status: 'failure'; readonly message: string };

/**
 * Parses raw provider JSON content into the typed, validated
 * `DiscomfortObservationExtractionOutput`. Provider JSON is never trusted merely
 * because it parsed: it is run through the existing contract validator, which
 * enforces controlled vocabularies, the omission-stays-unknown rule, severity
 * bounds, and rejects diagnosis-shaped or unsupported fields. Any failure
 * becomes a typed structured-output failure rather than a guess.
 */
export function parseDiscomfortOutput(
  request: AIProviderRequest<'discomfort_observation_extraction'>,
  rawContent: unknown,
): DiscomfortParseResult {
  if (rawContent === null || rawContent === undefined) {
    return parseFailure('Provider returned no discomfort content.');
  }

  let candidate: unknown = rawContent;
  if (typeof rawContent === 'string') {
    const trimmed = rawContent.trim();
    if (trimmed.length === 0) {
      return parseFailure('Provider returned empty discomfort content.');
    }
    try {
      candidate = JSON.parse(trimmed) as unknown;
    } catch {
      return parseFailure('Provider discomfort content was not valid JSON.');
    }
  }

  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return parseFailure('Provider discomfort content was not a JSON object.');
  }

  const withTask = injectContractFields(request.input, candidate as Record<string, unknown>);
  const validation = validateDiscomfortObservationExtractionOutput(request.input, withTask);
  if (!validation.ok) {
    return parseFailure(formatValidationIssues(validation.failure.issues));
  }
  return { status: 'ok', output: validation.value };
}

/**
 * The validator checks task/contractVersion against the input. The model is
 * instructed to echo them, but to be robust we stamp the authoritative values
 * before validation so a model that omits them still validates when every other
 * field is correct. Unsupported fields, invented values, and diagnosis-shaped
 * output are still rejected by the validator.
 */
function injectContractFields(
  input: DiscomfortObservationExtractionInput,
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
  return `Discomfort structured output failed validation: ${summary}.`;
}

function parseFailure(message: string): DiscomfortParseResult {
  return { status: 'failure', message };
}
