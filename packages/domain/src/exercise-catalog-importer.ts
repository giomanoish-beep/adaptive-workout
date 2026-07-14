import { domainError, failure, success, type DomainResult } from './errors.js';
import {
  validateExerciseCatalogImport,
  type ExerciseCatalogImport,
  type ExerciseCatalogReferenceRecord,
  type ExerciseCatalogValidationIssue,
  type ExerciseEquipmentRequirement,
  type ExerciseMuscleRole,
} from './exercise-catalog.js';
import type { ContractVersion } from './versions.js';

export interface ExerciseCatalogImportPlan {
  readonly contractVersion: ContractVersion;
  readonly muscles: readonly ExerciseCatalogReferenceRecord[];
  readonly equipment: readonly ExerciseCatalogReferenceRecord[];
  readonly exerciseFamilies: readonly ExerciseCatalogReferenceRecord[];
  readonly exercises: readonly ExerciseCatalogExerciseRow[];
  readonly exerciseMuscles: readonly ExerciseCatalogMuscleRow[];
  readonly exerciseEquipment: readonly ExerciseCatalogEquipmentRow[];
  readonly exerciseSubstitutions: readonly ExerciseCatalogSubstitutionRow[];
}

export interface ExerciseCatalogExerciseRow {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly version: number;
  readonly isActive: boolean;
  readonly exerciseFamilySlug: string;
}

export interface ExerciseCatalogMuscleRow {
  readonly exerciseSlug: string;
  readonly muscleSlug: string;
  readonly role: ExerciseMuscleRole;
  readonly contribution: number;
}

export interface ExerciseCatalogEquipmentRow {
  readonly exerciseSlug: string;
  readonly equipmentSlug: string;
  readonly requirement: ExerciseEquipmentRequirement;
}

export interface ExerciseCatalogSubstitutionRow {
  readonly sourceExerciseSlug: string;
  readonly substituteExerciseSlug: string;
  readonly reasonCode: string;
  readonly compatibilityScore: number;
  readonly notes?: string;
  readonly isActive: boolean;
}

export interface ExerciseCatalogImportSummary {
  readonly muscleCount: number;
  readonly equipmentCount: number;
  readonly exerciseFamilyCount: number;
  readonly exerciseCount: number;
  readonly aliasCount: number;
  readonly exerciseMuscleCount: number;
  readonly exerciseEquipmentCount: number;
  readonly substitutionCount: number;
}

export interface ExerciseCatalogImportTarget {
  applyCatalogImport(plan: ExerciseCatalogImportPlan): Promise<void>;
}

export function prepareExerciseCatalogImport(
  catalog: ExerciseCatalogImport,
): DomainResult<ExerciseCatalogImportPlan, 'VALIDATION_ERROR'> {
  const issues = validateExerciseCatalogImport(catalog);

  if (issues.length > 0) {
    return invalidCatalog(issues);
  }

  const exercises = [...catalog.payload.exercises].sort(compareBySlug);

  return success({
    contractVersion: catalog.contractVersion,
    muscles: sortReferences(catalog.payload.muscles),
    equipment: sortReferences(catalog.payload.equipment),
    exerciseFamilies: sortReferences(catalog.payload.exerciseFamilies),
    exercises: exercises.map(
      ({ slug, name, description, version, isActive, exerciseFamilySlug }) => ({
        slug,
        name,
        ...(description === undefined ? {} : { description }),
        version,
        isActive,
        exerciseFamilySlug,
      }),
    ),
    exerciseMuscles: exercises
      .flatMap((exercise) =>
        exercise.muscles.map((muscle) => ({ exerciseSlug: exercise.slug, ...muscle })),
      )
      .sort(
        (left, right) =>
          compareText(left.exerciseSlug, right.exerciseSlug) ||
          compareText(left.muscleSlug, right.muscleSlug) ||
          compareText(left.role, right.role),
      ),
    exerciseEquipment: exercises
      .flatMap((exercise) =>
        exercise.equipment.map((equipment) => ({ exerciseSlug: exercise.slug, ...equipment })),
      )
      .sort(
        (left, right) =>
          compareText(left.exerciseSlug, right.exerciseSlug) ||
          compareText(left.equipmentSlug, right.equipmentSlug),
      ),
    exerciseSubstitutions: [...catalog.payload.substitutions].sort(
      (left, right) =>
        compareText(left.sourceExerciseSlug, right.sourceExerciseSlug) ||
        compareText(left.substituteExerciseSlug, right.substituteExerciseSlug) ||
        compareText(left.reasonCode, right.reasonCode),
    ),
  });
}

