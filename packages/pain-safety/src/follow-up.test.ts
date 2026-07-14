import type {
  ContractVersion,
  DomainId,
  EngineVersion,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import {
  defaultPainSafetyFollowUpRuleSet,
  evaluateDiscomfortFollowUp,
  type DiscomfortEventContract,
  type DiscomfortEventId,
  type DiscomfortObservation,
  type DiscomfortSafetyObservations,
  type PainSafetyFollowUpEvaluation,
  type PainSafetyFollowUpRuleSet,
  type PainSafetySubjectId,
} from './index.js';

const subjectId = id('10000000-0000-0000-0000-000000000001', 'user') as PainSafetySubjectId;
const eventId = id('20000000-0000-0000-0000-000000000001', 'pain-event');
const recurrentEventId = id('20000000-0000-0000-0000-000000000002', 'pain-event');

describe('deterministic discomfort follow-up evaluation', () => {
  it('reports improvement for severity 3 to 1 with improving trend', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 1, trend: 'improving' }),
      ]),
    );

    expect(output).toMatchObject({
      followUpStatus: 'improving',
      reasonCodes: ['MATERIAL_SEVERITY_DECREASE_REPORTED', 'IMPROVING_TREND_REPORTED'],
      severityComparison: { previousSeverity: 3, currentSeverity: 1, change: -2 },
      reassessmentRequired: true,
      adaptationReview: 'review_for_relaxation',
    });
  });

  it('reports unchanged for severity 3 to 3 with stable trend', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 3, trend: 'unchanged' }),
      ]),
    );

    expect(output).toMatchObject({
      followUpStatus: 'unchanged',
      reasonCodes: ['STABLE_SEVERITY_REPORTED', 'UNCHANGED_TREND_REPORTED'],
      severityComparison: { change: 0 },
      reassessmentRequired: false,
      adaptationReview: 'retain',
    });
  });

  it('reports worsening for severity 3 to 6', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 6 }),
      ]),
    );

    expect(output).toMatchObject({
      followUpStatus: 'worsening',
      reasonCodes: ['MATERIAL_SEVERITY_INCREASE_REPORTED'],
      severityComparison: { change: 3 },
      reassessmentRequired: true,
      adaptationReview: 'regenerate',
    });
  });

  it('uses explicit worsening trend even when severity is unchanged', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 3, trend: 'worsening' }),
      ]),
    );

    expect(output.followUpStatus).toBe('worsening');
    expect(output.reasonCodes).toEqual(['WORSENING_TREND_REPORTED']);
    expect(output.reassessmentRequired).toBe(true);
  });

  it('requires reassessment when swelling becomes newly present', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, {
          kind: 'follow_up',
          safety: safety({ swelling: 'present' }),
        }),
      ]),
    );

    expect(output.followUpStatus).toBe('worsening');
    expect(output.reasonCodes).toEqual(['NEW_STOP_SIGNAL_REPORTED']);
    expect(output.newlyPresentStopSignals).toEqual(['significant_swelling']);
    expect(output.reassessmentRequired).toBe(true);
  });

  it('preserves UNKNOWN instead of converting it to ABSENT', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        observation(2, eventId, { kind: 'follow_up', trend: 'unchanged' }),
      ]),
    );

    expect(output.latestReportedSafety.swelling).toBe('unknown');
    expect(output.newlyPresentStopSignals).toEqual([]);
  });

  it('does not infer improvement from missing severity', () => {
    const output = followUp(
      eventWith([resolvedObservation(1, eventId), observation(2, eventId, { kind: 'follow_up' })]),
    );

    expect(output.followUpStatus).toBe('unresolved');
    expect(output.severityComparison).toEqual({
      previousSeverity: 3,
      currentSeverity: null,
      change: null,
    });
  });

  it('preserves severity zero as a reported value', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 0, trend: 'improving' }),
      ]),
    );

    expect(output.severityComparison.currentSeverity).toBe(0);
    expect(output.severityComparison.change).toBe(-3);
  });

  it('requires explicit configured evidence for resolved status', () => {
    const output = followUp(eventWith(resolvedEventObservations(eventId)));

    expect(output).toMatchObject({
      followUpStatus: 'resolved',
      reasonCodes: ['EXPLICIT_RESOLUTION_REPORTED'],
      reassessmentRequired: true,
      adaptationReview: 'review_for_relaxation',
    });
  });

  it('does not resolve an event merely because follow-up fields are omitted', () => {
    const output = followUp(
      eventWith([resolvedObservation(1, eventId), observation(2, eventId, { kind: 'follow_up' })]),
    );

    expect(output.followUpStatus).toBe('unresolved');
    expect(output.reasonCodes).toEqual(['FOLLOW_UP_INFORMATION_UNRESOLVED']);
  });

  it('detects recurrent left-knee discomfort after a resolved left-knee event', () => {
    const previous = eventWith(resolvedEventObservations(eventId));
    const current = laterEvent('knee', 'left');
    const output = followUp(current, [previous]);

    expect(output).toMatchObject({
      followUpStatus: 'unresolved',
      reasonCodes: ['RECURRENT_DISCOMFORT_CONTEXT_REPORTED'],
      previousRelevantEventId: eventId,
      reassessmentRequired: true,
      adaptationReview: 'regenerate',
    });
  });

  it('does not match right-knee discomfort to a resolved left-knee event', () => {
    const output = followUp(laterEvent('knee', 'right'), [
      eventWith(resolvedEventObservations(eventId)),
    ]);

    expect(output.previousRelevantEventId).toBeNull();
    expect(output.reasonCodes).not.toContain('RECURRENT_DISCOMFORT_CONTEXT_REPORTED');
  });

  it('does not match an unrelated body area for recurrence', () => {
    const output = followUp(laterEvent('shoulder', 'right'), [
      eventWith(resolvedEventObservations(eventId)),
    ]);

    expect(output.previousRelevantEventId).toBeNull();
  });

  it('keeps recurrence terminology non-diagnostic', () => {
    const output = followUp(laterEvent('knee', 'left'), [
      eventWith(resolvedEventObservations(eventId)),
    ]);
    const serialized = JSON.stringify(output).toLowerCase();

    expect(serialized).toContain('recurrent_discomfort');
    expect(serialized).not.toContain('injury');
    expect(serialized).not.toContain('diagnosis');
  });

  it('requires reclassification for worsening evidence', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 6 }),
      ]),
    );

    expect(output.reassessmentRequired).toBe(true);
  });

  it('does not blindly reuse a prior classification after new STOP evidence', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, {
          kind: 'follow_up',
          safety: safety({ instabilityOrGivingWay: 'present' }),
        }),
      ]),
    );

    expect(output.newlyPresentStopSignals).toEqual(['instability_or_giving_way']);
    expect(output.reassessmentRequired).toBe(true);
    expect(output.adaptationReview).toBe('regenerate');
  });

  it('retains adaptation review for a stable follow-up', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 3 }),
      ]),
    );

    expect(output.adaptationReview).toBe('retain');
  });

  it('reviews adaptation for relaxation after improvement', () => {
    const output = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 1, trend: 'improving' }),
      ]),
    );

    expect(output.adaptationReview).toBe('review_for_relaxation');
  });

  it('does not mutate source events or observations', () => {
    const event = eventWith([
      resolvedObservation(1, eventId),
      resolvedObservation(2, eventId, { kind: 'follow_up', severity: 1, trend: 'improving' }),
    ]);
    const before = JSON.stringify(event);
    deepFreeze(event);

    followUp(event);

    expect(JSON.stringify(event)).toBe(before);
  });

  it('returns byte-equivalent output for identical semantic input', () => {
    const event = eventWith([
      resolvedObservation(1, eventId),
      resolvedObservation(2, eventId, { kind: 'follow_up', severity: 1, trend: 'improving' }),
    ]);

    expect(JSON.stringify(followUp(event))).toBe(JSON.stringify(followUp(event)));
  });

  it('returns a typed failure for an invalid follow-up rule set', () => {
    const invalid: PainSafetyFollowUpRuleSet = {
      ...defaultPainSafetyFollowUpRuleSet,
      materialSeverityChangeThreshold: 0,
      stableSeverityTolerance: -1,
    };
    const result = evaluateDiscomfortFollowUp(
      eventWith(resolvedEventObservations(eventId)),
      [],
      invalid,
    );

    expect(result).toMatchObject({
      ok: false,
      failure: {
        code: 'INVALID_PAIN_SAFETY_FOLLOW_UP_RULE_SET',
        reasonCodes: [
          'invalid_material_severity_change_threshold',
          'invalid_stable_severity_tolerance',
        ],
      },
    });
  });

  it('propagates existing invalid discomfort-contract failures', () => {
    const result = evaluateDiscomfortFollowUp(
      { ...eventWith([resolvedObservation(1, eventId)]), observations: [] },
      [],
      defaultPainSafetyFollowUpRuleSet,
    );

    expect(result).toMatchObject({ ok: false, failure: { code: 'PAIN_SAFETY_CONTRACT_INVALID' } });
  });
});

