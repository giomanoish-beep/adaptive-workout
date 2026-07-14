import type { ContractVersion } from '@adaptive-workout/domain';
import {
  progressionRecommendationReasonCodes,
  type CompletedProgressionSet,
  type ExerciseExposureId,
  type ProgressionDirectionalTrend,
  type ProgressionDeloadEvidence,
  type ProgressionEngineInput,
  type ProgressionEvidenceAnalysis,
  type ProgressionEvidenceAnalysisResult,
  type ProgressionExposureAnalysis,
  type ProgressionExerciseExposure,
  type ProgressionLoad,
  type ProgressionObservedRange,
  type ProgressionPlateauEvidence,
  type ProgressionRecommendation,
  type ProgressionRecommendationReasonCode,
  type ProgressionResult,
  type ProgressionRirRange,
  type ProgressionRirTargetPosition,
  type ProgressionRuleSet,
  type ProgressionTrendEvidence,
} from './contracts.js';
import { validateProgressionInput } from './validation.js';

export const progressionEvidenceContractVersion = 'progression-evidence-v1' as ContractVersion;
export const progressionRecommendationContractVersion =
  'progression-recommendation-v1' as ContractVersion;

export function analyzeProgressionEvidence(
  input: ProgressionEngineInput,
  ruleSet: ProgressionRuleSet,
): ProgressionEvidenceAnalysisResult {
  const validation = validateProgressionInput(input, ruleSet);
  if (!validation.ok) {
    return validation.failure;
  }

  const windowStart = Math.max(0, input.exposures.length - ruleSet.analysisWindowExposureCount);
  const windowExposures = input.exposures.slice(windowStart);
  const exposures = windowExposures.map((exposure) => analyzeExposure(exposure, input, ruleSet));
  const trendEligible = exposures.filter(
    ({ usableWorkingSetCount, wasDeload }) => usableWorkingSetCount > 0 && !wasDeload,
  );

  return {
    status: 'success',
    contractVersion: progressionEvidenceContractVersion,
    subjectId: input.subjectId,
    exerciseId: input.exerciseId,
    windowExposureCount: windowExposures.length,
    excludedOlderExposureIds: input.exposures
      .slice(0, windowStart)
      .map(({ exposureId }) => exposureId),
    exposures,
    performanceTrend: performanceTrend(trendEligible),
    loadTrend: directionalTrend(
      trendEligible.map(({ representativeLoad }) => representativeLoad?.value ?? null),
    ),
    rirTrend: rirTrend(trendEligible),
    topRangeExposureCount: trendEligible.filter(
      ({ allSetsAtOrAboveTargetMaximum }) => allSetsAtOrAboveTargetMaximum,
    ).length,
    belowRangeExposureCount: trendEligible.filter(
      ({ allSetsBelowTargetMinimum }) => allSetsBelowTargetMinimum,
    ).length,
    deloadExposureIds: exposures
      .filter(({ wasDeload }) => wasDeload)
      .map(({ exposureId }) => exposureId),
    version: input.version,
    ruleSetContractVersion: ruleSet.contractVersion,
    calculatedAt: input.calculatedAt,
  };
}

