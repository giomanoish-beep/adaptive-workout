import type {
  AIAuthoritativeDecision,
  AIDecisionId,
  AIProviderRequest,
  GroundedDecisionExplanationInput,
} from '@adaptive-workout/ai';
import type { ContractVersion, EngineVersion, RuleSetVersion } from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import { buildExplanationPromptMessages, packageName, parseExplanationOutput } from './index';

const contractVersion = 'ai-contract-1' as ContractVersion;
const decisionId = '00000000-0000-0000-0000-000000000001' as AIDecisionId;
const engineVersion = '1.0.0' as EngineVersion;
const ruleSetVersion = 'rules-1' as RuleSetVersion;
const version = { engineName: 'engine', engineVersion, ruleSetVersion };
const decidedAt = '2026-07-14T10:00:00.000Z';

function request(
  decision: AIAuthoritativeDecision,
  locale = 'fr-FR',
  maximumCharacters = 500,
): AIProviderRequest<'grounded_decision_explanation'> {
  const input: GroundedDecisionExplanationInput = {
    task: 'grounded_decision_explanation',
    contractVersion,
    decision,
    locale,
    maximumCharacters,
  };
  return {
    task: 'grounded_decision_explanation',
    input,
    metadata: {
      requestId: '00000000-0000-0000-0000-000000000099' as never,
      requestedAt: decidedAt,
      timeoutMilliseconds: 10_000,
    },
  };
}

function modelOutput(text: string, reasonRefs: readonly string[], evidenceRefs: readonly string[]) {
  return {
    explanationText: text,
    reasonCodeReferences: reasonRefs,
    evidenceIdReferences: evidenceRefs,
  };
}

const workoutSelectionDecision: AIAuthoritativeDecision = {
  kind: 'workout',
  decisionId,
  action: { kind: 'generated_workout', origin: 'generated' },
  reasonCodes: ['TARGET_MUSCLE_COVERAGE', 'HIGH_SCORE', 'EQUIPMENT_AVAILABLE', 'FAMILY_DIVERSITY'],
  evidence: [
    {
      evidenceId: 'exercise:db-bench-press',
      kind: 'exercise',
      fact: 'Dumbbell Bench Press selected.',
    },
    {
      evidenceId: 'rule:chest-relevance',
      kind: 'rule',
      fact: 'Chest is a requested target muscle.',
    },
  ],
  version,
  decidedAt,
};

const workoutExclusionDecision: AIAuthoritativeDecision = {
  kind: 'workout',
  decisionId,
  action: { kind: 'generated_workout', origin: 'generated' },
  reasonCodes: ['REQUIRED_EQUIPMENT_UNAVAILABLE'],
  evidence: [
    {
      evidenceId: 'exercise:db-bench-press',
      kind: 'exercise',
      fact: 'Dumbbell Bench Press excluded.',
    },
    {
      evidenceId: 'constraint:bench-unavailable',
      kind: 'constraint',
      fact: 'Bench is unavailable.',
    },
  ],
  version,
  decidedAt,
};

const progressionIncreaseDecision: AIAuthoritativeDecision = {
  kind: 'progression',
  decisionId,
  action: 'increase_load',
  reasonCodes: ['TARGET_REPS_ACHIEVED', 'TARGET_RIR_ACHIEVED', 'LOAD_INCREMENT_APPLIED'],
  evidence: [
    { evidenceId: 'exposure:latest', kind: 'exposure', fact: '32 kg for 10 reps at RIR 2.' },
    {
      evidenceId: 'rule:smallest-increment',
      kind: 'rule',
      fact: 'Smallest valid increment is 2 kg.',
    },
  ],
  version,
  decidedAt,
};

const progressionMaintainPlateauDecision: AIAuthoritativeDecision = {
  kind: 'progression',
  decisionId,
  action: 'maintain_load',
  reasonCodes: ['PLATEAU_SIGNAL', 'LOAD_MAINTAINED'],
  evidence: [
    {
      evidenceId: 'exposure:window',
      kind: 'exposure',
      fact: 'Repeated stable exposures at 40 kg.',
    },
  ],
  version,
  decidedAt,
};

const progressionSubstitutionReviewDecision: AIAuthoritativeDecision = {
  kind: 'progression',
  decisionId,
  action: 'consider_substitution',
  reasonCodes: ['SUBSTITUTION_REVIEW_SIGNAL', 'REPEATED_HIGH_EFFORT'],
  evidence: [
    { evidenceId: 'exposure:stagnant', kind: 'exposure', fact: 'Stagnant high-effort exposures.' },
  ],
  version,
  decidedAt,
};

const painAdaptDecision: AIAuthoritativeDecision = {
  kind: 'pain_safety',
  decisionId,
  action: 'ADAPT',
  reasonCodes: ['REPORTED_DISCOMFORT_PRESENT', 'MOVEMENT_AGGRAVATION_REPORTED'],
  evidence: [
    {
      evidenceId: 'observation:severity-3',
      kind: 'observation',
      fact: 'Knee severity reported at 3/10.',
    },
    {
      evidenceId: 'observation:deep-flexion',
      kind: 'observation',
      fact: 'Deep flexion aggravates the knee.',
    },
  ],
  version,
  decidedAt,
};