describe('representative structured follow-up outcomes', () => {
  it('covers improving, unchanged, worsening, warning, resolved, recurrence, and unrelated flows', () => {
    const improving = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 1, trend: 'improving' }),
      ]),
    );
    const unchanged = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 3 }),
      ]),
    );
    const worsening = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, { kind: 'follow_up', severity: 6 }),
      ]),
    );
    const warning = followUp(
      eventWith([
        resolvedObservation(1, eventId),
        resolvedObservation(2, eventId, {
          kind: 'follow_up',
          safety: safety({ swelling: 'present' }),
        }),
      ]),
    );
    const resolved = followUp(eventWith(resolvedEventObservations(eventId)));
    const recurrence = followUp(laterEvent('knee', 'left'), [
      eventWith(resolvedEventObservations(eventId)),
    ]);
    const unrelated = followUp(laterEvent('shoulder', 'right'), [
      eventWith(resolvedEventObservations(eventId)),
    ]);

    expect(summary(improving)).toMatchObject({
      followUpStatus: 'improving',
      reassessmentRequired: true,
      adaptationReview: 'review_for_relaxation',
    });
    expect(summary(unchanged)).toMatchObject({
      followUpStatus: 'unchanged',
      reassessmentRequired: false,
      adaptationReview: 'retain',
    });
    expect(summary(worsening)).toMatchObject({
      followUpStatus: 'worsening',
      reassessmentRequired: true,
    });
    expect(summary(warning)).toMatchObject({
      reasonCodes: ['NEW_STOP_SIGNAL_REPORTED'],
      reassessmentRequired: true,
    });
    expect(summary(resolved)).toMatchObject({ followUpStatus: 'resolved' });
    expect(summary(recurrence)).toMatchObject({
      previousRelevantEventId: eventId,
      reasonCodes: ['RECURRENT_DISCOMFORT_CONTEXT_REPORTED'],
    });
    expect(summary(unrelated)).toMatchObject({
      previousRelevantEventId: null,
      followUpStatus: 'unresolved',
    });
  });
});

