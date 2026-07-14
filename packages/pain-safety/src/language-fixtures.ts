import { parseVersionIdentifier, type ContractVersion } from '@adaptive-workout/domain';
import type {
  PainSafetyClassificationEvaluation,
  PainSafetyClassificationReasonCode,
  PainSafetyInformationRequiredReasonCode,
} from './contracts.js';
import type {
  PainSafetyAdaptationOutcome,
  PainSafetyAdaptationOutcomeReasonCode,
} from './adaptation.js';
import type { PainSafetyFollowUpEvaluation, PainSafetyFollowUpReasonCode } from './follow-up.js';

export const painSafetyLanguageFixtureCodes = [
  'information_required',
  'green',
  'adapt',
  'stop',
  'follow_up_improving',
  'follow_up_unchanged',
  'follow_up_worsening',
  'follow_up_resolved',
  'recurrence',
] as const;
export type PainSafetyLanguageFixtureCode = (typeof painSafetyLanguageFixtureCodes)[number];

export type PainSafetyLanguageReasonCode =
  | PainSafetyClassificationReasonCode
  | PainSafetyInformationRequiredReasonCode
  | PainSafetyAdaptationOutcomeReasonCode
  | PainSafetyFollowUpReasonCode;

export interface PainSafetyLanguageFixture {
  readonly fixtureCode: PainSafetyLanguageFixtureCode;
  readonly contractVersion: ContractVersion;
  readonly message: string;
  readonly supportedReasonCodes: readonly PainSafetyLanguageReasonCode[];
}

export type PainSafetyLanguageContext =
  | {
      readonly kind: 'classification';
      readonly evaluation: PainSafetyClassificationEvaluation;
    }
  | { readonly kind: 'adaptation'; readonly outcome: PainSafetyAdaptationOutcome }
  | { readonly kind: 'follow_up'; readonly evaluation: PainSafetyFollowUpEvaluation };

export interface PainSafetyLanguageSelection {
  readonly contractVersion: ContractVersion;
  readonly fixture: PainSafetyLanguageFixture;
  readonly sourceReasonCodes: readonly PainSafetyLanguageReasonCode[];
}

export const painSafetyLanguageFixtureValidationCodes = [
  'empty_fixture_set',
  'duplicate_fixture_code',
  'invalid_contract_version',
  'invalid_message',
  'duplicate_reason_code',
  'unsupported_reason_code',
  'diagnostic_terminology',
  'unsafe_assurance',
  'treatment_recommendation',
  'missing_required_terminology',
] as const;
export type PainSafetyLanguageFixtureValidationCode =
  (typeof painSafetyLanguageFixtureValidationCodes)[number];

export interface PainSafetyLanguageFixtureValidationIssue {
  readonly fixtureCode: PainSafetyLanguageFixtureCode | null;
  readonly code: PainSafetyLanguageFixtureValidationCode;
}

export type PainSafetyLanguageFixtureValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issues: readonly PainSafetyLanguageFixtureValidationIssue[];
    };

export const painSafetyLanguageContractVersion = 'pain-safety-language-v1' as ContractVersion;