export function recommendProgression(
  input: ProgressionEngineInput,
  ruleSet: ProgressionRuleSet,
): ProgressionResult {
  const coreRecommendation = recommendCoreProgression(input, ruleSet);
  if (coreRecommendation.status === 'failure') {
    return coreRecommendation;
  }

  const deload = analyzeDeloadEvidence(coreRecommendation.evidence.analysis, ruleSet);
  if (deload.qualifiesForDeloadReview) {
    const reviewExposureIdSet = new Set(deload.reviewExposureIds);
    const reviewExposures = coreRecommendation.evidence.analysis.exposures.filter(
      ({ exposureId }) => reviewExposureIdSet.has(exposureId),
    );
    return recommendation(
      input,
      coreRecommendation.evidence.analysis,
      reviewExposures,
      'review_deload',
      null,
      [
        ...(deload.degradationSignal ? (['PERFORMANCE_DECLINING'] as const) : []),
        ...(deload.highEffortSignal ? (['REPEATED_HIGH_EFFORT'] as const) : []),
        'DELOAD_REVIEW_SIGNAL',
      ],
      undefined,
      deload,
    );
  }

  const recommendationWithDeloadEvidence = {
    ...coreRecommendation,
    evidence: { ...coreRecommendation.evidence, deload },
  };
  if (coreRecommendation.action !== 'maintain_load') {
    return recommendationWithDeloadEvidence;
  }

  const plateau = analyzePlateauEvidence(input, coreRecommendation.evidence.analysis, ruleSet);
  if (!plateau.qualifiesAsPlateau) {
    return {
      ...recommendationWithDeloadEvidence,
      evidence: { ...recommendationWithDeloadEvidence.evidence, plateau },
    };
  }
  const reviewExposureIds = plateau.qualifiesForSubstitutionReview
    ? plateau.substitutionReviewExposureIds
    : plateau.plateauExposureIds;
  const reviewExposureIdSet = new Set(reviewExposureIds);
  const reviewExposures = coreRecommendation.evidence.analysis.exposures.filter(({ exposureId }) =>
    reviewExposureIdSet.has(exposureId),
  );
  return recommendation(
    input,
    coreRecommendation.evidence.analysis,
    reviewExposures,
    plateau.qualifiesForSubstitutionReview ? 'consider_substitution' : 'maintain_load',
    plateau.qualifiesForSubstitutionReview ? null : input.prescription.currentPlannedLoad,
    [
      ...coreRecommendation.reasonCodes,
      ...(plateau.qualifiesAsPlateau ? (['PLATEAU_SIGNAL'] as const) : []),
      ...(plateau.qualifiesForSubstitutionReview ? (['SUBSTITUTION_REVIEW_SIGNAL'] as const) : []),
    ],
    plateau,
    deload,
  );
}

function recommendCoreProgression(
  input: ProgressionEngineInput,
  ruleSet: ProgressionRuleSet,
): ProgressionResult {
  const analysis = analyzeProgressionEvidence(input, ruleSet);
  if (analysis.status === 'failure') {
    return analysis;
  }

  const eligible = analysis.exposures.filter(
    ({ usableWorkingSetCount, wasDeload }) => usableWorkingSetCount > 0 && !wasDeload,
  );
  const reductionWindow = eligible.slice(-ruleSet.reductionRequiredExposureCount);
  const increaseWindow = eligible.slice(-ruleSet.increaseRequiredExposureCount);
  const reductionSignal =
    reductionWindow.length === ruleSet.reductionRequiredExposureCount &&
    reductionWindow.every(
      ({ allSetsBelowTargetMinimum, rirBelowReductionThreshold }) =>
        allSetsBelowTargetMinimum || rirBelowReductionThreshold,
    );
  const increaseSignal =
    increaseWindow.length === ruleSet.increaseRequiredExposureCount &&
    increaseWindow.every(
      ({ allSetsAtOrAboveTargetMaximum, knownRirSetCount, rirTargetPosition, exposureId }) => {
        const targetRir = targetRirForExposure(input, exposureId);
        return (
          allSetsAtOrAboveTargetMaximum &&
          (targetRir === null ||
            (knownRirSetCount >= ruleSet.minimumKnownRirSetsPerExposureForIncrease &&
              rirTargetPosition !== 'below_target' &&
              rirTargetPosition !== 'mixed' &&
              rirTargetPosition !== 'unknown'))
        );
      },
    );

  const reducedLoad = reductionSignal ? adjustedLoad(input, ruleSet, 'reduce') : null;
  if (reductionSignal && reducedLoad !== null) {
    return recommendation(input, analysis, reductionWindow, 'reduce_load', reducedLoad, [
      ...(reductionWindow.some(({ allSetsBelowTargetMinimum }) => allSetsBelowTargetMinimum)
        ? (['BELOW_TARGET_REPS'] as const)
        : []),
      ...(reductionWindow.some(({ rirBelowReductionThreshold }) => rirBelowReductionThreshold)
        ? (['RIR_BELOW_TARGET'] as const)
        : []),
      'LOAD_REDUCTION_APPLIED',
    ]);
  }

  const increasedLoad = increaseSignal ? adjustedLoad(input, ruleSet, 'increase') : null;
  if (increaseSignal && increasedLoad !== null) {
    return recommendation(input, analysis, increaseWindow, 'increase_load', increasedLoad, [
      'TARGET_REPS_ACHIEVED',
      ...(input.prescription.targetRirRange === undefined
        ? []
        : (['TARGET_RIR_ACHIEVED'] as const)),
      'LOAD_INCREMENT_APPLIED',
    ]);
  }

  const maintainReasons: ProgressionRecommendationReasonCode[] = [];
  if (
    eligible.length <
    Math.max(ruleSet.increaseRequiredExposureCount, ruleSet.reductionRequiredExposureCount)
  ) {
    maintainReasons.push('INSUFFICIENT_HISTORY');
  } else if (eligible.every(({ allSetsWithinTargetRange }) => allSetsWithinTargetRange)) {
    maintainReasons.push('WITHIN_TARGET_REP_RANGE');
  } else {
    maintainReasons.push('MIXED_PERFORMANCE');
  }
  if (
    input.prescription.targetRirRange !== undefined &&
    eligible.every(({ knownRirSetCount }) => knownRirSetCount === 0)
  ) {
    maintainReasons.push('RIR_UNKNOWN');
  }
  maintainReasons.push('LOAD_MAINTAINED');
  return recommendation(
    input,
    analysis,
    eligible,
    'maintain_load',
    input.prescription.currentPlannedLoad,
    maintainReasons,
  );
}

