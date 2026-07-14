import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import {
  classifyDiscomfortEvent,
  defaultPainSafetyAdaptationRuleSet,
  defaultPainSafetyClassificationRuleSet,
  generatePainSafetyAdaptation,
  type DiscomfortEventContract,
  type DiscomfortMovementTrigger,
  type DiscomfortObservation,
  type DiscomfortSafetyObservations,
  type PainSafetyAdaptationOutcome,
  type PainSafetyAdaptationRuleSet,
  type PainSafetyClassificationEvaluation,
  type PainSafetySubjectId,
} from './index.js';

const subjectId = id('10000000-0000-0000-0000-000000000001', 'user') as PainSafetySubjectId;
const eventId = id('20000000-0000-0000-0000-000000000001', 'pain-event');

describe('deterministic pain-safety adaptation generation', () => {
  it('does not generate constraints from information-required evaluation', () => {
    const outcome = adapt(eventWith(observation(1)));

    expect(outcome.status).toBe('information_required');
    expect(outcome.reasonCodes).toEqual(['INFORMATION_REQUIRED']);
    expect(outcome.constraints).toEqual([]);
    if (outcome.status !== 'information_required') {
      throw new Error('Expected information-required outcome.');
    }
    expect(outcome.missingInformation).toHaveLength(10);
    expect(questionCodes(outcome.currentQuestionBatch)).toEqual([
      'severity',
      'traumatic_or_sudden_onset',
      'weight_bearing_limitation',
      'visible_deformity',
      'swelling',
    ]);
  });

  it('produces no restrictive constraints from GREEN', () => {
    const outcome = adapt(
      eventWith(resolvedObservation(1, { severity: 0, movementTriggerStatus: 'absent' })),
    );

    expect(outcome).toMatchObject({
      status: 'no_adaptation_required',
      reasonCodes: ['NO_ADAPTATION_REQUIRED'],
      constraints: [],
    });
  });

  it('reduces priority and volume for moderate deep-flexion aggravation', () => {
    const outcome = adapt(eventWith(resolvedObservation(1)));

    expect(outcome.status).toBe('constraints_generated');
    expect(outcome.constraints).toEqual([
      {
        constraintId: 'adapt_reduce_priority_deep_flexion',
        kind: 'reduce_movement_pattern_priority',
        reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED',
        movementPatterns: ['deep_flexion'],
      },
      {
        constraintId: 'adapt_reduce_volume_deep_flexion',
        kind: 'reduce_volume',
        reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED',
        movementPattern: 'deep_flexion',
        maximumWorkingSets: 2,
      },
    ]);
  });

  it('generates pressing-related generic constraints only from reported pressing aggravation', () => {
    const outcome = adapt(
      eventWith(
        resolvedObservation(1, {
          bodyArea: 'shoulder',
          side: 'right',
          severity: 2,
          movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'pressing' }],
        }),
      ),
    );

    expect(outcome.constraints).toEqual([
      expect.objectContaining({
        kind: 'reduce_movement_pattern_priority',
        movementPatterns: ['pressing'],
      }),
      expect.objectContaining({ kind: 'reduce_volume', movementPattern: 'pressing' }),
    ]);
  });

  it('does not infer a movement restriction without a reported movement trigger', () => {
    const outcome = adapt(
      eventWith(resolvedObservation(1, { movementTriggerStatus: 'absent', movementTriggers: [] })),
    );

    expect(outcome).toMatchObject({
      status: 'no_constraints_generated',
      reasonCodes: ['NO_SUPPORTED_REPORTED_TRIGGER'],
      constraints: [],
    });
  });

  it('does not invent a restriction when movement-trigger evidence is unknown', () => {
    const outcome = adapt(eventWith(observation(1)));

    expect(outcome.status).toBe('information_required');
    expect(outcome.constraints).toEqual([]);
  });

  it('hard-excludes only the reported pattern for stronger ADAPT evidence', () => {
    const outcome = adapt(eventWith(resolvedObservation(1, { severity: 5 })));

    expect(outcome.constraints).toEqual([
      {
        constraintId: 'adapt_exclude_deep_flexion',
        kind: 'exclude_movement_pattern',
        reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED',
        movementPatterns: ['deep_flexion'],
      },
    ]);
  });

  it('never emits diagnostic or treatment terminology', () => {
    const serialized = JSON.stringify(adapt(eventWith(resolvedObservation(1)))).toLowerCase();

    expect(serialized).not.toContain('diagnosis');
    expect(serialized).not.toContain('injury');
    expect(serialized).not.toContain('treatment');
    expect(serialized).not.toContain('therapy');
  });

  it('deduplicates equivalent constraints deterministically', () => {
    const evaluation = classified(eventWith(resolvedObservation(1)));
    const duplicateTrigger = evaluation.evidence.movementTriggers[0]!;
    const duplicated: PainSafetyClassificationEvaluation = {
      ...evaluation,
      evidence: {
        ...evaluation.evidence,
        movementTriggers: [duplicateTrigger, duplicateTrigger],
      },
    };
    const outcome = generate(duplicated);

    expect(outcome.constraints).toHaveLength(2);
    expect(new Set(outcome.constraints.map(({ constraintId }) => constraintId)).size).toBe(2);
  });

  it('uses stable constraint ordering independent of trigger order', () => {
    const triggers: readonly DiscomfortMovementTrigger[] = [
      { kind: 'movement_pattern', movementPattern: 'pressing' },
      { kind: 'movement_pattern', movementPattern: 'deep_flexion' },
    ];
    const forward = adapt(eventWith(resolvedObservation(1, { movementTriggers: triggers })));
    const reverse = adapt(
      eventWith(resolvedObservation(1, { movementTriggers: [...triggers].reverse() })),
    );

    expect(forward.constraints).toEqual(reverse.constraints);
  });

  it('preserves source event and observation evidence', () => {
    const outcome = adapt(eventWith(resolvedObservation(1)));

    expect(outcome.eventId).toBe(eventId);
    expect(outcome.sourceObservationIds).toEqual([
      id('30000000-0000-0000-0000-000000000001', 'pain-event-observation'),
    ]);
    expect(outcome.evidence).toMatchObject({
      severity: 3,
      movementTriggerStatus: 'present',
    });
  });

  it('preserves engine and rule-set versions exactly', () => {
    const outcome = adapt(eventWith(resolvedObservation(1)));

    expect(outcome.version).toEqual({
      engineName: 'deterministic-pain-safety-engine',
      engineVersion: 'pain-safety-engine-v1',
      ruleSetVersion: 'pain-safety-rules-v2',
    });
    expect(outcome.contractVersion).toBe('pain-safety-adaptation-v1');
  });

  it('does not generate a normal adapted constraint set from STOP', () => {
    const outcome = adapt(
      eventWith(resolvedObservation(1, { safety: safety({ instabilityOrGivingWay: 'present' }) })),
    );

    expect(outcome).toMatchObject({
      status: 'training_not_authorized',
      reasonCodes: ['TRAINING_NOT_AUTHORIZED'],
      constraints: [],
    });
  });

  it('preserves explicit STOP evidence and reason codes', () => {
    const outcome = adapt(
      eventWith(resolvedObservation(1, { safety: safety({ instabilityOrGivingWay: 'present' }) })),
    );

    expect(outcome.classificationReasonCodes).toEqual(['INSTABILITY_OR_GIVING_WAY_REPORTED']);
    expect(outcome.evidence.reportedStopSignals).toEqual(['instability_or_giving_way']);
  });

  it('does not mutate event history or classification input', () => {
    const event = eventWith(resolvedObservation(1));
    const evaluation = classified(event);
    const eventBefore = JSON.stringify(event);
    const evaluationBefore = JSON.stringify(evaluation);
    deepFreeze(event);
    deepFreeze(evaluation);

    generate(evaluation);

    expect(JSON.stringify(event)).toBe(eventBefore);
    expect(JSON.stringify(evaluation)).toBe(evaluationBefore);
  });

  it('returns byte-equivalent output for identical input', () => {
    const evaluation = classified(eventWith(resolvedObservation(1)));

    expect(JSON.stringify(generate(evaluation))).toBe(JSON.stringify(generate(evaluation)));
  });

  it('returns a typed failure for invalid adaptation rules', () => {
    const invalid: PainSafetyAdaptationRuleSet = {
      ...defaultPainSafetyAdaptationRuleSet,
      hardExcludeMovementAtOrAboveSeverity: 0,
      reducedMovementMaximumWorkingSets: -1,
    };
    const result = generatePainSafetyAdaptation(
      classified(eventWith(resolvedObservation(1))),
      invalid,
    );

    expect(result).toMatchObject({
      ok: false,
      failure: {
        code: 'INVALID_PAIN_SAFETY_ADAPTATION_RULE_SET',
        reasonCodes: ['invalid_hard_exclusion_severity', 'invalid_reduced_volume_limit'],
      },
    });
  });
});