export const painSafetyLanguageFixtures: readonly PainSafetyLanguageFixture[] = [
  fixture(
    'information_required',
    'More reported information is needed before a training decision can be completed.',
    [
      'REQUIRED_INFORMATION_UNAVAILABLE',
      'INFORMATION_REQUIRED',
      'FOLLOW_UP_INFORMATION_UNRESOLVED',
    ],
  ),
  fixture('green', 'No rule-based training restriction was found from the reported information.', [
    'NO_RULE_BASED_RESTRICTION_FOUND',
    'NO_ADAPTATION_REQUIRED',
  ]),
  fixture('adapt', 'The reported discomfort supports reviewing the listed training constraints.', [
    'REPORTED_DISCOMFORT_PRESENT',
    'MOVEMENT_AGGRAVATION_REPORTED',
    'ADAPTATION_CONSTRAINTS_GENERATED',
    'NO_SUPPORTED_REPORTED_TRIGGER',
  ]),
  fixture(
    'stop',
    'A reported warning signal means the affected training request should not continue. Consider seeking qualified medical care.',
    [
      'TRAUMATIC_OR_SUDDEN_ONSET_REPORTED',
      'MAJOR_WEIGHT_BEARING_LIMITATION_REPORTED',
      'VISIBLE_DEFORMITY_REPORTED',
      'SIGNIFICANT_SWELLING_REPORTED',
      'INSTABILITY_OR_GIVING_WAY_REPORTED',
      'NUMBNESS_OR_WEAKNESS_REPORTED',
      'SYSTEMIC_WARNING_SIGNAL_REPORTED',
      'SEVERE_REPORTED_DISCOMFORT',
      'WORSENING_REPORTED',
      'TRAINING_NOT_AUTHORIZED',
    ],
  ),
  fixture(
    'follow_up_improving',
    'The latest reported discomfort is improving. Review existing training constraints before changing them.',
    ['MATERIAL_SEVERITY_DECREASE_REPORTED', 'IMPROVING_TREND_REPORTED'],
  ),
  fixture(
    'follow_up_unchanged',
    'The latest reported discomfort is unchanged. Keep existing training constraints under review.',
    ['STABLE_SEVERITY_REPORTED', 'UNCHANGED_TREND_REPORTED'],
  ),
  fixture(
    'follow_up_worsening',
    'The latest reported discomfort is worsening. Reassessment is required before relying on prior training decisions.',
    ['MATERIAL_SEVERITY_INCREASE_REPORTED', 'WORSENING_TREND_REPORTED', 'NEW_STOP_SIGNAL_REPORTED'],
  ),
  fixture(
    'follow_up_resolved',
    'The latest report explicitly marks the discomfort as resolved. Reassess before relaxing prior training constraints.',
    ['EXPLICIT_RESOLUTION_REPORTED'],
  ),
  fixture(
    'recurrence',
    'A new reported discomfort event matches the body area and side of a prior resolved event. This is a recurrence signal only.',
    ['RECURRENT_DISCOMFORT_CONTEXT_REPORTED'],
  ),
];

export function selectPainSafetyLanguageFixture(
  context: PainSafetyLanguageContext,
): PainSafetyLanguageSelection {
  const fixtureCode = fixtureCodeForContext(context);
  const selectedFixture = painSafetyLanguageFixtures.find(
    (candidate) => candidate.fixtureCode === fixtureCode,
  )!;
  return {
    contractVersion: painSafetyLanguageContractVersion,
    fixture: selectedFixture,
    sourceReasonCodes: sourceReasonCodes(context),
  };
}

