# Workout Engine

The workout engine is a pure, versioned function where practical. Initial rules are configurable hypotheses, not claims of scientific perfection.

## Inputs

- User goal, experience/config profile, requested muscles, duration, and session date.
- Available equipment and optional location constraints.
- Eligible exercise catalog with family, muscle contribution, equipment, and duration metadata.
- Program prescription when applicable.
- Recent set history, muscle state, performance state, preferences, exclusions, and pain-safety constraints.
- Explicit rule configuration and deterministic seed/tie-break policy.

`WorkoutEngineInput` is the authoritative serializable request contract. It carries branded subject, muscle, equipment, exercise, family, program, and decision identities; session context; deterministic versions and seed; catalog candidates; recent state and exposure context; preferences; optional program prescriptions; and generic workout constraints. `validateWorkoutEngineInput` rejects malformed or contradictory requests before candidate filtering.

## Hard constraints

Reject inactive exercises, unavailable required equipment, explicit avoidances, safety exclusions, incompatible program requirements, and exercises that cannot fit minimum prescription/time. Hard constraints never become soft score penalties.

`WorkoutConstraint` is a discriminated union for required or excluded muscles, unavailable equipment, excluded or preferred exercises/families, reduced exercise priority, maximum duration, and per-muscle volume limits. Safety features may supply these generic constraints but cannot place diagnoses or medical conditions in engine input.

`filterWorkoutCandidates` applies only hard eligibility rules and returns stably ordered eligible and rejected candidates with controlled rejection reasons. Primary and secondary muscle contributions establish target relevance; stabilizer contributions alone do not. Every required equipment item must be available, optional equipment is not required, and explicitly unavailable required equipment is reported separately from missing equipment. Exercise-family exclusions represent generic movement-pattern restrictions when their controlled reason code is `movement_pattern_excluded`. Preference and reduced-priority constraints remain available for later scoring and never remove candidates here.

## Candidate scoring

`rankWorkoutCandidates` validates the engine input and versioned `WorkoutCandidateScoringRuleSet`, applies hard filtering, and scores only the remaining eligible candidates. Components cover weighted primary/secondary target relevance and requested emphasis, preferred-muscle emphasis, explicit user preference, preferred or reduced-priority constraints, deterministic recency decay, and compatible template prescriptions. Each ranked candidate carries its final score, reconcilable components, controlled reason codes, stable rank, and scoring/engine versions.

Weights, adjustment bounds, and recency windows are explicit configurable product rules. They are initial deterministic hypotheses, not claims of scientific optimality. Scores sort descending and ties use canonical exercise IDs; input ordering and the deterministic seed do not affect scoring.

## Volume allocation and selection

`allocateAndSelectWorkoutExercises` validates versioned allocation rules, reuses the filter-and-score pipeline, and assigns integer working-set counts to a deterministic ordered exercise selection. Required and preferred target muscles receive configurable minimum and target volumes; explicit `muscle_volume_limit` constraints define hard bounds. Weighted volume uses catalog contribution multiplied by configurable primary or secondary role coefficients, while stabilizer roles do not receive planned working-set volume.

Selection starts from ranked eligible candidates, balances normalized target deficits, and prefers an unused exercise family when it can provide useful coverage. Existing or repeated-family candidates remain available when required for coverage. An optional minimum distinct-family rule can make diversity hard; otherwise diversity is a deterministic preference. Final ordering follows score rank and canonical exercise ID. This places higher-ranked major movements before lower-ranked isolation work when current catalog/scoring metadata supports that distinction without inventing biomechanical fields.

Allocation returns selected exercises, integer working sets, weighted muscle-volume summaries, versions, and the full filtering/scoring evidence. Expected coverage, constraint, diversity, and configuration failures are typed results. Duration estimation and enforcement remain a separate final construction stage.

## Duration fitting

`constructDurationFittedWorkout` reuses filtering, scoring, and allocation, then estimates setup, set execution, between-set rest, and between-exercise transitions from a validated versioned `WorkoutDurationRuleSet`. The exact total is:

`setup + set execution + between-set rest + between-exercise transitions`

Per exercise, setup uses candidate metadata or the configured setup default. Set execution is `working sets * per-set seconds`. Rest is `(working sets - 1) * rest seconds`, using template rest guidance when present or the goal-adjusted default otherwise. Transitions are `(exercise count - 1) * transition seconds`. Warm-up sets, cooldown, supersets, and buffer time are not modeled in this stage. Estimates are deterministic planning approximations, not exact predictions.