function analyzeExposure(
  exposure: ProgressionExerciseExposure,
  input: ProgressionEngineInput,
  ruleSet: ProgressionRuleSet,
): ProgressionExposureAnalysis {
  const usableSets = exposure.sets.filter(
    (set): set is CompletedProgressionSet =>
      exposure.status === 'completed' &&
      set.status === 'completed' &&
      set.classification === 'working' &&
      set.reps !== null,
  );
  const workingSetCount = exposure.sets.filter(
    ({ classification }) => classification === 'working',
  ).length;
  const reps = usableSets.map(({ reps }) => reps!);
  const knownRir = usableSets.flatMap(({ rir }) => (rir === null ? [] : [rir]));
  const targetRepRange = exposure.prescription?.targetRepRange ?? input.prescription.targetRepRange;
  const targetRirRange = exposure.prescription?.targetRirRange ?? input.prescription.targetRirRange;

  return {
    exposureId: exposure.exposureId,
    occurredAt: exposure.occurredAt,
    usableSetIds: usableSets.map(({ setId }) => setId),
    usableWorkingSetCount: usableSets.length,
    ignoredWorkingSetCount: workingSetCount - usableSets.length,
    representativeLoad: representativeLoad(usableSets),
    observedRepRange: observedRange(reps),
    totalObservedReps: reps.reduce((total, repsValue) => total + repsValue, 0),
    observedRirRange: observedRange(knownRir),
    knownRirSetCount: knownRir.length,
    allSetsAtOrAboveTargetMaximum:
      reps.length > 0 && reps.every((repsValue) => repsValue >= targetRepRange.maximum),
    allSetsWithinTargetRange:
      reps.length > 0 &&
      reps.every(
        (repsValue) => repsValue >= targetRepRange.minimum && repsValue <= targetRepRange.maximum,
      ),
    allSetsBelowTargetMinimum:
      reps.length > 0 && reps.every((repsValue) => repsValue < targetRepRange.minimum),
    rirTargetPosition: rirTargetPosition(knownRir, targetRirRange ?? null),
    rirBelowReductionThreshold:
      targetRirRange !== undefined &&
      targetRirRange !== null &&
      knownRir.length > 0 &&
      knownRir.every(
        (rir) => rir <= Math.max(0, targetRirRange.minimum - ruleSet.rirReductionMargin),
      ),
    wasDeload: exposure.wasDeload,
    wasSubstitution: exposure.substitution !== null,
  };
}

