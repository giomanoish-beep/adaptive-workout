/**
 * Training goal rule profile for deterministic workout engine configuration.
 *
 * Each supported training goal maps to an explicit, inspectable rule profile
 * that tunes volume tendency, diversity preference, duration expansion
 * aggressiveness, rep-range guidance, and rest tendency.
 *
 * The engine owns this type independently; web onboarding types must be
 * structurally compatible but are never imported here.
 */

export const trainingGoals = [
  'build_muscle',
  'lose_fat',
  'gain_strength',
  'improve_fitness',
  'recomposition',
] as const;

export type TrainingGoal = (typeof trainingGoals)[number];

export interface TrainingGoalRepRangeGuidance {
  readonly minimum: number;
  readonly maximum: number;
}

export interface TrainingGoalRuleProfile {
  /** The goal this profile was resolved for. */
  readonly goal: TrainingGoal | 'default';

  /**
   * Volume tendency multiplier applied to preferred expansion maximums.
   * Values above 1.0 permit more volume expansion; below 1.0 constrain it.
   */
  readonly volumeMultiplier: number;

  /**
   * Diversity tendency controlling how strongly the engine prefers
   * distinct exercise families. Higher values nudge the engine toward
   * broader family coverage; lower values keep it focused.
   *
   * This feeds into the effective minimum distinct family count and
   * influences whether new-family expansion is attempted during
   * duration fitting.
   */
  readonly diversityTendency: number;

  /**
   * Duration expansion aggressiveness controlling how much of the
   * remaining time budget the engine tries to fill.
   *
   * Expressed as a multiplier on `targetDurationUtilization`.
   * 1.0 = baseline, > 1.0 = more aggressive, < 1.0 = conservative.
   */
  readonly expansionAggressiveness: number;

  /**
   * Recommended rep range for this goal. This is downstream guidance
   * only — the current engine stage does not authoritatively produce
   * per-exercise rep prescriptions. Callers (prescription stages,
   * UI) may consume this field.
   */
  readonly repRangeGuidance: TrainingGoalRepRangeGuidance;

  /**
   * Recommended rest tendency for this goal. Duration fitting derives a
   * goal-aware default from this value, while template prescriptions may still
   * override rest for specific exercises.
   */
  readonly restTendency: 'shorter' | 'moderate' | 'longer';
}

const goalProfiles: Readonly<Record<TrainingGoal, TrainingGoalRuleProfile>> = {
  build_muscle: {
    goal: 'build_muscle',
    volumeMultiplier: 1.6,
    diversityTendency: 1.0,
    expansionAggressiveness: 1.0,
    repRangeGuidance: { minimum: 6, maximum: 15 },
    restTendency: 'moderate',
  },

  lose_fat: {
    goal: 'lose_fat',
    volumeMultiplier: 1.2,
    diversityTendency: 0.95,
    expansionAggressiveness: 0.85,
    repRangeGuidance: { minimum: 6, maximum: 15 },
    restTendency: 'shorter',
  },

  gain_strength: {
    goal: 'gain_strength',
    volumeMultiplier: 1.0,
    diversityTendency: 0.5,
    expansionAggressiveness: 0.6,
    repRangeGuidance: { minimum: 3, maximum: 8 },
    restTendency: 'longer',
  },

  improve_fitness: {
    goal: 'improve_fitness',
    volumeMultiplier: 1.1,
    diversityTendency: 1.3,
    expansionAggressiveness: 0.9,
    repRangeGuidance: { minimum: 8, maximum: 15 },
    restTendency: 'moderate',
  },

  recomposition: {
    goal: 'recomposition',
    volumeMultiplier: 1.35,
    diversityTendency: 0.9,
    expansionAggressiveness: 0.9,
    repRangeGuidance: { minimum: 6, maximum: 15 },
    restTendency: 'moderate',
  },
};

const defaultProfile: TrainingGoalRuleProfile = {
  goal: 'default',
  volumeMultiplier: 1.6,
  diversityTendency: 1.0,
  expansionAggressiveness: 1.0,
  repRangeGuidance: { minimum: 6, maximum: 15 },
  restTendency: 'moderate',
};

/**
 * Resolve a deterministic training-goal rule profile.
 *
 * When `goal` is `undefined` (no training goal supplied), the returned
 * profile preserves existing engine behavior — equivalent to the
 * pre-goal default.
 */
export function resolveTrainingGoalRules(goal: TrainingGoal | undefined): TrainingGoalRuleProfile {
  if (goal === undefined) {
    return defaultProfile;
  }
  return goalProfiles[goal];
}