function followUp(
  event: DiscomfortEventContract,
  previousEvents: readonly DiscomfortEventContract[] = [],
): PainSafetyFollowUpEvaluation {
  const result = evaluateDiscomfortFollowUp(
    event,
    previousEvents,
    defaultPainSafetyFollowUpRuleSet,
  );
  if (!result.ok) {
    throw new Error(`Unexpected follow-up failure: ${JSON.stringify(result.failure)}`);
  }
  return result.value;
}

function summary(output: PainSafetyFollowUpEvaluation) {
  return {
    followUpStatus: output.followUpStatus,
    reasonCodes: output.reasonCodes,
    reassessmentRequired: output.reassessmentRequired,
    adaptationReview: output.adaptationReview,
    previousRelevantEventId: output.previousRelevantEventId,
  };
}

function eventWith(
  observations: readonly DiscomfortObservation[],
  overrides: Partial<DiscomfortEventContract> = {},
): DiscomfortEventContract {
  return {
    contractVersion: 'pain-safety-input-v1' as ContractVersion,
    eventId,
    subjectId,
    reportedText: 'Reported discomfort.',
    occurredAt: '2026-07-13T08:00:00.000Z',
    observations,
    requestedTrainingContext: null,
    version: {
      engineName: 'deterministic-pain-safety-engine',
      engineVersion: 'pain-safety-engine-v1' as EngineVersion,
      ruleSetVersion: 'pain-safety-rules-v2' as RuleSetVersion,
    },
    evaluatedAt: '2026-07-14T12:00:00.000Z',
    ...overrides,
  };
}

function laterEvent(bodyArea: 'knee' | 'shoulder', side: 'left' | 'right') {
  return eventWith(
    [
      resolvedObservation(3, recurrentEventId, {
        bodyArea,
        side,
        severity: 2,
        observedAt: '2026-07-20T10:00:00.000Z',
      }),
    ],
    {
      eventId: recurrentEventId,
      occurredAt: '2026-07-20T08:00:00.000Z',
      evaluatedAt: '2026-07-20T12:00:00.000Z',
    },
  );
}

function resolvedEventObservations(targetEventId: DiscomfortEventId) {
  return [
    resolvedObservation(1, targetEventId),
    resolvedObservation(2, targetEventId, {
      kind: 'follow_up',
      severity: 0,
      trend: 'resolved',
      movementTriggerStatus: 'absent',
    }),
  ];
}

function resolvedObservation(
  index: number,
  targetEventId: DiscomfortEventId,
  overrides: Partial<DiscomfortObservation> = {},
): DiscomfortObservation {
  const movementTriggers =
    overrides.movementTriggerStatus === 'absent' && overrides.movementTriggers === undefined
      ? []
      : [{ kind: 'movement_pattern', movementPattern: 'deep_flexion' } as const];
  return observation(index, targetEventId, {
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
  targetEventId: DiscomfortEventId,
  overrides: Partial<DiscomfortObservation> = {},
): DiscomfortObservation {
  return {
    observationId: id(
      `30000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
      'pain-event-observation',
    ),
    eventId: targetEventId,
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
