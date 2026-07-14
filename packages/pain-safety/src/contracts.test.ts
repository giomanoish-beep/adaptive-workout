import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  ExerciseFamilyId,
  ExerciseId,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import {
  painSafetyClassifications,
  painSafetyTriStateValues,
  validateDiscomfortEventContract,
  validatePainSafetyAdaptationConstraint,
  validatePainSafetyClassificationOutput,
  validatePainSafetyInformationRequiredOutput,
  type DiscomfortEventContract,
  type DiscomfortObservation,
  type DiscomfortObservationId,
  type DiscomfortSafetyObservations,
  type PainSafetyAdaptationConstraint,
  type PainSafetyClassification,
  type PainSafetyClassificationOutput,
  type PainSafetyInformationRequiredOutput,
  type PainSafetySubjectId,
} from './index.js';

const subjectId = id('10000000-0000-0000-0000-000000000001', 'user') as PainSafetySubjectId;
const eventId = id('20000000-0000-0000-0000-000000000001', 'pain-event');
const observationId = id(
  '30000000-0000-0000-0000-000000000001',
  'pain-event-observation',
) as DiscomfortObservationId;
const exerciseId = id('40000000-0000-0000-0000-000000000001', 'exercise') as ExerciseId;
const exerciseFamilyId = id(
  '50000000-0000-0000-0000-000000000001',
  'exercise-family',
) as ExerciseFamilyId;

describe('discomfort event and observation contracts', () => {
  it('validates left knee discomfort with severity three and structured triggers', () => {
    const event = eventWith(
      observation({
        bodyArea: 'knee',
        side: 'left',
        severity: 3,
        onsetPattern: 'gradual',
        movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'deep_flexion' }],
        movementTriggerStatus: 'present',
        safety: safety({ traumaticOrSuddenOnset: 'absent', swelling: 'absent' }),
      }),
      'My left knee has hurt since yesterday; deep knee flexion triggers it.',
    );

    expect(validateDiscomfortEventContract(event)).toEqual({ ok: true, value: event });
  });

  it('preserves severity zero and keeps unknown severity as null', () => {
    const zero = eventWith(observation({ severity: 0 }));
    const unknown = eventWith(observation({ severity: null }));

    expect(validateDiscomfortEventContract(zero)).toMatchObject({ ok: true });
    expect(validateDiscomfortEventContract(unknown)).toMatchObject({ ok: true });
    expect(zero.observations[0]?.severity).toBe(0);
    expect(unknown.observations[0]?.severity).toBeNull();
  });

  it('keeps present, absent, and unknown safety observations distinct', () => {
    expect(painSafetyTriStateValues).toEqual(['present', 'absent', 'unknown']);
    const event = eventWith(
      observation({
        safety: safety({
          traumaticOrSuddenOnset: 'present',
          swelling: 'absent',
          instabilityOrGivingWay: 'unknown',
        }),
      }),
    );
    const validated = validateDiscomfortEventContract(event);

    expect(validated).toMatchObject({ ok: true });
    expect(event.observations[0]?.safety).toMatchObject({
      traumaticOrSuddenOnset: 'present',
      swelling: 'absent',
      instabilityOrGivingWay: 'unknown',
    });
    expect(event.observations[0]?.safety.instabilityOrGivingWay).not.toBe('absent');
  });

  it('validates an unknown-detail knee report without filling missing values', () => {
    const event = eventWith(
      observation({
        severity: null,
        onsetPattern: 'unknown',
        activityContext: 'unknown',
        trend: 'unknown',
        movementTriggers: [],
        movementTriggerStatus: 'unknown',
        safety: safety(),
      }),
      'My knee hurts.',
    );

    expect(validateDiscomfortEventContract(event)).toEqual({ ok: true, value: event });
    expect(event.observations[0]).toMatchObject({ severity: null, safety: safety() });
  });

  it('validates right shoulder discomfort during pressing', () => {
    const event = eventWith(
      observation({
        bodyArea: 'shoulder',
        side: 'right',
        severity: 2,
        activityContext: 'training',
        movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'pressing' }],
        movementTriggerStatus: 'present',
        safety: safety({ traumaticOrSuddenOnset: 'absent' }),
      }),
      'My right shoulder is uncomfortable during pressing.',
    );

    expect(validateDiscomfortEventContract(event)).toEqual({ ok: true, value: event });
  });

  it('validates reported swelling and instability without interpreting them', () => {
    const event = eventWith(
      observation({
        safety: safety({ swelling: 'present', instabilityOrGivingWay: 'present' }),
      }),
    );

    expect(validateDiscomfortEventContract(event)).toEqual({ ok: true, value: event });
  });

  it('rejects duplicate observation IDs and malformed chronology', () => {
    const first = observation();
    const duplicate = { ...observation(), observedAt: '2026-07-13T09:00:00.000Z' };
    const event = {
      ...eventWith(first),
      observations: [first, duplicate],
    };
    const result = validateDiscomfortEventContract(event);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invalid duplicate chronology fixture.');
    }
    expect(result.failure.code).toBe('PAIN_SAFETY_CONTRACT_INVALID');
    expect(result.failure.reasonCodes).toContain('duplicate_observation_id');
    expect(result.failure.reasonCodes).toContain('malformed_chronology');
  });

  it.each([
    ['bodyArea', 'not_a_body_area', 'invalid_body_area'],
    ['side', 'somewhere', 'invalid_side'],
    ['severity', 11, 'invalid_severity'],
  ] as const)('rejects invalid %s values', (field, value, reason) => {
    const invalid = observation({ [field]: value });
    const result = validateDiscomfortEventContract(eventWith(invalid));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invalid controlled-value fixture.');
    }
    expect(result.failure.reasonCodes).toContain(reason);
  });

  it('rejects invalid tri-state values without throwing', () => {
    const invalid = observation({
      safety: { ...safety(), swelling: 'not_answered' as 'unknown' },
    });

    expect(() => validateDiscomfortEventContract(eventWith(invalid))).not.toThrow();
    const result = validateDiscomfortEventContract(eventWith(invalid));
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invalid tri-state fixture.');
    }
    expect(result.failure.reasonCodes).toContain('invalid_tri_state');
  });

  it('validates versions and deterministic serialization', () => {
    const event = eventWith(observation());
    const invalid = {
      ...event,
      version: { ...event.version, engineVersion: 'bad version' as EngineVersion },
    };

    const result = validateDiscomfortEventContract(invalid);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invalid version fixture.');
    }
    expect(result.failure.reasonCodes).toContain('invalid_version_contract');
    expect(JSON.stringify(validateDiscomfortEventContract(event))).toBe(
      JSON.stringify(validateDiscomfortEventContract(event)),
    );
  });
});

