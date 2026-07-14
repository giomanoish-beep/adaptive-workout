import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import {
  classifyDiscomfortEvent,
  defaultPainSafetyClassificationRuleSet,
  type DiscomfortEventContract,
  type DiscomfortObservation,
  type DiscomfortSafetyObservations,
  type PainSafetyClassificationOutput,
  type PainSafetyClassificationEvaluation,
  type PainSafetyClassificationRuleSet,
  type PainSafetyInformationRequiredOutput,
  type PainSafetySubjectId,
} from './index.js';

const subjectId = id('10000000-0000-0000-0000-000000000001', 'user') as PainSafetySubjectId;
const eventId = id('20000000-0000-0000-0000-000000000001', 'pain-event');

describe('deterministic pain-safety classification', () => {
  it('returns information required, without a classification, for vague knee discomfort', () => {
    const output = evaluate(eventWith(observation(1)), defaultPainSafetyClassificationRuleSet);

    expect(output).toMatchObject({
      status: 'information_required',
      reasonCodes: ['REQUIRED_INFORMATION_UNAVAILABLE'],
    });
    expect('classification' in output).toBe(false);
    expect(questionCodes(output.missingInformation)).toHaveLength(10);
    expect(questionCodes(output.currentQuestionBatch)).toEqual([
      'severity',
      'traumatic_or_sudden_onset',
      'weight_bearing_limitation',
      'visible_deformity',
      'swelling',
    ]);
  });

  it('keeps UNKNOWN warning signals unresolved instead of treating them as ABSENT', () => {
    const unknown = informationRequired(eventWith(observation(1)));
    const absent = classified(
      eventWith(resolvedObservation(1, { severity: 0, movementTriggerStatus: 'absent' })),
      defaultPainSafetyClassificationRuleSet,
    );

    expect(unknown.status).toBe('information_required');
    expect(unknown.reasonCodes).toContain('REQUIRED_INFORMATION_UNAVAILABLE');
    expect(absent.classification).toBe('GREEN');
  });

  it('preserves explicitly absent safety evidence', () => {
    const output = classifyResolved();

    expect(output.evidence.safety).toEqual(absentSafety());
    expect(output.evidence.reportedStopSignals).toEqual([]);
  });

  it.each([
    ['traumaticOrSuddenOnset', 'TRAUMATIC_OR_SUDDEN_ONSET_REPORTED', 'traumatic_or_sudden_onset'],
    ['visibleDeformity', 'VISIBLE_DEFORMITY_REPORTED', 'visible_deformity'],
    [
      'weightBearingLimitation',
      'MAJOR_WEIGHT_BEARING_LIMITATION_REPORTED',
      'major_weight_bearing_limitation',
    ],
    ['instabilityOrGivingWay', 'INSTABILITY_OR_GIVING_WAY_REPORTED', 'instability_or_giving_way'],
    ['numbnessOrWeakness', 'NUMBNESS_OR_WEAKNESS_REPORTED', 'numbness_or_weakness'],
    ['swelling', 'SIGNIFICANT_SWELLING_REPORTED', 'significant_swelling'],
  ] as const)('classifies reported %s as STOP', (field, reasonCode, signalCode) => {
    const output = classifyResolved({ safety: safety({ [field]: 'present' }) });

    expect(output.classification).toBe('STOP');
    expect(output.reasonCodes).toEqual([reasonCode]);
    expect(output.evidence.reportedStopSignals).toEqual([signalCode]);
  });

  it.each(['chestPainOrBreathingDifficulty', 'fainting', 'severeSystemicSymptoms'] as const)(
    'classifies reported systemic signal %s as STOP',
    (field) => {
      const output = classifyResolved({ safety: safety({ [field]: 'present' }) });

      expect(output.classification).toBe('STOP');
      expect(output.reasonCodes).toEqual(['SYSTEMIC_WARNING_SIGNAL_REPORTED']);
      expect(output.evidence.reportedStopSignals).toEqual(['systemic_warning_signal']);
    },
  );

  it('orders multiple STOP signals by configured priority', () => {
    const output = classifyResolved({
      safety: safety({
        swelling: 'present',
        instabilityOrGivingWay: 'present',
        visibleDeformity: 'present',
      }),
    });

    expect(output.reasonCodes).toEqual([
      'VISIBLE_DEFORMITY_REPORTED',
      'SIGNIFICANT_SWELLING_REPORTED',
      'INSTABILITY_OR_GIVING_WAY_REPORTED',
    ]);
  });

  it('classifies minimal resolved stable discomfort as GREEN', () => {
    const output = classifyResolved({ severity: 1, movementTriggerStatus: 'absent' });

    expect(output.classification).toBe('GREEN');
    expect(output.reasonCodes).toEqual(['NO_RULE_BASED_RESTRICTION_FOUND']);
  });

  it('classifies resolved moderate discomfort as ADAPT without generating constraints', () => {
    const output = classifyResolved({ severity: 3, movementTriggerStatus: 'absent' });

    expect(output.classification).toBe('ADAPT');
    expect(output.reasonCodes).toEqual(['REPORTED_DISCOMFORT_PRESENT']);
    expect(output.constraints).toEqual([]);
  });

  it('keeps severity zero distinct from unknown severity', () => {
    const zero = classifyResolved({ severity: 0, movementTriggerStatus: 'absent' });
    const unknown = informationRequired(
      eventWith(resolvedObservation(1, { severity: null, movementTriggerStatus: 'absent' })),
    );

    expect(zero.classification).toBe('GREEN');
    expect(zero.evidence.severity).toBe(0);
    expect(questionCodes(unknown.missingInformation)).toContain('severity');
  });

  it('preserves movement-trigger evidence in an ADAPT result', () => {
    const trigger = { kind: 'movement_pattern', movementPattern: 'deep_flexion' } as const;
    const output = classifyResolved({
      movementTriggerStatus: 'present',
      movementTriggers: [trigger],
    });

    expect(output.classification).toBe('ADAPT');
    expect(output.reasonCodes).toEqual([
      'REPORTED_DISCOMFORT_PRESENT',
      'MOVEMENT_AGGRAVATION_REPORTED',
    ]);
    expect(output.evidence.movementTriggers).toEqual([trigger]);
  });

  it('preserves symptom trend and applies configured worsening STOP semantics', () => {
    const output = classifyResolved({ trend: 'worsening' });

    expect(output.classification).toBe('STOP');
    expect(output.reasonCodes).toEqual(['WORSENING_REPORTED']);
    expect(output.evidence.trend).toBe('worsening');
  });

  it('uses existing field-wise resolution across follow-up observations', () => {
    const initial = observation(1);
    const followUp = resolvedObservation(2, { kind: 'follow_up', severity: 3 });
    const output = classified(
      { ...eventWith(initial), observations: [initial, followUp] },
      defaultPainSafetyClassificationRuleSet,
    );

    expect(output.classification).toBe('ADAPT');
    expect(output.sourceObservationIds).toEqual([followUp.observationId]);
    expect(output.missingInformation).toEqual([]);
  });

  it('gives STOP evidence precedence over ADAPT evidence', () => {
    const output = classifyResolved({
      severity: 3,
      movementTriggerStatus: 'present',
      movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'deep_flexion' }],
      safety: safety({ instabilityOrGivingWay: 'present' }),
    });

    expect(output.classification).toBe('STOP');
    expect(output.reasonCodes).toEqual(['INSTABILITY_OR_GIVING_WAY_REPORTED']);
  });

  it('does not mutate history and returns byte-equivalent output', () => {
    const event = eventWith(resolvedObservation(1));
    const before = JSON.stringify(event);
    deepFreeze(event);

    const first = classifyDiscomfortEvent(event, defaultPainSafetyClassificationRuleSet);
    const second = classifyDiscomfortEvent(event, defaultPainSafetyClassificationRuleSet);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(event)).toBe(before);
  });

  it('does not depend on safety object property insertion order', () => {
    const ordered = safety({ swelling: 'present', instabilityOrGivingWay: 'present' });
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

    expect(classifyResolved({ safety: reordered })).toEqual(classifyResolved({ safety: ordered }));
  });

  it('propagates existing typed contract failures', () => {
    const result = classifyDiscomfortEvent(
      { ...eventWith(observation(1)), observations: [] },
      defaultPainSafetyClassificationRuleSet,
    );

    expect(result).toMatchObject({ ok: false, failure: { code: 'PAIN_SAFETY_CONTRACT_INVALID' } });
  });

  it('returns a typed failure for an invalid classification rule set', () => {
    const invalid: PainSafetyClassificationRuleSet = {
      ...defaultPainSafetyClassificationRuleSet,
      severeSeverityThreshold: 0,
    };
    const result = classifyDiscomfortEvent(eventWith(resolvedObservation(1)), invalid);

    expect(result).toMatchObject({
      ok: false,
      failure: {
        code: 'INVALID_PAIN_SAFETY_CLASSIFICATION_RULE_SET',
        reasonCodes: ['invalid_severe_severity_threshold', 'invalid_maximum_green_severity'],
      },
    });
  });

  it('honors configured severity thresholds', () => {
    const stricter = {
      ...defaultPainSafetyClassificationRuleSet,
      severeSeverityThreshold: 3,
      maximumGreenSeverity: 0,
    };

    expect(
      classified(eventWith(resolvedObservation(1, { severity: 3 })), stricter).classification,
    ).toBe('STOP');
  });
});

