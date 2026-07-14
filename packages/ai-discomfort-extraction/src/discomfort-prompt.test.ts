import type { AIProviderRequest } from '@adaptive-workout/ai';
import {
  discomfortActivityContexts,
  discomfortBodyAreas,
  discomfortBodySides,
  discomfortMovementPatterns,
  painSafetyTriStateValues,
} from '@adaptive-workout/pain-safety';
import type {
  ContractVersion,
  DomainId,
  ExerciseFamilyId,
  ExerciseId,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import { buildDiscomfortPromptMessages, packageName, parseDiscomfortOutput } from './index';

const contractVersion = 'ai-contract-1' as ContractVersion;
const pressId = '00000000-0000-0000-0000-000000000020' as ExerciseId;
const pressFamilyId = '00000000-0000-0000-0000-000000000030' as ExerciseFamilyId;
const requestId = '00000000-0000-0000-0000-000000000099' as DomainId<'ai-request'>;

function request(text: string): AIProviderRequest<'discomfort_observation_extraction'> {
  return {
    task: 'discomfort_observation_extraction',
    input: {
      task: 'discomfort_observation_extraction',
      contractVersion,
      reportText: text,
      controlledVocabulary: {
        bodyAreas: discomfortBodyAreas,
        bodySides: discomfortBodySides,
        movementPatterns: discomfortMovementPatterns,
        activityContexts: discomfortActivityContexts,
        triStateValues: painSafetyTriStateValues,
        exerciseIds: [pressId],
        exerciseFamilyIds: [pressFamilyId],
      },
      knownEvent: null,
    },
    metadata: {
      requestId,
      requestedAt: '2026-07-14T10:00:00.000Z',
      timeoutMilliseconds: 10_000,
    },
  };
}

const allUnknownSafety = {
  traumaticOrSuddenOnset: 'unknown',
  swelling: 'unknown',
  instabilityOrGivingWay: 'unknown',
  weightBearingLimitation: 'unknown',
  visibleDeformity: 'unknown',
  numbnessOrWeakness: 'unknown',
  chestPainOrBreathingDifficulty: 'unknown',
  fainting: 'unknown',
  severeSystemicSymptoms: 'unknown',
} as const;

function fullOutput(overrides: Record<string, unknown> = {}) {
  return {
    bodyArea: null,
    side: null,
    severity: null,
    onsetPattern: 'unknown',
    activityContext: 'training',
    trend: 'unknown',
    movementTriggerStatus: 'unknown',
    movementTriggers: [],
    safety: allUnknownSafety,
    ...overrides,
  };
}

describe('ai-discomfort-extraction package', () => {
  it('exports the documented package name', () => {
    expect(packageName).toBe('@adaptive-workout/ai-discomfort-extraction');
  });
});

describe('buildDiscomfortPromptMessages', () => {
  it('injects controlled vocabularies and forbids diagnosis', () => {
    const messages = buildDiscomfortPromptMessages(request('Mon genou me fait mal.'));

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
    const systemContent = (messages[0]?.content ?? '').toLowerCase();
    expect(systemContent).toContain('never diagnose');
    expect(systemContent).toContain('unknown');
    expect(systemContent).toContain('absent');
    const userContent = messages[1]?.content ?? '';
    expect(userContent).toContain('knee');
    expect(userContent).toContain('left');
    expect(userContent).toContain('present');
  });

  it('instructs severity 0 vs null distinction', () => {
    const messages = buildDiscomfortPromptMessages(request('anything'));
    const systemContent = (messages[0]?.content ?? '').toLowerCase();
    expect(systemContent).toContain('severity');
    expect(systemContent).toContain('0');
    expect(systemContent).toContain('null');
  });
});

describe('parseDiscomfortOutput — French extraction cases', () => {
  it('case 1: left knee pain since yesterday', () => {
    // "J'ai mal au genou gauche depuis hier."
    const result = parseDiscomfortOutput(
      request('J\u2019ai mal au genou gauche depuis hier.'),
      fullOutput({
        bodyArea: 'knee',
        side: 'left',
        trend: 'unchanged',
      }),
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.output.bodyArea).toBe('knee');
      expect(result.output.side).toBe('left');
      expect(result.output.severity).toBeNull();
      expect(result.output.trend).toBe('unchanged');
    }
  });

  it('case 2: left knee, 3/10, no trauma, no swelling, deep flexion bothers', () => {
    const result = parseDiscomfortOutput(
      request(
        'J\u2019ai mal au genou gauche, 3 sur 10, pas de choc, pas de gonflement. La flexion profonde me gêne.',
      ),
      fullOutput({
        bodyArea: 'knee',
        side: 'left',
        severity: 3,
        movementTriggerStatus: 'present',
        movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'deep_flexion' }],
        safety: {
          ...allUnknownSafety,
          traumaticOrSuddenOnset: 'absent',
          swelling: 'absent',
        },
      }),
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.output.severity).toBe(3);
      expect(result.output.movementTriggerStatus).toBe('present');
      expect(result.output.movementTriggers).toEqual([
        { kind: 'movement_pattern', movementPattern: 'deep_flexion' },
      ]);
      expect(result.output.safety.traumaticOrSuddenOnset).toBe('absent');
      expect(result.output.safety.swelling).toBe('absent');
    }
  });

  it('case 3: vague knee pain — all unstated safety fields remain unknown', () => {
    // "Mon genou me fait mal." with a minimal model response
    const result = parseDiscomfortOutput(
      request('Mon genou me fait mal.'),
      fullOutput({ bodyArea: 'knee' }),
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.output.bodyArea).toBe('knee');
      expect(result.output.side).toBeNull();
      expect(result.output.severity).toBeNull();
      expect(result.output.onsetPattern).toBe('unknown');
      // Every unstated safety field must remain unknown, never absent.
      for (const value of Object.values(result.output.safety)) {
        expect(value).toBe('unknown');
      }
    }
  });

  it('case 4: right shoulder when pushing, 2/10, not sudden', () => {
    const result = parseDiscomfortOutput(
      request(
        'J\u2019ai une gêne à l\u2019épaule droite quand je pousse, 2 sur 10. Ce n\u2019est pas arrivé brutalement.',
      ),
      fullOutput({
        bodyArea: 'shoulder',
        side: 'right',
        severity: 2,
        movementTriggerStatus: 'present',
        movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'pressing' }],
        safety: { ...allUnknownSafety, traumaticOrSuddenOnset: 'absent' },
      }),
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.output.bodyArea).toBe('shoulder');
      expect(result.output.side).toBe('right');
      expect(result.output.severity).toBe(2);
      expect(result.output.safety.traumaticOrSuddenOnset).toBe('absent');
    }
  });

  it('case 5: knee is swollen and sometimes gives way', () => {
    const result = parseDiscomfortOutput(
      request('Mon genou est gonflé et il lâche parfois.'),
      fullOutput({
        bodyArea: 'knee',
        safety: {
          ...allUnknownSafety,
          swelling: 'present',
          instabilityOrGivingWay: 'present',
        },
      }),
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.output.safety.swelling).toBe('present');
      expect(result.output.safety.instabilityOrGivingWay).toBe('present');
      // Unstated fields stay unknown.
      expect(result.output.safety.visibleDeformity).toBe('unknown');
      expect(result.output.safety.numbnessOrWeakness).toBe('unknown');
    }
  });
});

