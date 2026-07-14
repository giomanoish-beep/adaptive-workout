import type {
  AIProviderRequest,
  GroundedDecisionExplanationInput,
  GroundedDecisionExplanationOutput,
} from '@adaptive-workout/ai';
import { validateGroundedDecisionExplanationOutput } from '@adaptive-workout/ai';
import type { ContractVersion } from '@adaptive-workout/domain';

/**
 * Shared, provider-agnostic prompt construction and structured-output parsing
 * for the `grounded_decision_explanation` task (docs/AI.md). AI explains an
 * already-computed authoritative decision using ONLY the supplied reason codes
 * and structured evidence. It cannot change the action, classification,
 * recommendation, or constraints, and it never invents reasons, history,
 * symptoms, performance, or user context. Provider handlers are thin adapters
 * over this module so semantics stay identical across GLM and DeepSeek.
 */

export const explanationContractVersion = 'ai-contract-1' as ContractVersion;
export const explanationPromptTemperature = 0;

export interface ExplanationPromptMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

/**
 * Builds the deterministic prompt messages handed to every provider. The
 * authoritative decision (action, reason codes, evidence) is injected as the
 * only source the model may reference. The model is forbidden from inventing
 * reasons/evidence, weakening safety outcomes, or offering medical claims.
 */
export function buildExplanationPromptMessages(
  request: AIProviderRequest<'grounded_decision_explanation'>,
): readonly ExplanationPromptMessage[] {
  const input = request.input;
  const decision = input.decision;
  const system = [
    'You explain an already-computed authoritative decision in plain, concise, user-friendly language.',
    'You do NOT make decisions, choose actions, classify safety, recommend load changes, or generate constraints.',
    'Use ONLY the reason codes and evidence supplied in the decision. Never invent reasons, evidence, history, symptoms, performance data, or user context.',
    'reasonCodeReferences and evidenceIdReferences must be subsets of the supplied codes and evidence ids — never add new ones.',
    'Keep the explanation within the requested character limit and in the requested locale.',
    'For pain-safety STOP, the explanation must NOT weaken the outcome into permission to train; describe the authoritative stop and recommend seeking qualified medical care.',
    'For pain-safety ADAPT or pain, never name a condition, claim tissue damage, promise safety or recovery, or give treatment advice.',
    'Incomplete information is NOT a STOP; describe it as unresolved required information, not as a safety stop.',
  ].join(' ');

  const user = [
    `Locale: ${input.locale}`,
    `Maximum characters: ${input.maximumCharacters}`,
    `Authoritative decision: ${serializeDecision(decision)}`,
    'Return ONLY a single JSON object:',
    JSON.stringify(schemaDescription, null, 2),
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

const schemaDescription = {
  task: 'grounded_decision_explanation',
  explanationText: 'concise plain-language explanation in the requested locale',
  reasonCodeReferences: 'array of supplied reason codes referenced by the explanation',
  evidenceIdReferences: 'array of supplied evidence ids referenced by the explanation',
} as const;

function serializeDecision(decision: GroundedDecisionExplanationInput['decision']): string {
  return JSON.stringify({
    kind: decision.kind,
    decisionId: decision.decisionId,
    action: decision.action,
    reasonCodes: decision.reasonCodes,
    evidence: decision.evidence,
    version: decision.version,
    decidedAt: decision.decidedAt,
  });
}

export type ExplanationParseResult =
  | { readonly status: 'ok'; readonly output: GroundedDecisionExplanationOutput }
  | { readonly status: 'failure'; readonly message: string };

/**
 * Parses raw provider JSON content into the typed, validated
 * `GroundedDecisionExplanationOutput`. Provider JSON is never trusted merely
 * because it parsed: it is run through the existing contract validator, which
 * rejects invented reason codes, unsupported evidence references, over-length
 * text, and any field that does not belong. The output contract carries only
 * explanationText and references — it physically cannot return a replacement
 * action, classification, recommendation, or constraints.
 */
export function parseExplanationOutput(
  request: AIProviderRequest<'grounded_decision_explanation'>,
  rawContent: unknown,
): ExplanationParseResult {
  if (rawContent === null || rawContent === undefined) {
    return parseFailure('Provider returned no explanation content.');
  }

  let candidate: unknown = rawContent;
  if (typeof rawContent === 'string') {
    const trimmed = rawContent.trim();
    if (trimmed.length === 0) {
      return parseFailure('Provider returned empty explanation content.');
    }
    try {
      candidate = JSON.parse(trimmed) as unknown;
    } catch {
      return parseFailure('Provider explanation content was not valid JSON.');
    }
  }

  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return parseFailure('Provider explanation content was not a JSON object.');
  }

  const withTask = injectContractFields(request.input, candidate as Record<string, unknown>);
  const validation = validateGroundedDecisionExplanationOutput(request.input, withTask);
  if (!validation.ok) {
    return parseFailure(formatValidationIssues(validation.failure.issues));
  }
  return { status: 'ok', output: validation.value };
}

/**
 * The validator checks task/contractVersion against the input. The model is
 * instructed to echo them, but to be robust we stamp the authoritative values
 * before validation so a model that omits them still validates when every other
 * field is correct. Invented reason codes and unsupported evidence references
 * are still rejected by the validator's subset checks.
 */
function injectContractFields(
  input: GroundedDecisionExplanationInput,
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
  return `Explanation structured output failed validation: ${summary}.`;
}

function parseFailure(message: string): ExplanationParseResult {
  return { status: 'failure', message };
}