function recommendation(
  input: ProgressionEngineInput,
  analysis: ProgressionEvidenceAnalysis,
  evidenceExposures: readonly ProgressionExposureAnalysis[],
  action: ProgressionRecommendation['action'],
  recommendedLoad: ProgressionLoad | null,
  reasons: readonly ProgressionRecommendationReasonCode[],
  plateau?: ProgressionPlateauEvidence,
  deload?: ProgressionDeloadEvidence,
): ProgressionRecommendation {
  const exposureIds = evidenceExposures.map(({ exposureId }) => exposureId);
  const setIds = evidenceExposures.flatMap(({ usableSetIds }) => usableSetIds);
  const repValues = evidenceExposures.flatMap(({ observedRepRange }) =>
    observedRepRange === null ? [] : [observedRepRange.minimum, observedRepRange.maximum],
  );
  const rirValues = evidenceExposures.flatMap(({ observedRirRange }) =>
    observedRirRange === null ? [] : [observedRirRange.minimum, observedRirRange.maximum],
  );
  const observedRepRange = observedRange(repValues);
  const observedRirRange = observedRange(rirValues);
  const reasonSet = new Set(reasons);
  return {
    status: 'success',
    contractVersion: progressionRecommendationContractVersion,
    subjectId: input.subjectId,
    exerciseId: input.exerciseId,
    action,
    previousLoad: input.prescription.currentPlannedLoad,
    recommendedLoad,
    targetRepRange: input.prescription.targetRepRange,
    ...(input.prescription.targetRirRange
      ? { targetRirRange: input.prescription.targetRirRange }
      : {}),
    reasonCodes: progressionRecommendationReasonCodes.filter((code) => reasonSet.has(code)),
    evidence: {
      exposureIds,
      setIds,
      ...(observedRepRange ? { observedRepRange } : {}),
      ...(observedRirRange ? { observedRirRange } : {}),
      trend: analysis.performanceTrend,
      ...(plateau ? { plateau } : {}),
      ...(deload ? { deload } : {}),
      analysis,
    },
    version: input.version,
    calculatedAt: input.calculatedAt,
  };
}

function analyzeDeloadEvidence(
  analysis: ProgressionEvidenceAnalysis,
  ruleSet: ProgressionRuleSet,
): ProgressionDeloadEvidence {
  const reviewWindow = analysis.exposures.slice(-ruleSet.deloadReviewRequiredExposureCount);
  const performance = performanceTrend(reviewWindow.filter(({ wasDeload }) => !wasDeload));
  const priorDeloadExposureIds = reviewWindow
    .filter(({ wasDeload }) => wasDeload)
    .map(({ exposureId }) => exposureId);
  const knownHighEffortExposureCount = reviewWindow.filter(
    ({ rirBelowReductionThreshold }) => rirBelowReductionThreshold,
  ).length;
  const unknownRirExposureCount = reviewWindow.filter(
    ({ knownRirSetCount }) => knownRirSetCount === 0,
  ).length;
  const completeWindow =
    reviewWindow.length === ruleSet.deloadReviewRequiredExposureCount &&
    reviewWindow.every(({ usableWorkingSetCount }) => usableWorkingSetCount > 0);
  const degradationSignal = completeWindow && performance.direction === 'declining';
  const highEffortSignal =
    completeWindow &&
    knownHighEffortExposureCount >= ruleSet.deloadReviewMinimumHighEffortExposureCount;
  const suppressedByRecentDeload = priorDeloadExposureIds.length > 0;

  return {
    reviewExposureIds: reviewWindow.map(({ exposureId }) => exposureId),
    priorDeloadExposureIds,
    performanceTrend: performance,
    knownHighEffortExposureCount,
    unknownRirExposureCount,
    degradationSignal,
    highEffortSignal,
    suppressedByRecentDeload,
    qualifiesForDeloadReview: !suppressedByRecentDeload && (degradationSignal || highEffortSignal),
  };
}

