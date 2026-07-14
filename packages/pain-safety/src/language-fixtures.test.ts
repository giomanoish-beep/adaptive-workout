import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import {
  painSafetyLanguageFixtureCodes,
  painSafetyLanguageFixtures,
  selectPainSafetyLanguageFixture,
  validatePainSafetyLanguageFixtures,
  type DiscomfortObservationId,
  type DiscomfortSafetyObservations,
  type PainSafetyAdaptationOutcome,
  type PainSafetyClassification,
  type PainSafetyClassificationEvaluation,
  type PainSafetyClassificationReasonCode,
  type PainSafetyFollowUpEvaluation,
  type PainSafetyFollowUpReasonCode,
  type PainSafetyFollowUpStatus,
  type PainSafetyLanguageFixture,
  type PainSafetySubjectId,
} from './index.js';

const subjectId = id('10000000-0000-0000-0000-000000000001', 'user') as PainSafetySubjectId;
const eventId = id('20000000-0000-0000-0000-000000000001', 'pain-event');
const observationId = id(
  '30000000-0000-0000-0000-000000000001',
  'pain-event-observation',
) as DiscomfortObservationId;

describe('reviewed non-diagnostic language fixtures', () => {
  it('validates the complete canonical fixture set', () => {
    expect(validatePainSafetyLanguageFixtures(painSafetyLanguageFixtures)).toEqual({ ok: true });
    expect(painSafetyLanguageFixtures.map(({ fixtureCode }) => fixtureCode)).toEqual(
      painSafetyLanguageFixtureCodes,
    );
  });

  it('rejects duplicate fixture codes and reason codes', () => {
    const duplicateReason: PainSafetyLanguageFixture = {
      ...painSafetyLanguageFixtures[0]!,
      supportedReasonCodes: ['INFORMATION_REQUIRED', 'INFORMATION_REQUIRED'],
    };
    const result = validatePainSafetyLanguageFixtures([
      duplicateReason,
      painSafetyLanguageFixtures[0]!,
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected duplicate fixture validation failure.');
    }
    expect(result.issues).toContainEqual({
      fixtureCode: 'information_required',
      code: 'duplicate_fixture_code',
    });
    expect(result.issues).toContainEqual({
      fixtureCode: 'information_required',
      code: 'duplicate_reason_code',
    });
  });

  it.each([
    ['A diagnosis explains the reported discomfort.', 'diagnostic_terminology'],
    ['This activity is safe and has no risk.', 'unsafe_assurance'],
    ['Treatment or therapy is recommended.', 'treatment_recommendation'],
  ] as const)('rejects prohibited message: %s', (message, expectedCode) => {
    const candidate = { ...painSafetyLanguageFixtures[2]!, message };
    const result = validatePainSafetyLanguageFixtures([candidate]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected prohibited-language validation failure.');
    }
    expect(result.issues).toContainEqual({ fixtureCode: 'adapt', code: expectedCode });
  });

  it('rejects invalid versions, messages, and missing required terminology', () => {
    const candidate: PainSafetyLanguageFixture = {
      ...painSafetyLanguageFixtures[2]!,
      contractVersion: 'invalid version' as ContractVersion,
      message: 'Unreviewed text.',
    };
    const result = validatePainSafetyLanguageFixtures([candidate]);

    expect(result).toMatchObject({
      ok: false,
      issues: [
        { fixtureCode: 'adapt', code: 'invalid_contract_version' },
        { fixtureCode: 'adapt', code: 'missing_required_terminology' },
      ],
    });
  });

  it('contains no diagnostic fields or prohibited terminology', () => {
    const serialized = JSON.stringify(painSafetyLanguageFixtures).toLowerCase();

    expect(serialized).not.toContain('diagnosis');
    expect(serialized).not.toContain('injury');
    expect(serialized).not.toContain('tissue damage');
    expect(serialized).not.toContain('treatment');
    expect(serialized).not.toContain('therapy');
  });
});

describe('language selection from existing structured outcomes', () => {
  it('maps vague discomfort information-required output without creating a classification', () => {
    const evaluation = informationRequiredClassification();
    const selection = selectPainSafetyLanguageFixture({ kind: 'classification', evaluation });

    expect(selection.fixture.fixtureCode).toBe('information_required');
    expect(selection.sourceReasonCodes).toEqual(['REQUIRED_INFORMATION_UNAVAILABLE']);
    expect('classification' in evaluation).toBe(false);
  });

  it.each([
    ['GREEN', 'NO_RULE_BASED_RESTRICTION_FOUND', 'green'],
    ['ADAPT', 'MOVEMENT_AGGRAVATION_REPORTED', 'adapt'],
    ['STOP', 'INSTABILITY_OR_GIVING_WAY_REPORTED', 'stop'],
  ] as const)('maps classified %s to %s fixture', (classification, reasonCode, fixtureCode) => {
    const evaluation = classified(classification, [reasonCode]);
    const selection = selectPainSafetyLanguageFixture({ kind: 'classification', evaluation });

    expect(selection.fixture.fixtureCode).toBe(fixtureCode);
    expect(selection.sourceReasonCodes).toEqual([reasonCode]);
  });

  it.each([
    ['information_required', 'information_required'],
    ['no_adaptation_required', 'green'],
    ['constraints_generated', 'adapt'],
    ['no_constraints_generated', 'adapt'],
    ['training_not_authorized', 'stop'],
  ] as const)('maps adaptation %s to %s fixture', (status, fixtureCode) => {
    const outcome = adaptation(status);
    const selection = selectPainSafetyLanguageFixture({ kind: 'adaptation', outcome });

    expect(selection.fixture.fixtureCode).toBe(fixtureCode);
    expect(selection.sourceReasonCodes.length).toBeGreaterThan(0);
  });

  it.each([
    ['improving', 'MATERIAL_SEVERITY_DECREASE_REPORTED', 'follow_up_improving'],
    ['unchanged', 'STABLE_SEVERITY_REPORTED', 'follow_up_unchanged'],
    ['worsening', 'MATERIAL_SEVERITY_INCREASE_REPORTED', 'follow_up_worsening'],
    ['resolved', 'EXPLICIT_RESOLUTION_REPORTED', 'follow_up_resolved'],
    ['unresolved', 'FOLLOW_UP_INFORMATION_UNRESOLVED', 'information_required'],
  ] as const)('maps follow-up %s to %s fixture', (status, reasonCode, fixtureCode) => {
    const evaluation = followUp(status, [reasonCode]);
    const selection = selectPainSafetyLanguageFixture({ kind: 'follow_up', evaluation });

    expect(selection.fixture.fixtureCode).toBe(fixtureCode);
    expect(selection.sourceReasonCodes).toEqual([reasonCode]);
  });

  it('maps recurrent discomfort context without diagnostic interpretation', () => {
    const evaluation = followUp('unresolved', ['RECURRENT_DISCOMFORT_CONTEXT_REPORTED']);
    const selection = selectPainSafetyLanguageFixture({ kind: 'follow_up', evaluation });

    expect(selection.fixture.fixtureCode).toBe('recurrence');
    expect(selection.fixture.message).toContain('recurrence signal only');
  });

  it('does not mutate inputs and returns deterministic serializable output', () => {
    const evaluation = classified('ADAPT', ['MOVEMENT_AGGRAVATION_REPORTED']);
    const before = JSON.stringify(evaluation);
    deepFreeze(evaluation);

    const first = selectPainSafetyLanguageFixture({ kind: 'classification', evaluation });
    const second = selectPainSafetyLanguageFixture({ kind: 'classification', evaluation });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(evaluation)).toBe(before);
  });
});

