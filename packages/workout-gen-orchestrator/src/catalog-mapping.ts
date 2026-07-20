/**
 * Maps loaded catalog rows to engine-compatible candidate contracts.
 *
 * Pure mapping — no database access. The catalog is loaded by the caller
 * and passed in. Only active exercises are included. Stable ordering
 * by exercise ID ensures deterministic behavior.
 */

import type {
  WorkoutExerciseCandidate,
  WorkoutExerciseMuscleContribution,
  WorkoutExerciseEquipmentRequirement,
} from '@adaptive-workout/workout-engine';
import type { ExerciseId, ExerciseFamilyId, MuscleId, EquipmentId } from '@adaptive-workout/domain';
import type {
  CatalogExerciseRow,
  CatalogExerciseMuscleRow,
  CatalogExerciseEquipmentRow,
  CatalogEquipmentRow,
  CatalogMuscleRow,
} from './contracts.js';

export interface CatalogMappingResult {
  readonly candidates: readonly WorkoutExerciseCandidate[];
  readonly muscleIdToSlug: ReadonlyMap<string, string>;
  readonly muscleIdToName: ReadonlyMap<string, string>;
  readonly exerciseIdToName: ReadonlyMap<string, string>;
  readonly exerciseIdToVersion: ReadonlyMap<string, number>;
  readonly equipmentIdToSlug: ReadonlyMap<string, string>;
  readonly familyIdToSlug: ReadonlyMap<string, string>;
  /** Maps exercise ID to the list of equipment slugs required/available for that exercise. */
  readonly exerciseIdToEquipmentSlugs: ReadonlyMap<string, readonly string[]>;
}

/**
 * Maps active catalog rows to engine-compatible workout exercise candidates.
 *
 * - Only active exercises are included.
 * - Stable ordering by exercise ID.
 * - All muscle and equipment joins are resolved into the candidate contract.
 */
export function mapCatalogToEngineCandidates(
  exercises: readonly CatalogExerciseRow[],
  muscles: readonly CatalogMuscleRow[],
  exerciseMuscles: readonly CatalogExerciseMuscleRow[],
  exerciseEquipment: readonly CatalogExerciseEquipmentRow[],
  equipmentRows: readonly CatalogEquipmentRow[],
): CatalogMappingResult {
  const activeExercises = exercises
    .filter((ex) => ex.isActive)
    .sort((a, b) => a.id.localeCompare(b.id));

  const muscleIdToSlug = new Map<string, string>();
  const muscleIdToName = new Map<string, string>();
  const exerciseIdToName = new Map<string, string>();
  const exerciseIdToVersion = new Map<string, number>();
  const equipmentIdToSlug = new Map<string, string>();
  const familyIdToSlug = new Map<string, string>();

  for (const m of muscles) {
    muscleIdToSlug.set(m.id, m.slug);
    muscleIdToName.set(m.id, m.name);
  }

  for (const equipment of equipmentRows) {
    equipmentIdToSlug.set(equipment.id, equipment.slug);
  }

  const muscleContributionsByExercise = new Map<string, readonly CatalogExerciseMuscleRow[]>();
  for (const em of exerciseMuscles) {
    const list = muscleContributionsByExercise.get(em.exerciseId) ?? [];
    muscleContributionsByExercise.set(em.exerciseId, [...list, em]);
  }

  const equipmentRequirementsByExercise = new Map<string, readonly CatalogExerciseEquipmentRow[]>();
  for (const ee of exerciseEquipment) {
    const list = equipmentRequirementsByExercise.get(ee.exerciseId) ?? [];
    equipmentRequirementsByExercise.set(ee.exerciseId, [...list, ee]);
  }

  const exerciseIdToEquipmentSlugs = new Map<string, readonly string[]>();

  const candidates: WorkoutExerciseCandidate[] = [];

  for (const ex of activeExercises) {
    exerciseIdToName.set(ex.id, ex.name);
    exerciseIdToVersion.set(ex.id, ex.version);

    const muscleRows = muscleContributionsByExercise.get(ex.id) ?? [];
    const equipmentRows = equipmentRequirementsByExercise.get(ex.id) ?? [];

    const muscleContributions: WorkoutExerciseMuscleContribution[] = muscleRows.map((row) => ({
      muscleId: row.muscleId as MuscleId,
      role: row.role,
      contribution: row.contribution,
    }));

    const equipment: WorkoutExerciseEquipmentRequirement[] = equipmentRows.map((row) => ({
      equipmentId: row.equipmentId as EquipmentId,
      requirement: row.requirement,
    }));

    // Collect equipment slugs for this exercise (for load estimation)
    const equipmentSlugs = equipmentRows.map((row) => row.equipmentSlug);
    exerciseIdToEquipmentSlugs.set(ex.id, equipmentSlugs);

    candidates.push({
      exerciseId: ex.id as ExerciseId,
      exerciseFamilyId: ex.exerciseFamilyId as ExerciseFamilyId,
      isActive: ex.isActive,
      muscleContributions,
      equipment,
    });

    familyIdToSlug.set(ex.exerciseFamilyId, ex.exerciseFamilySlug);
  }

  return {
    candidates,
    muscleIdToSlug,
    muscleIdToName,
    exerciseIdToName,
    exerciseIdToVersion,
    equipmentIdToSlug,
    familyIdToSlug,
    exerciseIdToEquipmentSlugs,
  };
}