The effective duration limit is the smaller of the request duration and any hard maximum-duration constraint. Oversized plans first remove sets only when target volume remains satisfied, then reduce lower-ranked optional volume while preserving hard minimum muscle coverage, and finally remove a lower-priority exercise when necessary. Candidate choice minimizes target-volume imbalance before using score rank and canonical identity tie-breaks. The engine fails rather than return a plan below required coverage.

After downward fitting, duration also acts as a planning budget. When estimated utilization remains below a configured target and enough meaningful time remains, the engine adds sets to selected high-ranked exercises for the least-utilized target muscle, then considers high-ranked eligible exercises from unused families at the practical minimum set count. The preferred-volume multiplier is a soft first expansion ceiling. If a longer session is still materially underfilled, expansion may continue toward the existing hard per-muscle maximums before stopping. Expansion stops with an explicit reason: target utilization reached, too little meaningful budget remains, maximum useful volume reached, candidate saturation, or movement-pattern constraints. It may leave spare time when no useful non-redundant volume fits; it never adds work merely to reach 100% utilization. For example, 75- and 90-minute requests may return the same plan only when the selected target muscles are at hard useful-volume caps and every remaining target-relevant candidate would exceed those caps; that state is reported as `maximum_useful_volume_reached`. Exercise count is therefore an outcome of useful volume, coverage, rest, setup, transition cost, candidate availability, and safety limits, not an input chosen directly from requested minutes.

Selected exercises require a configurable minimum of at least two working sets. Existing one-set prescriptions are omitted when coverage remains valid or transferred without increasing total sets when another selected exercise can preserve coverage and hard limits. Otherwise construction returns a typed minimum-prescription failure. No warm-up sets, cooldown, supersets, progression decisions, or pain classifications are introduced by this stage.

## Pipeline

1. Validate and normalize input; return typed errors for missing required data.
2. Filter candidates by hard constraints and record every exclusion reason.
3. Score eligible candidates using versioned target relevance, preference, recency, and program-fit rules with stable tie-breakers.
4. Select exercises while limiting repeated exercise families and redundant movement patterns, then allocate volume within configured bounds.
5. Estimate duration from setup, set execution, rest, and transitions. Iteratively trim lowest-value optional work if over budget.
6. Validate the final workout and emit unmet constraints rather than inventing invalid work.

## Substitutions

`substituteWorkoutExercise` replaces an exercise in an existing duration-fitted workout without bypassing the established filtering, scoring, volume, or duration rules. It supports controlled busy/unavailable equipment, dislike, generic discomfort-constraint, difficulty, and manual reasons. Unavailable equipment is a hard exclusion; busy equipment is a configurable ranking penalty. Explicit catalog edges provide weighted compatibility evidence but cannot restore an ineligible candidate, and versioned fallback rules may admit compatible catalog candidates outside the graph.

The result contains stably ranked options, controlled score and reason codes, compatibility evidence, the selected replacement, a reconciled workout, and contract/engine/rule-set versions. Exercise position and working-set count remain stable. Existing prescription intent is preserved only for same-family or sufficiently compatible replacements; this stage does not invent rep or RIR prescriptions absent from the duration-fitted input. Every option is revalidated for required muscle coverage, hard volume limits, and duration before it can be returned.

## Decision logging

Record engine/rule-set version, normalized input reference, candidate exclusions, score components, volume allocation, duration calculation, substitutions, tie-breaks, warnings, and final reason codes. Logs must be deterministic for identical inputs and configuration.

`WorkoutDecisionTracePersistencePort` keeps persistence outside the pure engine. The server-only Supabase adapter deterministically maps selected exercises, hard exclusions, muscle-volume allocations, and duration reductions or expansions into one atomic `workout_decisions` batch. Every row retains user ownership, optional session linkage, contract/engine/rule-set versions, the request-provided decision timestamp, normalized source context, structured output, controlled reason codes, and ordered evidence.

The current table has generated UUIDs but no operation ID or unique idempotency key. The adapter therefore performs no unreliable in-memory deduplication and cannot guarantee retry idempotency. A retry-safe contract requires a future schema task adding a deterministic operation key and uniqueness constraint; until then, callers must treat an ambiguous write result as non-retryable without reconciliation.

## Output contract

`WorkoutEngineResult` conceptually contains `status`, `workout`, `exercisePrescriptions`, `volumeAllocation`, `estimatedDurationMinutes`, `unmetConstraints`, `warnings`, and `decisionTrace`. The output contains IDs and prescriptions, not display prose. No database, clock, random, React, Supabase, or AI access occurs inside the engine; time and seed are inputs.

The implemented success contract contains an ordered plan, working sets, duration estimates, target-muscle volume, duration expansion stop reason, decision evidence, and engine versions. Expected generation failures use a serializable `status: 'failure'` result with controlled failure and reason codes rather than exceptions.