function classified(
  classification: PainSafetyClassification,
  reasonCodes: readonly PainSafetyClassificationReasonCode[],
): Extract<PainSafetyClassificationEvaluation, { readonly status: 'classified' }> {
  return {
    status: 'classified',
    contractVersion: 'pain-safety-classification-v3' as ContractVersion,
    subjectId,
    eventId,
    sourceObservationIds: [observationId],
    classification,
    reasonCodes,
    missingInformation: [],
    currentQuestionBatch: [],
    evidence: evidence(),
    constraints: [],
    version: version(),
    classifiedAt: '2026-07-14T12:00:00.000Z',
  };
}

function informationRequiredClassification(): Extract<
  PainSafetyClassificationEvaluation,
  { readonly status: 'information_required' }
> {
  const missing = {
    questionCode: 'severity' as const,
    priority: 10,
    expectedAnswerType: 'severity_0_to_10_or_unknown' as const,
    relatedField: 'severity',
  };
  return {
    status: 'information_required',
    contractVersion: 'pain-safety-classification-v3' as ContractVersion,
    subjectId,
    eventId,
    sourceObservationIds: [observationId],
    reasonCodes: ['REQUIRED_INFORMATION_UNAVAILABLE'],
    missingInformation: [missing],
    currentQuestionBatch: [missing],
    evidence: evidence({ severity: null }),
    version: version(),
    evaluatedAt: '2026-07-14T12:00:00.000Z',
  };
}