function analyzePlateauEvidence(
  input: ProgressionEngineInput,
  analysis: ProgressionEvidenceAnalysis,
  ruleSet: ProgressionRuleSet,
): ProgressionPlateauEvidence {
  const plateauWindow = analysis.exposures.slice(-ruleSet.plateauRequiredExposureCount);
  const substitutionWindow = analysis.exposures.slice(
    -ruleSet.substitutionReviewRequiredExposureCount,
  );
  const stableLoad = hasStableLoad(plateauWindow);
  const stableSetCount = hasStableSetCount(plateauWindow);
  const stagnantReps = hasStagnantReps(plateauWindow, ruleSet.plateauMaximumRepChange);
  const recentProgression =
    performanceTrend(plateauWindow).direction === 'improving' ||
    directionalTrend(
      plateauWindow.map(({ representativeLoad }) => representativeLoad?.value ?? null),
    ) === 'increasing';
  const deloadExposureIds = substitutionWindow
    .filter(({ wasDeload }) => wasDeload)
    .map(({ exposureId }) => exposureId);
  const knownHighEffortExposureCount = substitutionWindow.filter((exposure) => {
    const targetRir = targetRirForExposure(input, exposure.exposureId);
    return (
      targetRir !== null &&
      exposure.observedRirRange !== null &&
      exposure.observedRirRange.maximum <= targetRir.minimum
    );
  }).length;
  const unknownRirExposureCount = substitutionWindow.filter(
    ({ knownRirSetCount }) => knownRirSetCount === 0,
  ).length;
  const qualifiesAsPlateau =
    plateauWindow.length === ruleSet.plateauRequiredExposureCount &&
    plateauWindow.every(({ usableWorkingSetCount, wasDeload }) =>
      Boolean(usableWorkingSetCount > 0 && !wasDeload),
    ) &&
    stableLoad &&
    stableSetCount &&
    stagnantReps &&
    !recentProgression;
  const qualifiesForSubstitutionReview =
    qualifiesAsPlateau &&
    substitutionWindow.length === ruleSet.substitutionReviewRequiredExposureCount &&
    substitutionWindow.every(({ usableWorkingSetCount, wasDeload }) =>
      Boolean(usableWorkingSetCount > 0 && !wasDeload),
    ) &&
    hasStableLoad(substitutionWindow) &&
    hasStableSetCount(substitutionWindow) &&
    hasStagnantReps(substitutionWindow, ruleSet.plateauMaximumRepChange) &&
    knownHighEffortExposureCount >= ruleSet.substitutionReviewMinimumHighEffortExposureCount;

  return {
    plateauExposureIds: plateauWindow.map(({ exposureId }) => exposureId),
    substitutionReviewExposureIds: substitutionWindow.map(({ exposureId }) => exposureId),
    deloadExposureIds,
    stableLoad,
    stableSetCount,
    stagnantReps,
    recentProgression,
    knownHighEffortExposureCount,
    unknownRirExposureCount,
    qualifiesAsPlateau,
    qualifiesForSubstitutionReview,
  };
}

function hasStableLoad(exposures: readonly ProgressionExposureAnalysis[]): boolean {
  const first = exposures[0]?.representativeLoad;
  return (
    first !== undefined &&
    first !== null &&
    exposures.every(
      ({ representativeLoad }) =>
        representativeLoad?.value === first.value && representativeLoad.unit === first.unit,
    )
  );
}

function hasStableSetCount(exposures: readonly ProgressionExposureAnalysis[]): boolean {
  const first = exposures[0]?.usableWorkingSetCount;
  return (
    first !== undefined &&
    exposures.every(({ usableWorkingSetCount }) => usableWorkingSetCount === first)
  );
}

function hasStagnantReps(
  exposures: readonly ProgressionExposureAnalysis[],
  maximumRepChange: number,
): boolean {
  if (exposures.length === 0) {
    return false;
  }
  const totals = exposures.map(({ totalObservedReps }) => totalObservedReps);
  return Math.max(...totals) - Math.min(...totals) <= maximumRepChange;
}

function adjustedLoad(
  input: ProgressionEngineInput,
  ruleSet: ProgressionRuleSet,
  direction: 'increase' | 'reduce',
): ProgressionLoad | null {
  const current = input.prescription.currentPlannedLoad;
  const increments = input.prescription.availableLoadIncrements;
  if (current === null || increments === null || current.unit !== increments.unit) {
    return null;
  }
  const increment = increments.increments[0];
  if (increment === undefined) {
    return null;
  }
  if (
    direction === 'reduce' &&
    (current.value === 0 ||
      increment > current.value ||
      increment / current.value > ruleSet.maximumLoadReductionFraction)
  ) {
    return null;
  }
  return {
    value: roundLoad(current.value + (direction === 'increase' ? increment : -increment)),
    unit: current.unit,
  };
}

function representativeLoad(sets: readonly CompletedProgressionSet[]): ProgressionLoad | null {
  if (sets.length === 0 || sets.some(({ load, loadUnit }) => load === null || loadUnit === null)) {
    return null;
  }
  const first = sets[0]!;
  if (
    sets.some(({ load, loadUnit }) => load !== first.load || loadUnit !== first.loadUnit) ||
    first.load === null ||
    first.loadUnit === null
  ) {
    return null;
  }
  return { value: first.load, unit: first.loadUnit };
}