export async function importExerciseCatalog(
  catalog: ExerciseCatalogImport,
  target: ExerciseCatalogImportTarget,
): Promise<DomainResult<ExerciseCatalogImportSummary, 'VALIDATION_ERROR'>> {
  const prepared = prepareExerciseCatalogImport(catalog);

  if (!prepared.ok) {
    return prepared;
  }

  await target.applyCatalogImport(prepared.value);

  return success(summarizeExerciseCatalogImport(catalog));
}

export function summarizeExerciseCatalogImport(
  catalog: ExerciseCatalogImport,
): ExerciseCatalogImportSummary {
  return {
    muscleCount: catalog.payload.muscles.length,
    equipmentCount: catalog.payload.equipment.length,
    exerciseFamilyCount: catalog.payload.exerciseFamilies.length,
    exerciseCount: catalog.payload.exercises.length,
    aliasCount: catalog.payload.exercises.reduce(
      (count, exercise) => count + exercise.aliases.length,
      0,
    ),
    exerciseMuscleCount: catalog.payload.exercises.reduce(
      (count, exercise) => count + exercise.muscles.length,
      0,
    ),
    exerciseEquipmentCount: catalog.payload.exercises.reduce(
      (count, exercise) => count + exercise.equipment.length,
      0,
    ),
    substitutionCount: catalog.payload.substitutions.length,
  };
}

export function renderExerciseCatalogSeedSql(plan: ExerciseCatalogImportPlan): string {
  return [
    '-- Generated from packages/domain/src/exercise-catalog-data.ts.',
    '-- Regenerate through the deterministic exercise catalog importer; do not edit manually.',
    '',
    renderReferenceInsert('muscles', plan.muscles),
    renderReferenceInsert('equipment', plan.equipment),
    renderReferenceInsert('exercise_families', plan.exerciseFamilies),
    renderExerciseInsert(plan.exercises),
    renderExerciseMuscleInsert(plan.exerciseMuscles),
    renderExerciseEquipmentInsert(plan.exerciseEquipment),
    renderExerciseSubstitutionInsert(plan.exerciseSubstitutions),
    '',
  ].join('\n');
}

function invalidCatalog(
  issues: readonly ExerciseCatalogValidationIssue[],
): DomainResult<never, 'VALIDATION_ERROR'> {
  return failure(
    domainError('VALIDATION_ERROR', 'Exercise catalog import validation failed.', { issues }),
  );
}

function sortReferences(
  records: readonly ExerciseCatalogReferenceRecord[],
): readonly ExerciseCatalogReferenceRecord[] {
  return [...records].sort(compareBySlug);
}