describe('representative structured outcomes', () => {
  it('classifies the resolved left-knee report as ADAPT', () => {
    const output = classifyResolved();

    expect(summary(output)).toEqual({
      status: 'classified',
      classification: 'ADAPT',
      reasonCodes: ['REPORTED_DISCOMFORT_PRESENT', 'MOVEMENT_AGGRAVATION_REPORTED'],
      missingQuestionCodes: [],
      currentQuestionCodes: [],
      evidence: {
        severity: 3,
        trend: 'unchanged',
        movementTriggerStatus: 'present',
        movementPatterns: ['deep_flexion'],
        reportedStopSignals: [],
      },
    });
  });

  it('classifies the same knee report with swelling as STOP', () => {
    expect(summary(classifyResolved({ safety: safety({ swelling: 'present' }) }))).toMatchObject({
      classification: 'STOP',
      reasonCodes: ['SIGNIFICANT_SWELLING_REPORTED'],
      evidence: { reportedStopSignals: ['significant_swelling'] },
    });
  });

  it('classifies the same knee report with instability as STOP', () => {
    expect(
      summary(classifyResolved({ safety: safety({ instabilityOrGivingWay: 'present' }) })),
    ).toMatchObject({
      classification: 'STOP',
      reasonCodes: ['INSTABILITY_OR_GIVING_WAY_REPORTED'],
      evidence: { reportedStopSignals: ['instability_or_giving_way'] },
    });
  });

  it('returns conservative STOP plus progressive questions for a vague knee report', () => {
    expect(summary(evaluate(eventWith(observation(1))))).toMatchObject({
      status: 'information_required',
      reasonCodes: ['REQUIRED_INFORMATION_UNAVAILABLE'],
      currentQuestionCodes: [
        'severity',
        'traumatic_or_sudden_onset',
        'weight_bearing_limitation',
        'visible_deformity',
        'swelling',
      ],
    });
  });

  it('classifies resolved right-shoulder pressing discomfort as ADAPT', () => {
    const output = classifyResolved({
      bodyArea: 'shoulder',
      side: 'right',
      severity: 2,
      movementTriggerStatus: 'present',
      movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'pressing' }],
    });

    expect(summary(output)).toMatchObject({
      classification: 'ADAPT',
      reasonCodes: ['REPORTED_DISCOMFORT_PRESENT', 'MOVEMENT_AGGRAVATION_REPORTED'],
      evidence: { movementPatterns: ['pressing'] },
    });
  });
});

