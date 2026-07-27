# AI

AI is an optional interpretation and explanation layer behind trusted server-side boundaries. DeepSeek is the production provider integration behind the `AIProvider` abstraction; GLM remains an interchangeable provider implementation for router configurations where it is explicitly configured. No provider SDK or secret is included in browser code.

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

## DeepSeek production provider

The server-side DeepSeek provider is created only from server environment:

- `DEEPSEEK_API_KEY` is required and is used only by the HTTP transport.
- `DEEPSEEK_BASE_URL` is optional and defaults to `https://api.deepseek.com`.
- `DEEPSEEK_MODEL` is optional and defaults to `deepseek-v4-flash`.

DeepSeek requests explicitly disable thinking mode and use JSON Output for structured tasks:

```json
{
  "thinking": { "type": "disabled" },
  "response_format": { "type": "json_object" }
}
```

The legacy `deepseek-chat` and thinking `deepseek-reasoner` model IDs are rejected before any request is made. Provider responses are parsed as JSON and validated against the existing task output contracts before use. Empty content, malformed JSON, schema-invalid JSON, terminal provider errors, rate limits, unavailable provider responses, timeouts, request cancellation, and truncated output all become typed `AIProviderResult` failures rather than raw provider details.

## Routing

A server-side router may compose providers with bounded attempts and idempotent trace metadata. Authentication, rate limits, redaction, timeouts, and logging live outside browser code. Fallback never weakens schema validation or safety boundaries.

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