function compareBySlug(left: { readonly slug: string }, right: { readonly slug: string }): number {
  return compareText(left.slug, right.slug);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function renderReferenceInsert(
  table: 'muscles' | 'equipment' | 'exercise_families',
  rows: readonly ExerciseCatalogReferenceRecord[],
): string {
  const values = rows
    .map(
      ({ slug, name, description, isActive }) =>
        `  (${sqlText(slug)}, ${sqlText(name)}, ${sqlNullableText(description)}, ${sqlBoolean(isActive)})`,
    )
    .join(',\n');

  return `insert into public.${table} (slug, name, description, is_active)\nvalues\n${values}\non conflict (slug) do update set\n  name = excluded.name,\n  description = excluded.description,\n  is_active = excluded.is_active;\n`;
}

function renderExerciseInsert(rows: readonly ExerciseCatalogExerciseRow[]): string {
  const values = rows
    .map(
      ({ exerciseFamilySlug, slug, name, description, version, isActive }) =>
        `    (${sqlText(exerciseFamilySlug)}, ${sqlText(slug)}, ${sqlText(name)}, ${sqlNullableText(description)}, ${version}, ${sqlBoolean(isActive)})`,
    )
    .join(',\n');

  return `insert into public.exercises (\n  exercise_family_id,\n  slug,\n  name,\n  description,\n  version,\n  is_active\n)\nselect\n  exercise_families.id,\n  source.slug,\n  source.name,\n  source.description,\n  source.version,\n  source.is_active\nfrom (\n  values\n${values}\n) as source(family_slug, slug, name, description, version, is_active)\njoin public.exercise_families on exercise_families.slug = source.family_slug\non conflict (slug) do update set\n  exercise_family_id = excluded.exercise_family_id,\n  name = excluded.name,\n  description = excluded.description,\n  version = excluded.version,\n  is_active = excluded.is_active;\n`;
}

function renderExerciseMuscleInsert(rows: readonly ExerciseCatalogMuscleRow[]): string {
  const values = rows
    .map(
      ({ exerciseSlug, muscleSlug, role, contribution }) =>
        `    (${sqlText(exerciseSlug)}, ${sqlText(muscleSlug)}, ${sqlText(role)}, ${contribution})`,
    )
    .join(',\n');

  return `insert into public.exercise_muscles (exercise_id, muscle_id, role, contribution)\nselect exercises.id, muscles.id, source.role, source.contribution\nfrom (\n  values\n${values}\n) as source(exercise_slug, muscle_slug, role, contribution)\njoin public.exercises on exercises.slug = source.exercise_slug\njoin public.muscles on muscles.slug = source.muscle_slug\non conflict (exercise_id, muscle_id) do update set\n  role = excluded.role,\n  contribution = excluded.contribution;\n`;
}

function renderExerciseEquipmentInsert(rows: readonly ExerciseCatalogEquipmentRow[]): string {
  const values = rows
    .map(
      ({ exerciseSlug, equipmentSlug, requirement }) =>
        `    (${sqlText(exerciseSlug)}, ${sqlText(equipmentSlug)}, ${sqlText(requirement)})`,
    )
    .join(',\n');

  return `insert into public.exercise_equipment (exercise_id, equipment_id, requirement)\nselect exercises.id, equipment.id, source.requirement\nfrom (\n  values\n${values}\n) as source(exercise_slug, equipment_slug, requirement)\njoin public.exercises on exercises.slug = source.exercise_slug\njoin public.equipment on equipment.slug = source.equipment_slug\non conflict (exercise_id, equipment_id) do update set\n  requirement = excluded.requirement;\n`;
}

function renderExerciseSubstitutionInsert(rows: readonly ExerciseCatalogSubstitutionRow[]): string {
  const values = rows
    .map(
      ({
        sourceExerciseSlug,
        substituteExerciseSlug,
        reasonCode,
        compatibilityScore,
        notes,
        isActive,
      }) =>
        `    (${sqlText(sourceExerciseSlug)}, ${sqlText(substituteExerciseSlug)}, ${sqlText(reasonCode)}, ${compatibilityScore}, ${sqlNullableText(notes)}, ${sqlBoolean(isActive)})`,
    )
    .join(',\n');

  return `insert into public.exercise_substitutions (\n  source_exercise_id,\n  substitute_exercise_id,\n  reason_code,\n  compatibility_score,\n  notes,\n  is_active\n)\nselect\n  source_exercise.id,\n  substitute_exercise.id,\n  source.reason_code,\n  source.compatibility_score,\n  source.notes,\n  source.is_active\nfrom (\n  values\n${values}\n) as source(\n  source_exercise_slug,\n  substitute_exercise_slug,\n  reason_code,\n  compatibility_score,\n  notes,\n  is_active\n)\njoin public.exercises as source_exercise\n  on source_exercise.slug = source.source_exercise_slug\njoin public.exercises as substitute_exercise\n  on substitute_exercise.slug = source.substitute_exercise_slug\non conflict (source_exercise_id, substitute_exercise_id) do update set\n  reason_code = excluded.reason_code,\n  compatibility_score = excluded.compatibility_score,\n  notes = excluded.notes,\n  is_active = excluded.is_active;\n`;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullableText(value: string | undefined): string {
  return value === undefined ? 'null' : sqlText(value);
}

function sqlBoolean(value: boolean): string {
  return value ? 'true' : 'false';
}