const painStopDecision: AIAuthoritativeDecision = {
  kind: 'pain_safety',
  decisionId,
  action: 'STOP',
  reasonCodes: ['INSTABILITY_OR_GIVING_WAY_REPORTED'],
  evidence: [
    {
      evidenceId: 'observation:giving-way',
      kind: 'observation',
      fact: 'Reported instability/giving way.',
    },
  ],
  version,
  decidedAt,
};

const painInformationRequiredDecision: AIAuthoritativeDecision = {
  kind: 'pain_safety',
  decisionId,
  action: 'information_required',
  reasonCodes: ['REQUIRED_INFORMATION_UNAVAILABLE'],
  evidence: [
    {
      evidenceId: 'observation:incomplete',
      kind: 'observation',
      fact: 'Required safety information unresolved.',
    },
  ],
  version,
  decidedAt,
};

describe('ai-decision-explanation package', () => {
  it('exports the documented package name', () => {
    expect(packageName).toBe('@adaptive-workout/ai-decision-explanation');
  });
});

describe('buildExplanationPromptMessages', () => {
  it('injects the authoritative decision and forbids invention', () => {
    const messages = buildExplanationPromptMessages(request(progressionIncreaseDecision));
    expect(messages).toHaveLength(2);
    const systemContent = (messages[0]?.content ?? '').toLowerCase();
    expect(systemContent).toContain('only');
    expect(systemContent).toContain('never invent');
    expect(systemContent).toContain('stop');
    const userContent = messages[1]?.content ?? '';
    expect(userContent).toContain('increase_load');
    expect(userContent).toContain('TARGET_REPS_ACHIEVED');
    expect(userContent).toContain('fr-FR');
  });
});

describe('parseExplanationOutput — French cases', () => {
  it('case 1: workout selection explained', () => {
    const result = parseExplanationOutput(
      request(workoutSelectionDecision),
      modelOutput(
        'Le Développé Couché avec Haltères a été sélectionné pour sa pertinence pectorale, son score élevé, la disponibilité du matériel et la diversité de famille.',
        ['TARGET_MUSCLE_COVERAGE', 'HIGH_SCORE', 'EQUIPMENT_AVAILABLE', 'FAMILY_DIVERSITY'],
        ['exercise:db-bench-press', 'rule:chest-relevance'],
      ),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.output.explanationText).toContain('Développé Couché');
      expect(result.output.reasonCodeReferences).toHaveLength(4);
    }
  });

  it('case 2: workout exclusion explained', () => {
    const result = parseExplanationOutput(
      request(workoutExclusionDecision),
      modelOutput(
        'Le Développé Couché avec Haltères a été exclu car le banc est indisponible.',
        ['REQUIRED_EQUIPMENT_UNAVAILABLE'],
        ['exercise:db-bench-press', 'constraint:bench-unavailable'],
      ),
    );
    expect(result.status).toBe('ok');
  });

  it('case 3: progression increase explained', () => {
    const result = parseExplanationOutput(
      request(progressionIncreaseDecision),
      modelOutput(
        'Charge passée de 32 kg à 34 kg après des performances répétées dans la fourchette cible avec RIR connu.',
        ['TARGET_REPS_ACHIEVED', 'TARGET_RIR_ACHIEVED', 'LOAD_INCREMENT_APPLIED'],
        ['exposure:latest', 'rule:smallest-increment'],
      ),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.output.explanationText).toContain('32 kg');
      expect(result.output.explanationText).toContain('34 kg');
    }
  });

  it('case 4: progression maintain with plateau signal', () => {
    const result = parseExplanationOutput(
      request(progressionMaintainPlateauDecision),
      modelOutput(
        'Charge maintenue à 40 kg après des expositions répétées stables ; aucune substitution pour le moment.',
        ['PLATEAU_SIGNAL', 'LOAD_MAINTAINED'],
        ['exposure:window'],
      ),
    );
    expect(result.status).toBe('ok');
  });

  it('case 5: progression substitution review (no replacement selected)', () => {
    const result = parseExplanationOutput(
      request(progressionSubstitutionReviewDecision),
      modelOutput(
        'Des expositions stagnantes à forte intensité déclenchent un examen de substitution, sans sélection de remplacement.',
        ['SUBSTITUTION_REVIEW_SIGNAL', 'REPEATED_HIGH_EFFORT'],
        ['exposure:stagnant'],
      ),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.output.explanationText.toLowerCase()).not.toContain('replacement');
    }
  });

  it('case 6: pain-safety ADAPT explained non-diagnostically', () => {
    const result = parseExplanationOutput(
      request(painAdaptDecision),
      modelOutput(
        'Inconfort au genou de sévérité 3 avec aggravation en flexion profonde ; des contraintes génériques de mouvement ont été générées. Envisagez de consulter un professionnel qualifié.',
        ['REPORTED_DISCOMFORT_PRESENT', 'MOVEMENT_AGGRAVATION_REPORTED'],
        ['observation:severity-3', 'observation:deep-flexion'],
      ),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const text = result.output.explanationText.toLowerCase();
      expect(text).not.toContain('diagnos');
      expect(text).not.toContain('injury');
    }
  });

  it('case 7: pain-safety STOP not weakened into permission', () => {
    const result = parseExplanationOutput(
      request(painStopDecision),
      modelOutput(
        "Instabilité ou dérobade signalée : entraînement autoritairement arrêté. Ne pas s'entraîner sur cette zone et envisager de consulter un professionnel qualifié.",
        ['INSTABILITY_OR_GIVING_WAY_REPORTED'],
        ['observation:giving-way'],
      ),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const text = result.output.explanationText.toLowerCase();
      expect(text).not.toContain('safe to train');
      expect(text).not.toContain('vous pouvez continuer');
    }
  });

  it('case 8: information required is not described as STOP', () => {
    const result = parseExplanationOutput(
      request(painInformationRequiredDecision),
      modelOutput(
        'Classification incomplète car des informations de sécurité requises ne sont pas encore résolues. Répondez aux questions pour continuer.',
        ['REQUIRED_INFORMATION_UNAVAILABLE'],
        ['observation:incomplete'],
      ),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      const text = result.output.explanationText.toLowerCase();
      expect(text).not.toContain('arrêt');
      expect(text).toContain('incomplète');
    }
  });
});