describe('classification and adaptation contract shapes', () => {
  it.each(painSafetyClassifications)(
    'supports the %s classification contract',
    (classification) => {
      const output = classificationOutput(classification);

      expect(validatePainSafetyClassificationOutput(output)).toEqual({ ok: true, value: output });
    },
  );

  it('supports data-only missing-information entries without evaluation logic', () => {
    const output: PainSafetyClassificationOutput = {
      ...classificationOutput('ADAPT'),
      missingInformation: [
        {
          questionCode: 'severity',
          priority: 10,
          expectedAnswerType: 'severity_0_to_10_or_unknown',
          relatedField: 'severity',
        },
      ],
      currentQuestionBatch: [],
    };

    expect(validatePainSafetyClassificationOutput(output)).toEqual({ ok: true, value: output });
  });

  it('validates an information-required output without a classification', () => {
    const output: PainSafetyInformationRequiredOutput = {
      status: 'information_required',
      contractVersion: 'pain-safety-classification-v3' as ContractVersion,
      subjectId,
      eventId,
      sourceObservationIds: [observationId],
      reasonCodes: ['REQUIRED_INFORMATION_UNAVAILABLE'],
      missingInformation: [
        {
          questionCode: 'severity',
          priority: 10,
          expectedAnswerType: 'severity_0_to_10_or_unknown',
          relatedField: 'severity',
        },
      ],
      currentQuestionBatch: [
        {
          questionCode: 'severity',
          priority: 10,
          expectedAnswerType: 'severity_0_to_10_or_unknown',
          relatedField: 'severity',
        },
      ],
      evidence: {
        severity: null,
        trend: 'unknown',
        movementTriggerStatus: 'unknown',
        movementTriggers: [],
        safety: safety(),
        reportedStopSignals: [],
      },
      version: {
        engineName: 'deterministic-pain-safety-engine',
        engineVersion: 'pain-safety-engine-v1' as EngineVersion,
        ruleSetVersion: 'pain-safety-rules-v2' as RuleSetVersion,
      },
      evaluatedAt: '2026-07-14T12:00:00.000Z',
    };

    expect(validatePainSafetyInformationRequiredOutput(output)).toEqual({
      ok: true,
      value: output,
    });
    expect('classification' in output).toBe(false);
  });

  it('validates serializable package-independent adaptation constraints', () => {
    const constraints: readonly PainSafetyAdaptationConstraint[] = [
      {
        constraintId: 'avoid-deep-flexion',
        kind: 'exclude_movement_pattern',
        reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED',
        movementPatterns: ['deep_flexion'],
      },
      {
        constraintId: 'exclude-reported-exercise',
        kind: 'exclude_exercises',
        reasonCode: 'REPORTED_DISCOMFORT_PRESENT',
        exerciseIds: [exerciseId],
      },
      {
        constraintId: 'exclude-reported-family',
        kind: 'exclude_exercise_families',
        reasonCode: 'REPORTED_DISCOMFORT_PRESENT',
        exerciseFamilyIds: [exerciseFamilyId],
      },
      {
        constraintId: 'reduce-squat-volume',
        kind: 'reduce_volume',
        reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED',
        movementPattern: 'squatting',
        maximumWorkingSets: 2,
      },
      {
        constraintId: 'prefer-hinge-emphasis',
        kind: 'prefer_movement_emphasis',
        reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED',
        movementPatterns: ['hinging'],
      },
    ];

    constraints.forEach((constraint) => {
      expect(validatePainSafetyAdaptationConstraint(constraint)).toEqual({
        ok: true,
        value: constraint,
      });
      expect(() => JSON.stringify(constraint)).not.toThrow();
    });
  });

  it('keeps authoritative output structures non-diagnostic', () => {
    const serialized = JSON.stringify(classificationOutput('STOP')).toLowerCase();

    expect(serialized).not.toContain('diagnosis');
    expect(serialized).not.toContain('injury');
    expect(serialized).not.toContain('treatment');
  });
});