describe('representative structured adaptation outcomes', () => {
  it('covers knee, shoulder, GREEN, information-required, and STOP flows', () => {
    const knee = adapt(eventWith(resolvedObservation(1)));
    const shoulder = adapt(
      eventWith(
        resolvedObservation(1, {
          bodyArea: 'shoulder',
          side: 'right',
          severity: 2,
          movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'pressing' }],
        }),
      ),
    );
    const green = adapt(
      eventWith(resolvedObservation(1, { severity: 0, movementTriggerStatus: 'absent' })),
    );
    const incomplete = adapt(eventWith(observation(1)));
    const stop = adapt(
      eventWith(resolvedObservation(1, { safety: safety({ instabilityOrGivingWay: 'present' }) })),
    );

    expect(summarize(knee)).toMatchObject({
      status: 'constraints_generated',
      constraintKinds: ['reduce_movement_pattern_priority', 'reduce_volume'],
    });
    expect(knee.sourceObservationIds).toHaveLength(1);
    expect(summarize(shoulder)).toMatchObject({
      status: 'constraints_generated',
      constraintKinds: ['reduce_movement_pattern_priority', 'reduce_volume'],
    });
    expect(summarize(green)).toMatchObject({ status: 'no_adaptation_required', constraints: [] });
    expect(summarize(incomplete)).toMatchObject({
      status: 'information_required',
      constraints: [],
    });
    expect(summarize(stop)).toMatchObject({
      status: 'training_not_authorized',
      classificationReasonCodes: ['INSTABILITY_OR_GIVING_WAY_REPORTED'],
      constraints: [],
    });
  });
});