function adaptation(status: PainSafetyAdaptationOutcome['status']): PainSafetyAdaptationOutcome {
  const base = {
    contractVersion: 'pain-safety-adaptation-v1' as ContractVersion,
    subjectId,
    eventId,
    sourceObservationIds: [observationId],
    evidence: evidence(),
    version: version(),
    evaluatedAt: '2026-07-14T12:00:00.000Z',
  };
  switch (status) {
    case 'information_required':
      return {
        ...base,
        status,
        reasonCodes: ['INFORMATION_REQUIRED'],
        classificationReasonCodes: ['REQUIRED_INFORMATION_UNAVAILABLE'],
        constraints: [],
        missingInformation: [],
        currentQuestionBatch: [],
      };
    case 'no_adaptation_required':
      return {
        ...base,
        status,
        reasonCodes: ['NO_ADAPTATION_REQUIRED'],
        classificationReasonCodes: ['NO_RULE_BASED_RESTRICTION_FOUND'],
        constraints: [],
      };
    case 'constraints_generated':
      return {
        ...base,
        status,
        reasonCodes: ['ADAPTATION_CONSTRAINTS_GENERATED'],
        classificationReasonCodes: ['MOVEMENT_AGGRAVATION_REPORTED'],
        constraints: [
          {
            constraintId: 'adapt_reduce_priority_pressing',
            kind: 'reduce_movement_pattern_priority',
            reasonCode: 'MOVEMENT_AGGRAVATION_REPORTED',
            movementPatterns: ['pressing'],
          },
        ],
      };
    case 'no_constraints_generated':
      return {
        ...base,
        status,
        reasonCodes: ['NO_SUPPORTED_REPORTED_TRIGGER'],
        classificationReasonCodes: ['REPORTED_DISCOMFORT_PRESENT'],
        constraints: [],
      };
    case 'training_not_authorized':
      return {
        ...base,
        status,
        reasonCodes: ['TRAINING_NOT_AUTHORIZED'],
        classificationReasonCodes: ['INSTABILITY_OR_GIVING_WAY_REPORTED'],
        constraints: [],
      };
  }
}

function followUp(
  followUpStatus: PainSafetyFollowUpStatus,
  reasonCodes: readonly PainSafetyFollowUpReasonCode[],
): PainSafetyFollowUpEvaluation {
  return {
    status: 'success',
    contractVersion: 'pain-safety-follow-up-v1' as ContractVersion,
    eventId,
    previousRelevantEventId: reasonCodes.includes('RECURRENT_DISCOMFORT_CONTEXT_REPORTED')
      ? id('20000000-0000-0000-0000-000000000002', 'pain-event')
      : null,
    sourceObservationIds: [observationId],
    followUpStatus,
    reasonCodes,
    severityComparison: { previousSeverity: 3, currentSeverity: 3, change: 0 },
    latestReportedSafety: safety(),
    newlyPresentStopSignals: [],
    reassessmentRequired: followUpStatus === 'worsening',
    adaptationReview: followUpStatus === 'unchanged' ? 'retain' : 'none',
    version: version(),
    evaluatedAt: '2026-07-14T12:00:00.000Z',
  };
}

function evidence(overrides: { readonly severity?: number | null } = {}) {
  return {
    severity: overrides.severity === undefined ? 3 : overrides.severity,
    trend: 'unchanged' as const,
    movementTriggerStatus: 'absent' as const,
    movementTriggers: [],
    safety: safety(),
    reportedStopSignals: [],
  };
}

function safety(): DiscomfortSafetyObservations {
  return {
    traumaticOrSuddenOnset: 'absent',
    swelling: 'absent',
    instabilityOrGivingWay: 'absent',
    weightBearingLimitation: 'absent',
    visibleDeformity: 'absent',
    numbnessOrWeakness: 'absent',
    chestPainOrBreathingDifficulty: 'absent',
    fainting: 'absent',
    severeSystemicSymptoms: 'absent',
  };
}

function version() {
  return {
    engineName: 'deterministic-pain-safety-engine',
    engineVersion: 'pain-safety-engine-v1' as EngineVersion,
    ruleSetVersion: 'pain-safety-rules-v2' as RuleSetVersion,
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