describe('parseExplanationOutput — grounding enforcement', () => {
  it('rejects an invented reason code not in the decision', () => {
    const result = parseExplanationOutput(
      request(progressionIncreaseDecision),
      modelOutput('Explained.', ['TARGET_REPS_ACHIEVED', 'INVENTED_REASON'], ['exposure:latest']),
    );
    expect(result.status).toBe('failure');
  });

  it('rejects an unsupported evidence id not in the decision', () => {
    const result = parseExplanationOutput(
      request(progressionIncreaseDecision),
      modelOutput('Explained.', ['TARGET_REPS_ACHIEVED'], ['exposure:latest', 'invented:evidence']),
    );
    expect(result.status).toBe('failure');
  });

  it('rejects over-length explanation text', () => {
    const longText = 'x'.repeat(501);
    const result = parseExplanationOutput(
      request(progressionIncreaseDecision, 'fr-FR', 500),
      modelOutput(longText, ['TARGET_REPS_ACHIEVED'], ['exposure:latest']),
    );
    expect(result.status).toBe('failure');
  });

  it('rejects empty explanation text', () => {
    const result = parseExplanationOutput(
      request(progressionIncreaseDecision),
      modelOutput('', [], []),
    );
    expect(result.status).toBe('failure');
  });

  it('accepts a subset of reason codes and evidence', () => {
    const result = parseExplanationOutput(
      request(progressionIncreaseDecision),
      modelOutput('Explained.', ['TARGET_REPS_ACHIEVED'], ['exposure:latest']),
    );
    expect(result.status).toBe('ok');
  });

  it('rejects a replacement action field in the output', () => {
    const result = parseExplanationOutput(request(progressionIncreaseDecision), {
      ...modelOutput('Explained.', ['TARGET_REPS_ACHIEVED'], ['exposure:latest']),
      action: 'maintain_load',
    });
    // The validator rejects unsupported fields, so an injected action fails.
    expect(result.status).toBe('failure');
  });

  it('rejects a classification field (cannot replace GREEN/ADAPT/STOP)', () => {
    const result = parseExplanationOutput(request(painAdaptDecision), {
      ...modelOutput('Explained.', ['REPORTED_DISCOMFORT_PRESENT'], ['observation:severity-3']),
      classification: 'GREEN',
    });
    expect(result.status).toBe('failure');
  });

  it('rejects a constraints field (cannot alter adaptation constraints)', () => {
    const result = parseExplanationOutput(request(painAdaptDecision), {
      ...modelOutput('Explained.', ['REPORTED_DISCOMFORT_PRESENT'], ['observation:severity-3']),
      constraints: [],
    });
    expect(result.status).toBe('failure');
  });
});

describe('parseExplanationOutput — malformed output', () => {
  it('fails on non-JSON string content', () => {
    expect(parseExplanationOutput(request(painAdaptDecision), 'not-json').status).toBe('failure');
  });

  it('fails on null content', () => {
    expect(parseExplanationOutput(request(painAdaptDecision), null).status).toBe('failure');
  });

  it('fails on array content', () => {
    expect(parseExplanationOutput(request(painAdaptDecision), []).status).toBe('failure');
  });

  it('accepts a JSON string payload', () => {
    const result = parseExplanationOutput(
      request(painAdaptDecision),
      JSON.stringify(
        modelOutput('Explained.', ['REPORTED_DISCOMFORT_PRESENT'], ['observation:severity-3']),
      ),
    );
    expect(result.status).toBe('ok');
  });
});