function eventWith(
  initialObservation: DiscomfortObservation,
  reportedText = 'Reported discomfort.',
): DiscomfortEventContract {
  return {
    contractVersion: 'pain-safety-input-v1' as ContractVersion,
    eventId,
    subjectId,
    reportedText,
    occurredAt: '2026-07-13T08:00:00.000Z',
    observations: [initialObservation],
    requestedTrainingContext: {
      kind: 'planned_workout',
      requestedAt: '2026-07-14T10:00:00.000Z',
      movementPatterns: [],
      exerciseIds: [],
      exerciseFamilyIds: [],
    },
    version: {
      engineName: 'deterministic-pain-safety-engine',
      engineVersion: 'pain-safety-engine-v1' as EngineVersion,
      ruleSetVersion: 'pain-safety-rules-v1' as RuleSetVersion,
    },
    evaluatedAt: '2026-07-14T12:00:00.000Z',
  };
}

function observation(overrides: Partial<DiscomfortObservation> = {}): DiscomfortObservation {
  return {
    observationId,
    eventId,
    subjectId,
    kind: 'initial',
    observedAt: '2026-07-14T11:00:00.000Z',
    bodyArea: 'knee',
    side: 'left',
    severity: 3,
    onsetPattern: 'gradual',
    activityContext: 'training',
    trend: 'unchanged',
    movementTriggers: [],
    movementTriggerStatus: 'unknown',
    safety: safety(),
    ...overrides,
  };
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

function classificationOutput(
  classification: PainSafetyClassification,
): PainSafetyClassificationOutput {
  return {
    status: 'classified',
    contractVersion: 'pain-safety-classification-v3' as ContractVersion,
    subjectId,
    eventId,
    sourceObservationIds: [observationId],
    classification,
    reasonCodes:
      classification === 'GREEN'
        ? ['NO_RULE_BASED_RESTRICTION_FOUND']
        : classification === 'ADAPT'
          ? ['REPORTED_DISCOMFORT_PRESENT']
          : ['VISIBLE_DEFORMITY_REPORTED'],
    missingInformation: [],
    currentQuestionBatch: [],
    evidence: {
      severity: 3,
      trend: 'unchanged',
      movementTriggerStatus: 'unknown',
      movementTriggers: [],
      safety: safety(),
      reportedStopSignals: classification === 'STOP' ? ['visible_deformity'] : [],
    },
    constraints: [],
    version: {
      engineName: 'deterministic-pain-safety-engine',
      engineVersion: 'pain-safety-engine-v1' as EngineVersion,
      ruleSetVersion: 'pain-safety-rules-v1' as RuleSetVersion,
    },
    classifiedAt: '2026-07-14T12:00:00.000Z',
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
