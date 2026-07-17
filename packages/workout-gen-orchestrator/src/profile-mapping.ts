/**
 * Maps a server-side training profile to engine-compatible goal configuration.
 *
 * Pure mapping — no database access. The profile is loaded by the caller
 * (Edge Function) and passed in. The discomfort boolean must NOT be
 * converted into a safety classification.
 */

import {
  resolveTrainingGoalRules,
  type TrainingGoal,
  type TrainingGoalRuleProfile,
} from '@adaptive-workout/workout-engine';
import type { ServerTrainingProfile } from './contracts.js';

export interface ProfileMappingResult {
  readonly goalProfile: TrainingGoalRuleProfile;
  /** True when hasCurrentDiscomfort is true and no classified constraints are present. */
  readonly discomfortReviewRequired: boolean;
}

/**
 * Maps a loaded server-side training profile to engine-usable configuration.
 *
 * - Goal is mapped to a deterministic TrainingGoalRuleProfile.
 * - The discomfort boolean is checked but NOT converted to safety constraints.
 * - If hasCurrentDiscomfort is true, the result flags discomfortReviewRequired
 *   so the orchestrator can return DISCOMFORT_REVIEW_REQUIRED.
 */
export function mapProfileToGoalRules(
  profile: ServerTrainingProfile,
): ProfileMappingResult {
  const goal = mapGoal(profile.goal);
  const goalProfile = resolveTrainingGoalRules(goal);

  const discomfortReviewRequired = profile.hasCurrentDiscomfort === true;

  return { goalProfile, discomfortReviewRequired };
}

/**
 * Maps a goal from the profile to the engine TrainingGoal type.
 * Rejects unrecognized goals by falling back to undefined (default behavior).
 */
function mapGoal(goal: string): TrainingGoal | undefined {
  const trainingGoals: readonly string[] = [
    'build_muscle',
    'lose_fat',
    'gain_strength',
    'improve_fitness',
    'recomposition',
  ];
  if (trainingGoals.includes(goal)) {
    return goal as TrainingGoal;
  }
  return undefined;
}