describe('parseDiscomfortOutput — safety and severity semantics', () => {
  it('keeps severity 0 as observed zero, not unknown', () => {
    const result = parseDiscomfortOutput(
      request('no pain, severity zero'),
      fullOutput({ severity: 0 }),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.output.severity).toBe(0);
  });

  it('keeps severity null as unknown', () => {
    const result = parseDiscomfortOutput(request('knee pain'), fullOutput({ severity: null }));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.output.severity).toBeNull();
  });

  it('rejects severity above 10', () => {
    const result = parseDiscomfortOutput(request('knee'), fullOutput({ severity: 11 }));
    expect(result.status).toBe('failure');
  });

  it('keeps explicit absent as absent (does not downgrade to unknown)', () => {
    const result = parseDiscomfortOutput(
      request('knee'),
      fullOutput({ safety: { ...allUnknownSafety, swelling: 'absent' } }),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.output.safety.swelling).toBe('absent');
  });

  it('rejects a safety field that omits swelling entirely', () => {
    const safety = Object.fromEntries(
      Object.entries(allUnknownSafety).filter(([field]) => field !== 'swelling'),
    );
    const result = parseDiscomfortOutput(request('knee'), fullOutput({ safety }));
    expect(result.status).toBe('failure');
  });

  it('rejects an unsupported tri-state value', () => {
    const result = parseDiscomfortOutput(
      request('knee'),
      fullOutput({ safety: { ...allUnknownSafety, swelling: 'maybe' } }),
    );
    expect(result.status).toBe('failure');
  });
});

describe('parseDiscomfortOutput — vocabulary and diagnosis rejection', () => {
  it('rejects an unsupported body area', () => {
    const result = parseDiscomfortOutput(
      request('whole body'),
      fullOutput({ bodyArea: 'whole_body' }),
    );
    expect(result.status).toBe('failure');
  });

  it('rejects an unsupported movement pattern in a trigger', () => {
    const result = parseDiscomfortOutput(
      request('knee'),
      fullOutput({
        movementTriggerStatus: 'present',
        movementTriggers: [{ kind: 'movement_pattern', movementPattern: 'jumping' }],
      }),
    );
    expect(result.status).toBe('failure');
  });

  it('rejects a diagnosis-shaped field', () => {
    const result = parseDiscomfortOutput(
      request('knee'),
      fullOutput({ diagnosis: 'meniscus_tear' }),
    );
    expect(result.status).toBe('failure');
  });

  it('rejects an invented medical condition in a treatment field', () => {
    const result = parseDiscomfortOutput(
      request('knee'),
      fullOutput({ condition: 'tendinopathy', treatment: 'rest_and_ice' }),
    );
    expect(result.status).toBe('failure');
  });

  it('rejects a classification field (GREEN/ADAPT/STOP must not be produced)', () => {
    const result = parseDiscomfortOutput(request('knee'), fullOutput({ classification: 'ADAPT' }));
    expect(result.status).toBe('failure');
  });
});

describe('parseDiscomfortOutput — malformed output', () => {
  it('fails on non-JSON string content', () => {
    expect(parseDiscomfortOutput(request('knee'), 'not-json').status).toBe('failure');
  });

  it('fails on null content', () => {
    expect(parseDiscomfortOutput(request('knee'), null).status).toBe('failure');
  });

  it('fails on array content', () => {
    expect(parseDiscomfortOutput(request('knee'), ['knee']).status).toBe('failure');
  });

  it('accepts a JSON string payload', () => {
    const result = parseDiscomfortOutput(
      request('knee'),
      JSON.stringify(fullOutput({ bodyArea: 'knee' })),
    );
    expect(result.status).toBe('ok');
  });
});