function performanceTrend(
  exposures: readonly ProgressionExposureAnalysis[],
): ProgressionTrendEvidence {
  if (exposures.length < 2) {
    return { direction: 'mixed', exposureCount: exposures.length };
  }
  const comparisons = exposures
    .slice(1)
    .map((current, index) => comparePerformance(exposures[index]!, current));
  const direction = comparisons.includes(2)
    ? 'mixed'
    : comparisons.every((value) => value === 0)
      ? 'stable'
      : comparisons.every((value) => value >= 0) && comparisons.some((value) => value > 0)
        ? 'improving'
        : comparisons.every((value) => value <= 0) && comparisons.some((value) => value < 0)
          ? 'declining'
          : 'mixed';
  return { direction, exposureCount: exposures.length };
}

function comparePerformance(
  previous: ProgressionExposureAnalysis,
  current: ProgressionExposureAnalysis,
): -1 | 0 | 1 | 2 {
  if (previous.usableWorkingSetCount !== current.usableWorkingSetCount) {
    return 2;
  }
  const previousLoad = previous.representativeLoad;
  const currentLoad = current.representativeLoad;
  if (previousLoad === null || currentLoad === null) {
    if (previousLoad !== currentLoad) {
      return 2;
    }
    return compareNumbers(current.totalObservedReps, previous.totalObservedReps);
  }
  if (currentLoad.unit !== previousLoad.unit) {
    return 2;
  }
  if (
    currentLoad.value > previousLoad.value &&
    current.totalObservedReps >= previous.totalObservedReps
  ) {
    return 1;
  }
  if (
    currentLoad.value < previousLoad.value &&
    current.totalObservedReps <= previous.totalObservedReps
  ) {
    return -1;
  }
  if (currentLoad.value === previousLoad.value) {
    return compareNumbers(current.totalObservedReps, previous.totalObservedReps);
  }
  return 2;
}

function directionalTrend(values: readonly (number | null)[]): ProgressionDirectionalTrend {
  if (values.length < 2 || values.some((value) => value === null)) {
    return 'unknown';
  }
  const known = values as readonly number[];
  const comparisons = known.slice(1).map((value, index) => compareNumbers(value, known[index]!));
  if (comparisons.every((value) => value === 0)) {
    return 'stable';
  }
  if (comparisons.every((value) => value >= 0) && comparisons.some((value) => value > 0)) {
    return 'increasing';
  }
  if (comparisons.every((value) => value <= 0) && comparisons.some((value) => value < 0)) {
    return 'decreasing';
  }
  return 'mixed';
}

function rirTrend(exposures: readonly ProgressionExposureAnalysis[]): ProgressionDirectionalTrend {
  if (exposures.length < 2 || exposures.some(({ observedRirRange }) => observedRirRange === null)) {
    return 'unknown';
  }
  const midpoints = exposures.map(({ observedRirRange }) =>
    observedRirRange === null ? null : (observedRirRange.minimum + observedRirRange.maximum) / 2,
  );
  return directionalTrend(midpoints);
}

function rirTargetPosition(
  values: readonly number[],
  target: ProgressionRirRange | null,
): ProgressionRirTargetPosition {
  if (values.length === 0 || target === null) {
    return 'unknown';
  }
  if (values.every((value) => value > target.maximum)) {
    return 'above_target';
  }
  if (values.every((value) => value >= target.minimum && value <= target.maximum)) {
    return 'at_target';
  }
  if (values.every((value) => value < target.minimum)) {
    return 'below_target';
  }
  return 'mixed';
}

function targetRirForExposure(
  input: ProgressionEngineInput,
  exposureId: ExerciseExposureId,
): ProgressionRirRange | null {
  const exposure = input.exposures.find((candidate) => candidate.exposureId === exposureId);
  return exposure?.prescription?.targetRirRange ?? input.prescription.targetRirRange ?? null;
}

function observedRange(values: readonly number[]): ProgressionObservedRange | null {
  if (values.length === 0) {
    return null;
  }
  return { minimum: Math.min(...values), maximum: Math.max(...values) };
}

function compareNumbers(left: number, right: number): -1 | 0 | 1 {
  return left === right ? 0 : left > right ? 1 : -1;
}

function roundLoad(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
