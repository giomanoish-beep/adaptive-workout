import type { DomainId } from './identifiers.js';
import type { VersionedContract } from './versions.js';

export type MuscleId = DomainId<'muscle'>;
export type EquipmentId = DomainId<'equipment'>;
export type ExerciseFamilyId = DomainId<'exercise-family'>;
export type ExerciseId = DomainId<'exercise'>;
export type ExerciseMuscleId = DomainId<'exercise-muscle'>;
export type ExerciseEquipmentId = DomainId<'exercise-equipment'>;
export type ExerciseSubstitutionId = DomainId<'exercise-substitution'>;

export const exerciseMuscleRoles = ['primary', 'secondary', 'stabilizer'] as const;
export type ExerciseMuscleRole = (typeof exerciseMuscleRoles)[number];

export const exerciseEquipmentRequirements = ['required', 'optional'] as const;
export type ExerciseEquipmentRequirement = (typeof exerciseEquipmentRequirements)[number];

export interface ExerciseCatalogReferenceRecord {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly isActive: boolean;
}

export interface ExerciseMuscleImportRecord {
  readonly muscleSlug: string;
  readonly role: ExerciseMuscleRole;
  readonly contribution: number;
}

export interface ExerciseEquipmentImportRecord {
  readonly equipmentSlug: string;
  readonly requirement: ExerciseEquipmentRequirement;
}

export interface ExerciseImportRecord {
  readonly slug: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly exerciseFamilySlug: string;
  readonly description?: string;
  readonly version: number;
  readonly isActive: boolean;
  readonly muscles: readonly ExerciseMuscleImportRecord[];
  readonly equipment: readonly ExerciseEquipmentImportRecord[];
}

export interface ExerciseSubstitutionImportRecord {
  readonly sourceExerciseSlug: string;
  readonly substituteExerciseSlug: string;
  readonly reasonCode: string;
  readonly compatibilityScore: number;
  readonly notes?: string;
  readonly isActive: boolean;
}

export interface ExerciseCatalogImportPayload {
  readonly muscles: readonly ExerciseCatalogReferenceRecord[];
  readonly equipment: readonly ExerciseCatalogReferenceRecord[];
  readonly exerciseFamilies: readonly ExerciseCatalogReferenceRecord[];
  readonly exercises: readonly ExerciseImportRecord[];
  readonly substitutions: readonly ExerciseSubstitutionImportRecord[];
}

export type ExerciseCatalogImport = VersionedContract<ExerciseCatalogImportPayload>;

export const exerciseCatalogValidationCodes = [
  'INVALID_SLUG',
  'DUPLICATE_REFERENCE_SLUG',
  'DUPLICATE_CANONICAL_SLUG',
  'DUPLICATE_NORMALIZED_ALIAS',
  'ALIAS_COLLIDES_WITH_CANONICAL_NAME',
  'MISSING_EXERCISE_FAMILY',
  'UNKNOWN_MUSCLE',
  'MISSING_PRIMARY_MUSCLE',
  'INVALID_MUSCLE_ROLE',
  'INVALID_MUSCLE_CONTRIBUTION',
  'UNKNOWN_EQUIPMENT',
  'INVALID_EQUIPMENT_REQUIREMENT',
  'UNKNOWN_SUBSTITUTION_EXERCISE',
  'SELF_SUBSTITUTION',
  'DUPLICATE_SUBSTITUTION_EDGE',
  'INVALID_SUBSTITUTION_COMPATIBILITY',
] as const;

export type ExerciseCatalogValidationCode = (typeof exerciseCatalogValidationCodes)[number];

