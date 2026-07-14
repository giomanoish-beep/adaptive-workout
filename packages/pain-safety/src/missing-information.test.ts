import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import {
  defaultPainSafetyMissingInformationRuleSet,
  evaluateMissingDiscomfortInformation,
  type DiscomfortEventContract,
  type DiscomfortObservation,
  type DiscomfortSafetyObservations,
  type PainSafetyMissingInformationRuleSet,
  type PainSafetySubjectId,
} from './index.js';

const subjectId = id('10000000-0000-0000-0000-000000000001', 'user') as PainSafetySubjectId;
const eventId = id('20000000-0000-0000-0000-000000000001', 'pain-event');

describe('deterministic missing discomfort information evaluation', () => {
  it('returns every unresolved code and a safety-first current batch for a minimal knee report', () => {
    const result = evaluate(eventWith(observation(1)));

    expect(questionCodes(result)).toEqual([
      'severity',
      'traumatic_or_sudden_onset',
      'weight_bearing_limitation',
      'visible_deformity',
      'swelling',
      'instability_or_giving_way',
      'numbness_or_weakness',
      'systemic_warning_signals',
      'symptom_trend',
      'movement_trigger',
    ]);
    expect(currentBatchCodes(result)).toEqual([
      'severity',
      'traumatic_or_sudden_onset',
      'weight_bearing_limitation',
      'visible_deformity',
      'swelling',
    ]);
  });

  it('requests null severity but not reported severity zero', () => {
    expect(questionCodes(evaluate(eventWith(observation(1, { severity: null }))))).toContain(
      'severity',
    );
    expect(questionCodes(evaluate(eventWith(observation(1, { severity: 0 }))))).not.toContain(
      'severity',
    );
  });

  it.each([
    ['traumaticOrSuddenOnset', 'traumatic_or_sudden_onset'],
    ['swelling', 'swelling'],
    ['instabilityOrGivingWay', 'instability_or_giving_way'],
    ['weightBearingLimitation', 'weight_bearing_limitation'],
  ] as const)('requests unknown %s but suppresses explicit absence', (field, questionCode) => {
    const unknown = eventWith(observation(1, { safety: safety({ [field]: 'unknown' }) }));
    const absent = eventWith(observation(1, { safety: safety({ [field]: 'absent' }) }));

    expect(questionCodes(evaluate(unknown))).toContain(questionCode);
    expect(questionCodes(evaluate(absent))).not.toContain(questionCode);
  });

  it('requests unknown movement triggers and suppresses explicit absence', () => {
    const unknown = eventWith(
      observation(1, { movementTriggerStatus: 'unknown', movementTriggers: [] }),
    );
    const absent = eventWith(
      observation(1, { movementTriggerStatus: 'absent', movementTriggers: [] }),
    );

    expect(questionCodes(evaluate(unknown))).toContain('movement_trigger');
    expect(questionCodes(evaluate(absent))).not.toContain('movement_trigger');
  });

  it('returns no questions when every configured field is explicitly answered', () => {
    const event = eventWith(
      observation(1, {
        severity: 0,
        trend: 'unchanged',
        movementTriggerStatus: 'absent',
        safety: safety({
          traumaticOrSuddenOnset: 'absent',
          swelling: 'absent',
          instabilityOrGivingWay: 'absent',
          weightBearingLimitation: 'absent',
          visibleDeformity: 'absent',
          numbnessOrWeakness: 'absent',
          chestPainOrBreathingDifficulty: 'absent',
          fainting: 'absent',
          severeSystemicSymptoms: 'absent',
        }),
      }),
    );

    expect(questionCodes(evaluate(event))).toEqual([]);
    expect(currentBatchCodes(evaluate(event))).toEqual([]);
  });

  it('uses a later explicit follow-up to answer earlier unknown information', () => {
    const initial = observation(1);
    const followUp = observation(2, {
      kind: 'follow_up',
      severity: 3,
      trend: 'unchanged',
      safety: safety({ traumaticOrSuddenOnset: 'absent', swelling: 'absent' }),
    });
    const result = evaluate({ ...eventWith(initial), observations: [initial, followUp] });

    expect(result.resolvedObservation).toMatchObject({
      latestObservationId: followUp.observationId,
      severity: 3,
      trend: 'unchanged',
      safety: { traumaticOrSuddenOnset: 'absent', swelling: 'absent' },
    });
    expect(questionCodes(result)).not.toContain('severity');
    expect(questionCodes(result)).not.toContain('traumatic_or_sudden_onset');
    expect(questionCodes(result)).not.toContain('swelling');
  });

  it('does not let a later unknown erase an earlier explicit answer', () => {
    const initial = observation(1, {
      severity: 3,
      trend: 'unchanged',
      safety: safety({ traumaticOrSuddenOnset: 'absent', swelling: 'absent' }),
    });
    const followUp = observation(2, { kind: 'follow_up' });
    const result = evaluate({ ...eventWith(initial), observations: [initial, followUp] });

    expect(result.resolvedObservation).toMatchObject({
      severity: 3,
      trend: 'unchanged',
      safety: { traumaticOrSuddenOnset: 'absent', swelling: 'absent' },
    });
    expect(result.resolvedObservation.sourceObservationIds).toEqual([
      initial.observationId,
      followUp.observationId,
    ]);
  });

  it('uses priority then canonical question-code order independent of rule array order', () => {
    const questions = [...defaultPainSafetyMissingInformationRuleSet.questions]
      .reverse()
      .map((question) => ({ ...question, priority: 10 }));
    const result = evaluate(eventWith(observation(1)), {
      ...defaultPainSafetyMissingInformationRuleSet,
      questions,
    });

    expect(questionCodes(result)).toEqual([
      'severity',
      'traumatic_or_sudden_onset',
      'swelling',
      'instability_or_giving_way',
      'weight_bearing_limitation',
      'visible_deformity',
      'numbness_or_weakness',
      'systemic_warning_signals',
      'movement_trigger',
      'symptom_trend',
    ]);
  });

  it('is independent of safety-object property insertion order', () => {
    const ordered = safety({ swelling: 'absent', instabilityOrGivingWay: 'present' });
    const reordered: DiscomfortSafetyObservations = {
      severeSystemicSymptoms: ordered.severeSystemicSymptoms,
      fainting: ordered.fainting,
      chestPainOrBreathingDifficulty: ordered.chestPainOrBreathingDifficulty,
      numbnessOrWeakness: ordered.numbnessOrWeakness,
      visibleDeformity: ordered.visibleDeformity,
      weightBearingLimitation: ordered.weightBearingLimitation,
      instabilityOrGivingWay: ordered.instabilityOrGivingWay,
      swelling: ordered.swelling,
      traumaticOrSuddenOnset: ordered.traumaticOrSuddenOnset,
    };

    expect(questionCodes(evaluate(eventWith(observation(1, { safety: ordered }))))).toEqual(
      questionCodes(evaluate(eventWith(observation(1, { safety: reordered })))),
    );
  });

  it('does not mutate historical observations and returns byte-equivalent output', () => {
    const event = eventWith(observation(1));
    const before = JSON.stringify(event);
    deepFreeze(event);

    const first = evaluateMissingDiscomfortInformation(
      event,
      defaultPainSafetyMissingInformationRuleSet,
    );
    const second = evaluateMissingDiscomfortInformation(
      event,
      defaultPainSafetyMissingInformationRuleSet,
    );

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(event)).toBe(before);
  });

  it('returns a typed failure for invalid rule-set configuration', () => {
    const invalid: PainSafetyMissingInformationRuleSet = {
      ...defaultPainSafetyMissingInformationRuleSet,
      questions: [
        defaultPainSafetyMissingInformationRuleSet.questions[0]!,
        defaultPainSafetyMissingInformationRuleSet.questions[0]!,
      ],
    };
    const result = evaluateMissingDiscomfortInformation(eventWith(observation(1)), invalid);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invalid rule-set failure.');
    }
    expect(result.failure).toMatchObject({ code: 'INVALID_MISSING_INFORMATION_RULE_SET' });
  });

  it.each([0, 1.5, 11])('rejects invalid maximum question batch size %s', (maximumQuestions) => {
    const result = evaluateMissingDiscomfortInformation(eventWith(observation(1)), {
      ...defaultPainSafetyMissingInformationRuleSet,
      questionBatch: {
        ...defaultPainSafetyMissingInformationRuleSet.questionBatch,
        maximumQuestions,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invalid question-batch size failure.');
    }
    expect(result.failure.code).toBe('INVALID_MISSING_INFORMATION_RULE_SET');
    expect(result.failure.reasonCodes).toContain('invalid_maximum_questions_per_batch');
  });

  it('rejects an invalid question-batch contract version', () => {
    const result = evaluateMissingDiscomfortInformation(eventWith(observation(1)), {
      ...defaultPainSafetyMissingInformationRuleSet,
      questionBatch: {
        ...defaultPainSafetyMissingInformationRuleSet.questionBatch,
        contractVersion: 'invalid version' as ContractVersion,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invalid question-batch version failure.');
    }
    expect(result.failure.code).toBe('INVALID_MISSING_INFORMATION_RULE_SET');
    expect(result.failure.reasonCodes).toContain('invalid_question_batch_contract_version');
  });

  it('propagates existing typed discomfort-contract failures', () => {
    const invalid = { ...eventWith(observation(1)), observations: [] };
    const result = evaluateMissingDiscomfortInformation(
      invalid,
      defaultPainSafetyMissingInformationRuleSet,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invalid discomfort contract failure.');
    }
    expect(result.failure).toMatchObject({ code: 'PAIN_SAFETY_CONTRACT_INVALID' });
  });
});

describe('representative ordered question-code outputs', () => {
  it('resolves a detailed left-knee report', () => {
    const result = evaluate(
      eventWith(
        observation(1, {
          severity: 3,
          safety: safety({
            traumaticOrSuddenOnset: 'absent',
            swelling: 'absent',
            instabilityOrGivingWay: 'absent',
          }),
          movementTriggerStatus: 'present',
          movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'deep_flexion' }],
        }),
      ),
    );

    expect(questionCodes(result)).toEqual([
      'weight_bearing_limitation',
      'visible_deformity',
      'numbness_or_weakness',
      'systemic_warning_signals',
      'symptom_trend',
    ]);
  });

  it('resolves a partial right-shoulder pressing report', () => {
    const result = evaluate(
      eventWith(
        observation(1, {
          bodyArea: 'shoulder',
          side: 'right',
          severity: 2,
          safety: safety({ traumaticOrSuddenOnset: 'absent' }),
          movementTriggerStatus: 'present',
          movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'pressing' }],
        }),
      ),
    );

    expect(questionCodes(result)).toEqual([
      'weight_bearing_limitation',
      'visible_deformity',
      'swelling',
      'instability_or_giving_way',
      'numbness_or_weakness',
      'systemic_warning_signals',
      'symptom_trend',
    ]);
  });

  it('keeps reported swelling and instability answered while severity remains missing', () => {
    const result = evaluate(
      eventWith(
        observation(1, {
          safety: safety({ swelling: 'present', instabilityOrGivingWay: 'present' }),
        }),
      ),
    );

    expect(questionCodes(result)).toEqual([
      'severity',
      'traumatic_or_sudden_onset',
      'weight_bearing_limitation',
      'visible_deformity',
      'numbness_or_weakness',
      'systemic_warning_signals',
      'symptom_trend',
      'movement_trigger',
    ]);
  });
});