function evaluate(
  event: DiscomfortEventContract,
  ruleSet = defaultPainSafetyClassificationRuleSet,
): PainSafetyClassificationEvaluation {
  const result = classifyDiscomfortEvent(event, ruleSet);
  return outputOf(result);
}

function classifyResolved(overrides: Partial<DiscomfortObservation> = {}) {
  return classified(eventWith(resolvedObservation(1, overrides)));
}

function classified(
  event: DiscomfortEventContract,
  ruleSet = defaultPainSafetyClassificationRuleSet,
): PainSafetyClassificationOutput {
  const output = evaluate(event, ruleSet);
  if (output.status !== 'classified') {
    throw new Error(`Expected classified output: ${JSON.stringify(output)}`);
  }
  return output;
}

function informationRequired(event: DiscomfortEventContract): PainSafetyInformationRequiredOutput {
  const output = evaluate(event);
  if (output.status !== 'information_required') {
    throw new Error(`Expected information-required output: ${JSON.stringify(output)}`);
  }
  return output;
}

function outputOf(
  result: ReturnType<typeof classifyDiscomfortEvent>,
): PainSafetyClassificationEvaluation {
  if (!result.ok) {
    throw new Error(`Unexpected classification failure: ${JSON.stringify(result.failure)}`);
  }
  return result.value;
}

function summary(output: PainSafetyClassificationEvaluation) {
  return {
    status: output.status,
    ...(output.status === 'classified' ? { classification: output.classification } : {}),
    reasonCodes: output.reasonCodes,
    missingQuestionCodes: questionCodes(output.missingInformation),
    currentQuestionCodes: questionCodes(output.currentQuestionBatch),
    evidence: {
      severity: output.evidence.severity,
      trend: output.evidence.trend,
      movementTriggerStatus: output.evidence.movementTriggerStatus,
      movementPatterns: output.evidence.movementTriggers
        .filter((trigger) => trigger.kind === 'movement_pattern')
        .map(({ movementPattern }) => movementPattern),
      reportedStopSignals: output.evidence.reportedStopSignals,
    },
  };
}

function questionCodes(entries: PainSafetyClassificationEvaluation['missingInformation']) {
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