function adapt(event: DiscomfortEventContract): PainSafetyAdaptationOutcome {
  return generate(classification(event));
}

function classification(event: DiscomfortEventContract): PainSafetyClassificationEvaluation {
  const result = classifyDiscomfortEvent(event, defaultPainSafetyClassificationRuleSet);
  if (!result.ok) {
    throw new Error(`Unexpected classification failure: ${JSON.stringify(result.failure)}`);
  }
  return result.value;
}

function classified(event: DiscomfortEventContract) {
  const evaluation = classification(event);
  if (evaluation.status !== 'classified') {
    throw new Error(`Expected classified result: ${JSON.stringify(evaluation)}`);
  }
  return evaluation;
}

function generate(evaluation: PainSafetyClassificationEvaluation): PainSafetyAdaptationOutcome {
  const result = generatePainSafetyAdaptation(evaluation, defaultPainSafetyAdaptationRuleSet);
  if (!result.ok) {
    throw new Error(`Unexpected adaptation failure: ${JSON.stringify(result.failure)}`);
  }
  return result.value;
}

function summarize(outcome: PainSafetyAdaptationOutcome) {
  return {
    status: outcome.status,
    reasonCodes: outcome.reasonCodes,
    classificationReasonCodes: outcome.classificationReasonCodes,
    constraints: outcome.constraints,
    constraintKinds: outcome.constraints.map(({ kind }) => kind),
    sourceObservationIds: outcome.sourceObservationIds,
  };
}