export function validatePainSafetyLanguageFixtures(
  fixtures: readonly PainSafetyLanguageFixture[],
): PainSafetyLanguageFixtureValidationResult {
  const issues: PainSafetyLanguageFixtureValidationIssue[] = [];
  if (fixtures.length === 0) {
    issues.push({ fixtureCode: null, code: 'empty_fixture_set' });
  }
  const seen = new Set<PainSafetyLanguageFixtureCode>();
  fixtures.forEach((candidate) => {
    if (seen.has(candidate.fixtureCode)) {
      issues.push({ fixtureCode: candidate.fixtureCode, code: 'duplicate_fixture_code' });
    }
    seen.add(candidate.fixtureCode);
    if (!parseVersionIdentifier(candidate.contractVersion, 'contract').ok) {
      issues.push({ fixtureCode: candidate.fixtureCode, code: 'invalid_contract_version' });
    }
    if (
      candidate.message !== candidate.message.trim() ||
      candidate.message.length === 0 ||
      candidate.message.length > 500
    ) {
      issues.push({ fixtureCode: candidate.fixtureCode, code: 'invalid_message' });
    }
    if (diagnosticPattern.test(candidate.message)) {
      issues.push({ fixtureCode: candidate.fixtureCode, code: 'diagnostic_terminology' });
    }
    if (unsafeAssurancePattern.test(candidate.message)) {
      issues.push({ fixtureCode: candidate.fixtureCode, code: 'unsafe_assurance' });
    }
    if (treatmentPattern.test(candidate.message)) {
      issues.push({ fixtureCode: candidate.fixtureCode, code: 'treatment_recommendation' });
    }
    if (!hasRequiredTerminology(candidate)) {
      issues.push({ fixtureCode: candidate.fixtureCode, code: 'missing_required_terminology' });
    }
    if (new Set(candidate.supportedReasonCodes).size !== candidate.supportedReasonCodes.length) {
      issues.push({ fixtureCode: candidate.fixtureCode, code: 'duplicate_reason_code' });
    }
    if (candidate.supportedReasonCodes.some((code) => !supportedReasonCodes.has(code))) {
      issues.push({ fixtureCode: candidate.fixtureCode, code: 'unsupported_reason_code' });
    }
  });
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function fixtureCodeForContext(context: PainSafetyLanguageContext): PainSafetyLanguageFixtureCode {
  switch (context.kind) {
    case 'classification':
      if (context.evaluation.status === 'information_required') {
        return 'information_required';
      }
      return context.evaluation.classification.toLowerCase() as 'green' | 'adapt' | 'stop';
    case 'adaptation':
      switch (context.outcome.status) {
        case 'information_required':
          return 'information_required';
        case 'no_adaptation_required':
          return 'green';
        case 'training_not_authorized':
          return 'stop';
        case 'constraints_generated':
        case 'no_constraints_generated':
          return 'adapt';
        default:
          return assertNever(context.outcome);
      }
    case 'follow_up':
      if (context.evaluation.reasonCodes.includes('RECURRENT_DISCOMFORT_CONTEXT_REPORTED')) {
        return 'recurrence';
      }
      switch (context.evaluation.followUpStatus) {
        case 'improving':
          return 'follow_up_improving';
        case 'unchanged':
          return 'follow_up_unchanged';
        case 'worsening':
          return 'follow_up_worsening';
        case 'resolved':
          return 'follow_up_resolved';
        case 'unresolved':
          return 'information_required';
        default:
          return assertNever(context.evaluation.followUpStatus);
      }
  }
}

function sourceReasonCodes(
  context: PainSafetyLanguageContext,
): readonly PainSafetyLanguageReasonCode[] {
  switch (context.kind) {
    case 'classification':
      return [...context.evaluation.reasonCodes];
    case 'adaptation':
      return [
        ...new Set([...context.outcome.classificationReasonCodes, ...context.outcome.reasonCodes]),
      ];
    case 'follow_up':
      return [...context.evaluation.reasonCodes];
  }
}

function fixture(
  fixtureCode: PainSafetyLanguageFixtureCode,
  message: string,
  supportedReasonCodes: readonly PainSafetyLanguageReasonCode[],
): PainSafetyLanguageFixture {
  return {
    fixtureCode,
    contractVersion: painSafetyLanguageContractVersion,
    message,
    supportedReasonCodes,
  };
}

function hasRequiredTerminology(candidate: PainSafetyLanguageFixture): boolean {
  const required = requiredTerminology[candidate.fixtureCode];
  return required.every((term) => candidate.message.toLowerCase().includes(term));
}

const requiredTerminology: Readonly<Record<PainSafetyLanguageFixtureCode, readonly string[]>> = {
  information_required: ['reported information', 'training decision'],
  green: ['no rule-based training restriction', 'reported information'],
  adapt: ['reported discomfort', 'training constraints'],
  stop: ['reported warning signal', 'affected training request', 'qualified medical care'],
  follow_up_improving: ['reported discomfort', 'improving', 'training constraints'],
  follow_up_unchanged: ['reported discomfort', 'unchanged', 'training constraints'],
  follow_up_worsening: ['reported discomfort', 'worsening', 'reassessment'],
  follow_up_resolved: ['explicitly', 'discomfort', 'resolved', 'training constraints'],
  recurrence: ['reported discomfort', 'prior resolved event', 'recurrence signal'],
};

const supportedReasonCodes = new Set<PainSafetyLanguageReasonCode>(
  painSafetyLanguageFixtures.flatMap(({ supportedReasonCodes: codes }) => codes),
);
const diagnosticPattern = /\b(diagnos(?:is|e|ed)|injur(?:y|ed)|torn|tear|tissue damage)\b/i;
const unsafeAssurancePattern = /\b(safe|safety guaranteed|no risk|risk-free)\b/i;
const treatmentPattern = /\b(treat(?:ment|ed)?|therapy|prescrib(?:e|ed|ing))\b/i;

function assertNever(value: never): never {
  throw new Error(`Unexpected controlled value: ${String(value)}`);
}