describe('progressive question batches', () => {
  it('returns the exact initial and follow-up batches without hidden state', () => {
    const initial = observation(1);
    const initialResult = evaluate(eventWith(initial));

    expect(currentBatchCodes(initialResult)).toEqual([
      'severity',
      'traumatic_or_sudden_onset',
      'weight_bearing_limitation',
      'visible_deformity',
      'swelling',
    ]);
    expect(questionCodes(initialResult)).toHaveLength(10);

    const firstFollowUp = observation(2, {
      kind: 'follow_up',
      severity: 3,
      safety: safety({
        traumaticOrSuddenOnset: 'absent',
        weightBearingLimitation: 'absent',
        visibleDeformity: 'absent',
        swelling: 'absent',
      }),
    });
    const firstFollowUpResult = evaluate({
      ...eventWith(initial),
      observations: [initial, firstFollowUp],
    });

    expect(currentBatchCodes(firstFollowUpResult)).toEqual([
      'instability_or_giving_way',
      'numbness_or_weakness',
      'systemic_warning_signals',
      'symptom_trend',
      'movement_trigger',
    ]);
    expect(questionCodes(firstFollowUpResult)).toEqual(currentBatchCodes(firstFollowUpResult));

    const secondFollowUp = observation(3, {
      kind: 'follow_up',
      safety: safety({
        instabilityOrGivingWay: 'absent',
        numbnessOrWeakness: 'absent',
        chestPainOrBreathingDifficulty: 'absent',
        fainting: 'absent',
        severeSystemicSymptoms: 'absent',
      }),
    });
    const secondFollowUpResult = evaluate({
      ...eventWith(initial),
      observations: [initial, firstFollowUp, secondFollowUp],
    });

    expect(currentBatchCodes(secondFollowUpResult)).toEqual(['symptom_trend', 'movement_trigger']);
    expect(questionCodes(secondFollowUpResult)).toEqual(['symptom_trend', 'movement_trigger']);
  });

  it('keeps every current question within unresolved information without duplicates', () => {
    const result = evaluate(eventWith(observation(1)));
    const unresolved = new Set(questionCodes(result));
    const current = currentBatchCodes(result);

    expect(current.every((questionCode) => unresolved.has(questionCode))).toBe(true);
    expect(new Set(current).size).toBe(current.length);
  });

  it('changes only batch selection when the configured maximum changes', () => {
    const event = eventWith(observation(1, { severity: 0 }));
    const defaultResult = evaluate(event);
    const smallerResult = evaluate(event, {
      ...defaultPainSafetyMissingInformationRuleSet,
      questionBatch: {
        ...defaultPainSafetyMissingInformationRuleSet.questionBatch,
        maximumQuestions: 2,
      },
    });

    expect(questionCodes(smallerResult)).toEqual(questionCodes(defaultResult));
    expect(smallerResult.resolvedObservation).toEqual(defaultResult.resolvedObservation);
    expect(currentBatchCodes(smallerResult)).toEqual([
      'traumatic_or_sudden_onset',
      'weight_bearing_limitation',
    ]);
  });
});

function evaluate(
  event: DiscomfortEventContract,
  ruleSet = defaultPainSafetyMissingInformationRuleSet,
) {
  const result = evaluateMissingDiscomfortInformation(event, ruleSet);
  if (!result.ok) {
    throw new Error(`Unexpected evaluation failure: ${JSON.stringify(result.failure)}`);
  }
  return result.value;
}

function questionCodes(result: ReturnType<typeof evaluate>) {
  return result.missingInformation.map(({ questionCode }) => questionCode);
}

function currentBatchCodes(result: ReturnType<typeof evaluate>) {
  return result.currentQuestionBatch.map(({ questionCode }) => questionCode);
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