function questionCodes(
  entries: Extract<
    PainSafetyAdaptationOutcome,
    { readonly status: 'information_required' }
  >['currentQuestionBatch'],
) {
  return entries.map(({ questionCode }) => questionCode);
}

function eventWith(initialObservation: DiscomfortObservation): DiscomfortEventContract {
  return {
    contractVersion: 'pain-safety-input-v1' as ContractVersion,
    eventId,
    subjectId,
    reportedText: 'Reported discomfort.',
    occurredAt: '2026-07-13T08:00:00.000Z',
    observations: [initialObservation],
    requestedTrainingContext: null,
    version: {
      engineName: 'deterministic-pain-safety-engine',
      engineVersion: 'pain-safety-engine-v1' as EngineVersion,
      ruleSetVersion: 'pain-safety-rules-v2' as RuleSetVersion,
    },
    evaluatedAt: '2026-07-14T12:00:00.000Z',
  };
}

function resolvedObservation(
  index: number,
  overrides: Partial<DiscomfortObservation> = {},
): DiscomfortObservation {
  const movementTriggers =
    overrides.movementTriggerStatus === 'absent' && overrides.movementTriggers === undefined
      ? []
      : [{ kind: 'movement_pattern', movementPattern: 'deep_flexion' } as const];
  return observation(index, {
    severity: 3,
    trend: 'unchanged',
    movementTriggerStatus: 'present',
    movementTriggers,
    safety: absentSafety(),
    ...overrides,
  });
}

function observation(
  index: number,
  overrides: Partial<DiscomfortObservation> = {},
): DiscomfortObservation {
  return {
    observationId: id(
      `30000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
      'pain-event-observation',
    ),
    eventId,
    subjectId,
    kind: 'initial',
    observedAt: `2026-07-14T${String(9 + index).padStart(2, '0')}:00:00.000Z`,
    bodyArea: 'knee',
    side: 'left',
    severity: null,
    onsetPattern: 'unknown',
    activityContext: 'unknown',
    trend: 'unknown',
    movementTriggerStatus: 'unknown',
    movementTriggers: [],
    safety: safety(),
    ...overrides,
  };
}

function absentSafety(): DiscomfortSafetyObservations {
  return safety({
    traumaticOrSuddenOnset: 'absent',
    swelling: 'absent',
    instabilityOrGivingWay: 'absent',
    weightBearingLimitation: 'absent',
    visibleDeformity: 'absent',
    numbnessOrWeakness: 'absent',
    chestPainOrBreathingDifficulty: 'absent',
    fainting: 'absent',
    severeSystemicSymptoms: 'absent',
  });
}

function safety(
  overrides: Partial<DiscomfortSafetyObservations> = {},
): DiscomfortSafetyObservations {
  return {
    traumaticOrSuddenOnset: 'unknown',
    swelling: 'unknown',
    instabilityOrGivingWay: 'unknown',
    weightBearingLimitation: 'unknown',
    visibleDeformity: 'unknown',
    numbnessOrWeakness: 'unknown',
    chestPainOrBreathingDifficulty: 'unknown',
    fainting: 'unknown',
    severeSystemicSymptoms: 'unknown',
    ...overrides,
  };
}

function id<EntityName extends string>(
  value: string,
  entityName: EntityName,
): DomainId<EntityName> {
  if (entityName.length === 0) {
    throw new Error('Fixture entity name is required.');
  }
  return value as DomainId<EntityName>;
}

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return;
  }
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
}
