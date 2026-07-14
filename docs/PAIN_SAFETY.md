# Pain Safety

This feature handles user-reported discomfort conservatively. It does not diagnose, identify injuries, prescribe treatment, or replace professional care.

## Event model

A `pain_event` captures user wording, occurrence/onset time, workflow state, deterministic classification, rule-set version, and follow-up state. Structured observations capture body area/side, severity scale, sensation terms, onset context, duration, trend, movement/load aggravators, effect on normal activity, and answers to predefined warning-signal questions. Associations link events to exercises or exercise families without asserting causation.

`@adaptive-workout/pain-safety` defines the framework-independent contracts for event ownership, ordered initial/follow-up observations, controlled body area and side values, severity from 0 through 10, controlled movement triggers, requested training context, and version lineage. Safety-relevant answers use `present`, `absent`, or `unknown`; unknown is never normalized to absent. Reported severity `0` is observed data, while `null` means severity is unknown.

The package defines data-only missing-information descriptors, deterministic `GREEN`/`ADAPT`/`STOP` classification outputs, and generic adaptation-constraint shapes. It evaluates missing information and classification without generating adaptation constraints. Contracts contain reported observations and programming restrictions only—never condition names, treatment fields, or diagnostic output.

## AI extraction boundary

AI may map user wording into a versioned extraction contract and identify missing fields. Extracted values remain untrusted until schema validation and, for consequential ambiguity, user confirmation. AI never outputs the authoritative safety class or a diagnosis.

## Missing-information questions

Ask only fields needed by deterministic rules, prioritizing: current severity and trend; sudden traumatic onset; inability to use or bear weight; visible deformity or major swelling; numbness, weakness, or loss of control; chest pain, breathing difficulty, fainting, or severe systemic symptoms; affected movements; and whether symptoms persist at rest. Questions use plain, non-leading language and permit “unsure.”

`evaluateMissingDiscomfortInformation` validates the event and a versioned question-priority and batching rule set before returning controlled missing-information entries. `missingInformation` contains every unresolved configured question, while `currentQuestionBatch` contains only the highest-priority unresolved entries up to the configured positive bounded maximum. It never emits question prose. Lower numeric priorities run first, and equal priorities use the canonical question-code order for stable output.

The default product rule asks at most five questions per evaluation. It prioritizes severity, sudden or traumatic onset, major weight-bearing limitation, deformity, swelling, instability, numbness or weakness, and systemic warning signals before symptom trend and movement-trigger context. Re-evaluation derives the next batch only from the supplied observation history and rule-set version; the evaluator keeps no conversational state.

Observations use field-wise follow-up semantics. The latest explicit value answers a field; a later `unknown` or `null` does not erase an earlier explicit answer. Severity `0`, tri-state `absent`, and an explicitly absent movement trigger are answered values. The resolved summary records every observation that contributed carried-forward evidence without mutating history. Classification reuses this evaluation and does not generate training constraints.

## Deterministic classification

- `STOP`: any configured reported warning signal, severity at or above the configured threshold, or configured worsening trend. Explicit STOP evidence takes precedence over unresolved lower-priority information and ADAPT evidence. STOP is a programming decision not to authoritatively generate the affected requested session; it is not a diagnosis.
- `ADAPT`: required information is resolved and no STOP rule matches, but reported severity exceeds the configured GREEN maximum or a movement trigger is present. Constraint generation remains a separate task.
- `GREEN`: required information is resolved, no STOP signal exists, severity is within the configured minimum range, the trend is configured as GREEN-compatible, and no movement trigger is reported. GREEN means no rule-based restriction was found, not “medically safe.”

`classifyDiscomfortEvent` returns a discriminated success union. `classified` contains an authoritative `GREEN`, `ADAPT`, or `STOP` result. `information_required` contains no classification and preserves `REQUIRED_INFORMATION_UNAVAILABLE`, all unresolved information, the current progressive question batch, and resolved evidence. Both variants preserve source observation IDs and engine/rule-set/contract lineage. Unknown values remain unresolved and never become absent.

The current `pain_events` schema can leave classification fields null, but its all-or-none constraint cannot retain engine version, rule-set version, or evaluation timestamp without a completed classification. Persisting auditable incomplete evaluations therefore needs a later database or hardening decision; this task does not change migrations.

## ADAPT constraints

`generatePainSafetyAdaptation` accepts the completed or incomplete classification evaluation and a versioned adaptation rule set. `information_required` never generates constraints, `GREEN` returns `no_adaptation_required`, and `STOP` returns `training_not_authorized` without suggesting alternatives. Only completed `ADAPT` evidence can produce authoritative generic constraints.

The default rules translate only reported structured triggers. Moderate movement-pattern aggravation reduces that pattern's priority and caps its working-set volume. Stronger ADAPT severity hard-excludes only the directly reported movement pattern; this exclusion supersedes softer constraints for the same pattern. Reported exercise and exercise-family triggers can produce direct exclusions. Activity-only or absent/unknown triggers do not infer movement restrictions. Equivalent constraints are deduplicated and sorted deterministically.

Generated constraints remain package-independent and contain controlled programming reason codes, source observation IDs, evidence, and version lineage. A later integration boundary may translate supported constraints into workout-engine inputs, but it must reject unsupported mappings rather than silently dropping them. Pain-safety does not import the workout engine, select replacements, or generate workout plans.

## Follow-up and history

`evaluateDiscomfortFollowUp` compares the latest reported follow-up with prior resolved evidence without mutating history. It returns controlled `unresolved`, `improving`, `unchanged`, `worsening`, or `resolved` status; severity comparison; newly present configured STOP signals; source observation IDs; reassessment requirement; and adaptation review signal. Missing severity never implies improvement, severity `0` remains reported zero, and latest raw tri-state safety answers preserve `unknown` separately from `absent`.

The default versioned rules treat a severity change of at least two points as material and a difference within one point as stable. Explicit worsening or a newly present configured STOP signal produces worsening evidence and reassessment. Resolution requires explicit `resolved` trend, severity `0`, and absent movement trigger. Stable evidence retains prior adaptation for review; improvement or resolution signals review for relaxation; worsening signals regeneration through the existing classification and adaptation APIs rather than directly changing a workout.

Recurrence is a non-diagnostic signal, not a claim that the same injury returned. A new event matches only a prior explicitly resolved event with the same body area and side. The most recent matching prior event is selected deterministically and its event and observation IDs are preserved. No recurrence time window is imposed because the current architecture does not document one.

## Language rules

Never name a condition, claim tissue damage, promise safety or recovery, or tell a user to ignore symptoms. Use “reported discomfort,” “warning signal,” “training constraint,” and “consider seeking qualified medical care.” Explanations must cite provided rule reasons and clearly distinguish user report from system inference.

`painSafetyLanguageFixtures` provides reviewed static messages for incomplete information, completed GREEN/ADAPT/STOP classifications, improving/unchanged/worsening/resolved follow-up, and recurrence signals. `selectPainSafetyLanguageFixture` selects a fixture from existing structured classification, adaptation, or follow-up output and preserves the exact source reason codes; it does not generate prose or change authoritative decisions.

Fixture validation rejects duplicate codes or reasons, invalid versions/messages, unsupported reason references, diagnostic terminology, unsafe assurances, treatment recommendations, and missing required non-diagnostic terminology. Recurrence language describes only matching reported context and never claims that a condition returned.
