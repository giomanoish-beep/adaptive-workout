/**
 * Constructs the deterministic WorkoutEngineInput from the validated request,
 * mapped training profile, and catalog data.
 *
 * Pure — no side effects, no Supabase, no AI.
 */

import type {
  WorkoutEngineInput,
  WorkoutTargetMuscle,
  WorkoutConstraint,
  ExcludedMusclesConstraint,
  UnavailableEquipmentConstraint,
  PreferredMusclesConstraint,
} from '@adaptive-workout/workout-engine';
import type {
  ContractVersion,
  DeterministicEngineVersion,
  EngineVersion,
  MuscleId,
  EquipmentId,
  RuleSetVersion,
} from '@adaptive-workout/domain';
import type {
  GenerateWorkoutRequest,
  MuscleIdMap as MuscleOptionMap,
  EquipmentContextMap,
} from './contracts.js';
import type { CatalogMappingResult } from './catalog-mapping.js';

/** Engine version constants for the orchestrator. */
export const ORCHESTRATOR_ENGINE_NAME = 'adaptive-workout/workout-engine' as const;
export const ORCHESTRATOR_CONTRACT_VERSION: ContractVersion = 'contract/1' as ContractVersion;
export const ORCHESTRATOR_ENGINE_VERSION_ID: EngineVersion = '1' as EngineVersion;
export const ORCHESTRATOR_RULE_SET_VERSION: RuleSetVersion = 'rule-set/8' as RuleSetVersion;
export const ORCHESTRATOR_ENGINE_VERSION: DeterministicEngineVersion = {
  engineName: ORCHESTRATOR_ENGINE_NAME,
  engineVersion: ORCHESTRATOR_ENGINE_VERSION_ID,
  ruleSetVersion: ORCHESTRATOR_RULE_SET_VERSION,
};

let constraintIdCounter = 0;
function nextConstraintId(): string {
  constraintIdCounter += 1;
  return `constraint-${constraintIdCounter}`;
}

/**
 * Constructs a WorkoutEngineInput from the validated request and catalog.
 */
export function buildEngineInput(
  request: GenerateWorkoutRequest,
  catalogResult: CatalogMappingResult,
  muscleOptionMap: MuscleOptionMap,
  equipmentContextMap: EquipmentContextMap,
  userId: string,
): WorkoutEngineInput {
  const targetMuscles: WorkoutTargetMuscle[] = request.targetMuscles.map((optionId) => {
    const canonicalSlug = muscleOptionMap[optionId] ?? optionId;
    const muscleId = findMuscleIdBySlug(catalogResult.muscleIdToSlug, canonicalSlug);
    return {
      muscleId,
      priority: request.emphasis === optionId ? 'preferred' : 'required',
    };
  });

  // If emphasis is specified for a muscle not in targets, add it as preferred
  if (request.emphasis && !request.targetMuscles.includes(request.emphasis)) {
    const emphasisSlug = muscleOptionMap[request.emphasis] ?? request.emphasis;
    const emphasisMuscleId = findMuscleIdBySlug(catalogResult.muscleIdToSlug, emphasisSlug);
    targetMuscles.push({ muscleId: emphasisMuscleId, priority: 'preferred' });
  }

  // Excluded muscles
  const excludedMuscleIds: MuscleId[] = (request.excludedMuscles ?? [])
    .map((optionId) => {
      const slug = muscleOptionMap[optionId] ?? optionId;
      return findMuscleIdBySlug(catalogResult.muscleIdToSlug, slug);
    });

  // Equipment context → available equipment IDs
  const availableSlugs = equipmentContextMap[request.equipmentContext] ?? [];
  const availableEquipmentIds: EquipmentId[] = [];
  for (const slug of availableSlugs) {
    const id = findEquipmentIdBySlug(catalogResult, slug);
    if (id) availableEquipmentIds.push(id);
  }

  // Constraints from excluded muscles, unavailable equipment, emphasis
  const constraints: WorkoutConstraint[] = [];
  if (excludedMuscleIds.length > 0) {
    constraints.push({
      id: nextConstraintId(),
      kind: 'excluded_muscles',
      source: 'user',
      reasonCode: 'user_excluded',
      muscleIds: excludedMuscleIds,
    } satisfies ExcludedMusclesConstraint);
  }

  if (request.unavailableEquipment && request.unavailableEquipment.length > 0) {
    const unavailableIds: EquipmentId[] = [];
    for (const id of request.unavailableEquipment) {
      const eqId = findEquipmentIdBySlug(catalogResult, id);
      if (eqId) unavailableIds.push(eqId);
    }
    if (unavailableIds.length > 0) {
      constraints.push({
        id: nextConstraintId(),
        kind: 'unavailable_equipment',
        source: 'user',
        reasonCode: 'user_unavailable',
        equipmentIds: unavailableIds,
      } satisfies UnavailableEquipmentConstraint);
    }
  }

  // If an emphasis muscle is in targets, create a preferred_muscles constraint
  if (request.emphasis) {
    const emphasisSlug = muscleOptionMap[request.emphasis] ?? request.emphasis;
    const emphasisMuscleId = findMuscleIdBySlug(catalogResult.muscleIdToSlug, emphasisSlug);
    constraints.push({
      id: nextConstraintId(),
      kind: 'preferred_muscles',
      source: 'user',
      reasonCode: 'emphasis',
      muscleIds: [emphasisMuscleId],
    } satisfies PreferredMusclesConstraint);
  }

  const today = new Date().toISOString().split('T')[0];

  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    subjectUserId: userId as WorkoutEngineInput['subjectUserId'],
    sessionDate: today,
    deterministicSeed: `${request.durationMinutes}:${today}:${request.targetMuscles.join(',')}`,
    origin: 'generated',
    goal: 'general_fitness',
    experienceLevel: 'intermediate',
    targetMuscles,
    excludedMuscleIds,
    availableDurationMinutes: request.durationMinutes,
    availableEquipmentIds,
    exerciseCatalog: catalogResult.candidates,
    recentMuscleTraining: [],
    recentExerciseExposures: [],
    exercisePreferences: [],
    constraints,
    version: ORCHESTRATOR_ENGINE_VERSION,
  };
}

function findMuscleIdBySlug(
  muscleIdToSlug: ReadonlyMap<string, string>,
  slug: string,
): MuscleId {
  for (const [id, muscleSlug] of muscleIdToSlug) {
    if (muscleSlug === slug) return id as MuscleId;
  }
  return slug as MuscleId;
}

function findEquipmentIdBySlug(
  catalogResult: CatalogMappingResult,
  slug: string,
): EquipmentId | null {
  for (const c of catalogResult.candidates) {
    for (const e of c.equipment) {
      if (e.equipmentId === slug) return e.equipmentId;
    }
  }
  return null;
}