export interface ExerciseCatalogValidationIssue {
  readonly code: ExerciseCatalogValidationCode;
  readonly path: string;
  readonly message: string;
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validMuscleRoles = new Set<string>(exerciseMuscleRoles);
const validEquipmentRequirements = new Set<string>(exerciseEquipmentRequirements);

export function normalizeExerciseAlias(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

export function validateExerciseCatalogImport(
  catalog: ExerciseCatalogImport,
): readonly ExerciseCatalogValidationIssue[] {
  const issues: ExerciseCatalogValidationIssue[] = [];
  const payload = catalog.payload;

  validateReferenceSlugs('muscles', payload.muscles, issues);
  validateReferenceSlugs('equipment', payload.equipment, issues);
  validateReferenceSlugs('exerciseFamilies', payload.exerciseFamilies, issues);

  const familySlugs = new Set(payload.exerciseFamilies.map(({ slug }) => slug));
  const muscleSlugs = new Set(payload.muscles.map(({ slug }) => slug));
  const equipmentSlugs = new Set(payload.equipment.map(({ slug }) => slug));
  const exerciseSlugs = new Set<string>();
  const canonicalNames = new Set(payload.exercises.map(({ name }) => normalizeExerciseAlias(name)));
  const aliases = new Set<string>();

  payload.exercises.forEach((exercise, exerciseIndex) => {
    const exercisePath = `exercises[${exerciseIndex}]`;

    if (!slugPattern.test(exercise.slug)) {
      addIssue(issues, 'INVALID_SLUG', `${exercisePath}.slug`, 'Exercise slug is invalid.');
    }

    if (exerciseSlugs.has(exercise.slug)) {
      addIssue(
        issues,
        'DUPLICATE_CANONICAL_SLUG',
        `${exercisePath}.slug`,
        'Canonical exercise slug is duplicated.',
      );
    }
    exerciseSlugs.add(exercise.slug);

    if (!familySlugs.has(exercise.exerciseFamilySlug)) {
      addIssue(
        issues,
        'MISSING_EXERCISE_FAMILY',
        `${exercisePath}.exerciseFamilySlug`,
        'Exercise family does not exist in this catalog.',
      );
    }

    exercise.aliases.forEach((alias, aliasIndex) => {
      const normalizedAlias = normalizeExerciseAlias(alias);
      const aliasPath = `${exercisePath}.aliases[${aliasIndex}]`;

      if (aliases.has(normalizedAlias)) {
        addIssue(
          issues,
          'DUPLICATE_NORMALIZED_ALIAS',
          aliasPath,
          'Normalized exercise alias is duplicated.',
        );
      }
      aliases.add(normalizedAlias);

      if (canonicalNames.has(normalizedAlias)) {
        addIssue(
          issues,
          'ALIAS_COLLIDES_WITH_CANONICAL_NAME',
          aliasPath,
          'Exercise alias collides with a canonical exercise name.',
        );
      }
    });

    if (!exercise.muscles.some(({ role }) => role === 'primary')) {
      addIssue(
        issues,
        'MISSING_PRIMARY_MUSCLE',
        `${exercisePath}.muscles`,
        'Exercise requires at least one primary muscle contribution.',
      );
    }

    exercise.muscles.forEach((muscle, muscleIndex) => {
      const musclePath = `${exercisePath}.muscles[${muscleIndex}]`;

      if (!muscleSlugs.has(muscle.muscleSlug)) {
        addIssue(
          issues,
          'UNKNOWN_MUSCLE',
          `${musclePath}.muscleSlug`,
          'Muscle does not exist in this catalog.',
        );
      }

      if (!validMuscleRoles.has(muscle.role)) {
        addIssue(
          issues,
          'INVALID_MUSCLE_ROLE',
          `${musclePath}.role`,
          'Muscle role is not supported by the database taxonomy.',
        );
      }

      if (
        !Number.isFinite(muscle.contribution) ||
        muscle.contribution <= 0 ||
        muscle.contribution > 1
      ) {
        addIssue(
          issues,
          'INVALID_MUSCLE_CONTRIBUTION',
          `${musclePath}.contribution`,
          'Muscle contribution must be greater than 0 and at most 1.',
        );
      }
    });

    exercise.equipment.forEach((equipment, equipmentIndex) => {
      const equipmentPath = `${exercisePath}.equipment[${equipmentIndex}]`;

      if (!equipmentSlugs.has(equipment.equipmentSlug)) {
        addIssue(
          issues,
          'UNKNOWN_EQUIPMENT',
          `${equipmentPath}.equipmentSlug`,
          'Equipment does not exist in this catalog.',
        );
      }

      if (!validEquipmentRequirements.has(equipment.requirement)) {
        addIssue(
          issues,
          'INVALID_EQUIPMENT_REQUIREMENT',
          `${equipmentPath}.requirement`,
          'Equipment requirement must be required or optional.',
        );
      }
    });
  });

  const substitutionEdges = new Set<string>();

  payload.substitutions.forEach((substitution, substitutionIndex) => {
    const substitutionPath = `substitutions[${substitutionIndex}]`;
    const edge = `${substitution.sourceExerciseSlug}->${substitution.substituteExerciseSlug}`;

    if (
      !exerciseSlugs.has(substitution.sourceExerciseSlug) ||
      !exerciseSlugs.has(substitution.substituteExerciseSlug)
    ) {
      addIssue(
        issues,
        'UNKNOWN_SUBSTITUTION_EXERCISE',
        substitutionPath,
        'Substitution references an exercise outside this catalog.',
      );
    }

    if (substitution.sourceExerciseSlug === substitution.substituteExerciseSlug) {
      addIssue(
        issues,
        'SELF_SUBSTITUTION',
        substitutionPath,
        'An exercise cannot substitute itself.',
      );
    }

    if (substitutionEdges.has(edge)) {
      addIssue(
        issues,
        'DUPLICATE_SUBSTITUTION_EDGE',
        substitutionPath,
        'Directed substitution edge is duplicated.',
      );
    }
    substitutionEdges.add(edge);

    if (
      !Number.isFinite(substitution.compatibilityScore) ||
      substitution.compatibilityScore <= 0 ||
      substitution.compatibilityScore > 1
    ) {
      addIssue(
        issues,
        'INVALID_SUBSTITUTION_COMPATIBILITY',
        `${substitutionPath}.compatibilityScore`,
        'Substitution compatibility must be greater than 0 and at most 1.',
      );
    }
  });

  return issues;
}

function validateReferenceSlugs(
  collectionName: 'muscles' | 'equipment' | 'exerciseFamilies',
  records: readonly ExerciseCatalogReferenceRecord[],
  issues: ExerciseCatalogValidationIssue[],
): void {
  const slugs = new Set<string>();

  records.forEach((record, index) => {
    const path = `${collectionName}[${index}].slug`;

    if (!slugPattern.test(record.slug)) {
      addIssue(issues, 'INVALID_SLUG', path, 'Reference slug is invalid.');
    }

    if (slugs.has(record.slug)) {
      addIssue(issues, 'DUPLICATE_REFERENCE_SLUG', path, 'Reference slug is duplicated.');
    }
    slugs.add(record.slug);
  });
}

function addIssue(
  issues: ExerciseCatalogValidationIssue[],
  code: ExerciseCatalogValidationCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}
