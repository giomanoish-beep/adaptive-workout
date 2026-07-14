# AI

AI is an optional interpretation and explanation layer behind trusted server-side boundaries. GLM is primary and DeepSeek is fallback. No provider SDK or secret is included in browser code.

## Provider abstraction

```ts
interface AIProvider {
  readonly definition: AIProviderDefinition;
  execute<Task extends AITaskKind>(
    request: AIProviderRequest<Task>,
  ): Promise<AIProviderResult<Task>>;
}
```

`AIProviderRequest` carries a versioned task input and deterministic request metadata. `AIProviderResult` returns validated task output or a typed failure; provider/model, timing, and usage metadata remain outside the task output. Provider identity is data rather than a closed vendor union, so providers remain replaceable without changing task contracts.

## Routing

A server-side router calls GLM first. It may call DeepSeek only for configured transient failures, timeout, or invalid structured output, with bounded attempts and idempotent trace metadata. Authentication, rate limits, redaction, timeouts, and logging live outside providers. Fallback never weakens schema validation or safety boundaries.

## Structured tasks

- `workout_intent_extraction`: parses target and excluded muscles, duration, equipment intent, explicit exercise exclusions or preferences, and unresolved information. It never produces the authoritative workout.
- `discomfort_observation_extraction`: extracts non-diagnostic user-reported observations into pain-safety vocabulary. Omission never means `absent`; unknown or unreported values remain `unknown` or `null` as defined by the contract.
- `grounded_decision_explanation`: explains an authoritative workout, progression, or pain-safety decision using only supplied reason codes and evidence references. It cannot replace the action, classification, constraints, or recommendation.

All outputs are parsed against versioned schemas. Invalid, unsupported, or uncertain values are rejected or represented explicitly; they are never silently guessed.

AI parses and explains. Deterministic workout, progression, and pain-safety engines decide. Provider implementations must remain server-side and interchangeable behind `AIProvider`.

## Allowed responsibilities

- Parse natural-language workout intent into candidate structured input.
- Extract structured facts from reported discomfort and propose missing-information questions.
- Explain an already-computed decision using only supplied evidence.

## Prohibited responsibilities

- Generate the authoritative workout or bypass workout-engine validation.
- Choose progression changes.
- Classify GREEN, ADAPT, or STOP.
- Diagnose injury, infer a medical condition, or give treatment advice.
- Access provider keys in the browser or become a database source of truth.

Record provider/model, contract version, validation outcome, fallback path, and links to authoritative decisions. Do not log secrets; define redaction and retention before storing raw prompts.
