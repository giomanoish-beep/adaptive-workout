# Progression Engine

The progression engine returns configurable, testable recommendations. Initial thresholds must be tuned from evidence and must not be presented as universally optimal.

## Inputs and exposure history

For one user and exercise, provide ordered completed exposures containing prescribed and completed sets, load/unit, reps, RIR, execution status, session date, relevant substitutions, and deload markers. Also provide target rep range, target RIR range, minimum exposure count, load increments, and versioned rule configuration.

Normalize units before evaluation. Ignore incomplete or invalid sets according to explicit rules and include ignored-data reasons in the trace.

`ProgressionEngineInput` represents one subject and exercise with oldest-to-newest exposure occurrences. Each exposure retains its historical prescription, substitution context, deload marker, completion status, and ordered raw set records. Completed, skipped, and incomplete sets are discriminated; warm-up sets never become working-set evidence, and a completed working set requires observed reps before it is considered usable. Null load, reps, or RIR remain unknown, while zero load, zero reps, and zero RIR remain valid observations where otherwise well formed.

`validateProgressionInput` rejects duplicate exposure or set IDs, malformed chronology, invalid values, mixed known load units, invalid prescriptions or increments, insufficient usable history, and incompatible versions as serializable typed failures. `ProgressionRuleSet` versions history sufficiency, analysis windows, repeated-signal requirements, known-RIR requirements, RIR reduction margin, and bounded load reduction.

`analyzeProgressionEvidence` evaluates the latest configured chronological window without mutating history. It emits per-exposure usable/ignored working-set counts, representative load when every usable set has one consistent load, rep and known-RIR ranges, target-relative rep/RIR classifications, deload and substitution markers, excluded older exposure IDs, and transparent load, rep-performance, and RIR directions. Unknown RIR remains absent evidence; deload-marked exposures remain visible but do not affect the current performance trend.

## Recommendation rules

- **Increase load:** enough recent qualifying exposures complete all required sets at or above the upper rep threshold without undershooting target RIR; select the smallest valid configured increment.
- **Maintain:** performance remains inside target reps/RIR, history is insufficient, or evidence is mixed without a reduction signal.
- **Reduce load:** repeated qualifying sets fall below minimum reps, target RIR is materially undershot, or completion fails under configured non-pain conditions; use a bounded percentage or valid decrement.
- **Plateau:** a configured number of comparable exposures show no rep/load improvement despite adequate completion and no deload/pain confounder.
- **Deload signal:** configurable multi-exercise or repeated-exposure degradation, high effort relative to prescription, or accumulated muscle-state thresholds requests a broader deload review; it does not diagnose fatigue.
- **Consider substitution:** plateau persists after configured maintain/reduction actions, preference is negative, safety constraints recur, or execution repeatedly fails for exercise-specific reasons. The workout engine chooses the replacement.

RIR is self-reported and noisy. Rules use ranges and repeated exposures rather than reacting aggressively to one set. Pain-linked reductions are delegated to the pain-safety constraints, not inferred here.

`recommendProgression` implements increase, maintain, reduce, plateau, substitution-review, and deload-review outcomes. Increase requires a configurable number of recent non-deload exposures at the top of the target rep range, sufficient known RIR evidence when a target exists, and a valid smallest load increment. Reduction requires repeated below-range exposures or repeated RIR observations below the configurable margin and applies only a configured bounded decrement. A plateau requires repeated comparable non-deload exposures with stable load, set count, and reps and no recent progression. A longer plateau with sufficient known high-effort evidence produces a substitution-review signal, never a replacement selection.

Deload review uses a configurable recent exposure window and emits a review signal after sustained performance decline or repeated materially below-target RIR. Unknown RIR does not count as high effort, while RIR zero remains valid evidence. A deload-marked exposure remains visible and suppresses another review while it is inside the configured window. The action recommends broader review only: it does not diagnose fatigue, prescribe a deload, or calculate multi-exercise or muscle state that is absent from the per-exercise input contract.

## Deterministic contract

`ProgressionRecommendation` conceptually contains `action` (`INCREASE_LOAD`, `MAINTAIN`, `REDUCE_LOAD`, `REVIEW_DELOAD`, or `CONSIDER_SUBSTITUTION`), `recommendedLoad`, `repRange`, `targetRir`, `confidenceBasis`, `reasonCodes`, `evidenceExposureIds`, `warnings`, `ruleSetVersion`, and `decisionTrace`. Identical normalized inputs and configuration produce identical output. Missing data produces maintain/review outcomes, never fabricated history.

The recommendation contract supports increase, maintain, reduce, deload review, rep-range change, and substitution-review actions with previous/recommended load, target ranges, controlled reasons, source exposure/set IDs, optional observed ranges and trend evidence, versions, and the request-provided calculation timestamp. Rep-range-change rules remain a later task.

## Decision trace persistence

`@adaptive-workout/progression-decision-persistence` is a server-only boundary that maps one validated `ProgressionRecommendation` to one immutable `workout_decisions` row. The row preserves user and exercise identity, optional workout-session linkage, action and reason codes, source exposure and set IDs, structured analysis evidence, calculation timestamp, and engine, rule-set, recommendation-contract, and analysis-contract versions. The adapter receives a trusted Supabase-compatible client and never reads credentials or imports Supabase into the pure progression engine.

Each call uses one database insert, so a single trace is atomic. The current audit schema has no operation identifier or uniqueness constraint for deterministic retry deduplication; retries therefore append another immutable audit row. Performance-state materialization, source watermarks, stale-write protection, and equal-watermark semantics do not apply to this task and are not inferred from the audit table.
