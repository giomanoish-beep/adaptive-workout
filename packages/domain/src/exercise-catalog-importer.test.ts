import { describe, expect, it, vi } from 'vitest';
import {
  importExerciseCatalog,
  parseVersionIdentifier,
  prepareExerciseCatalogImport,
  summarizeExerciseCatalogImport,
  validateExerciseCatalogImport,
  type ExerciseCatalogImport,
  type ExerciseCatalogImportTarget,
} from './index';

const contractVersionResult = parseVersionIdentifier('exercise-catalog-v1', 'contract');

if (!contractVersionResult.ok) {
  throw new Error('The exercise catalog importer fixture contract version must be valid.');
}

const contractVersion = contractVersionResult.value;

describe('exercise catalog importer', () => {
  it('prepares a deterministic relational plan from a valid catalog', () => {
    const catalog = validCatalog();

    expect(validateExerciseCatalogImport(catalog)).toEqual([]);

    const prepared = prepareExerciseCatalogImport(catalog);

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    expect(prepared.value.muscles.map(({ slug }) => slug)).toEqual(['chest', 'triceps']);
    expect(prepared.value.equipment.map(({ slug }) => slug)).toEqual(['bench', 'dumbbell']);
    expect(prepared.value.exercises.map(({ slug }) => slug)).toEqual([
      'dumbbell-bench-press',
      'dumbbell-floor-press',
    ]);
    expect(prepared.value.exerciseMuscles).toEqual([
      {
        exerciseSlug: 'dumbbell-bench-press',
        muscleSlug: 'chest',
        role: 'primary',
        contribution: 1,
      },
      {
        exerciseSlug: 'dumbbell-bench-press',
        muscleSlug: 'triceps',
        role: 'secondary',
        contribution: 0.5,
      },
      {
        exerciseSlug: 'dumbbell-floor-press',
        muscleSlug: 'chest',
        role: 'primary',
        contribution: 1,
      },
    ]);
    expect(prepared.value.exerciseEquipment).toEqual([
      {
        exerciseSlug: 'dumbbell-bench-press',
        equipmentSlug: 'bench',
        requirement: 'required',
      },
      {
        exerciseSlug: 'dumbbell-bench-press',
        equipmentSlug: 'dumbbell',
        requirement: 'required',
      },
      {
        exerciseSlug: 'dumbbell-floor-press',
        equipmentSlug: 'dumbbell',
        requirement: 'required',
      },
    ]);
    expect(prepared.value.exerciseSubstitutions).toEqual([
      {
        sourceExerciseSlug: 'dumbbell-bench-press',
        substituteExerciseSlug: 'dumbbell-floor-press',
        reasonCode: 'bench_unavailable',
        compatibilityScore: 0.85,
        isActive: true,
      },
    ]);
    expect(prepared.value.exercises[0]).not.toHaveProperty('aliases');
  });

  it('produces the same plan for differently ordered source arrays', () => {
    const catalog = validCatalog();
    const reordered: ExerciseCatalogImport = {
      ...catalog,
      payload: {
        ...catalog.payload,
        muscles: [...catalog.payload.muscles].reverse(),
        equipment: [...catalog.payload.equipment].reverse(),
        exercises: [...catalog.payload.exercises].reverse(),
      },
    };

    expect(prepareExerciseCatalogImport(reordered)).toEqual(prepareExerciseCatalogImport(catalog));
  });

  it('does not call the target when validation fails', async () => {
    const catalog = validCatalog();
    const invalidCatalog: ExerciseCatalogImport = {
      ...catalog,
      payload: {
        ...catalog.payload,
        exercises: [catalog.payload.exercises[0]!, catalog.payload.exercises[0]!],
      },
    };
    const applyCatalogImport = vi.fn<ExerciseCatalogImportTarget['applyCatalogImport']>();

    const result = await importExerciseCatalog(invalidCatalog, { applyCatalogImport });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details?.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'DUPLICATE_CANONICAL_SLUG' })]),
      );
    }
    expect(applyCatalogImport).not.toHaveBeenCalled();
  });

  it('delegates one validated plan and returns catalog counts', async () => {
    const applyCatalogImport = vi.fn<ExerciseCatalogImportTarget['applyCatalogImport']>();
    applyCatalogImport.mockResolvedValue(undefined);
    const catalog = validCatalog();

    const result = await importExerciseCatalog(catalog, { applyCatalogImport });

    expect(result).toEqual({ ok: true, value: summarizeExerciseCatalogImport(catalog) });
    expect(applyCatalogImport).toHaveBeenCalledTimes(1);
    expect(applyCatalogImport.mock.calls[0]?.[0].contractVersion).toBe(contractVersion);
    expect(applyCatalogImport.mock.calls[0]?.[0].exerciseSubstitutions).toHaveLength(1);
  });

  it('propagates target failures without reporting a successful import', async () => {
    const targetFailure = new Error('transaction rolled back');
    const target: ExerciseCatalogImportTarget = {
      applyCatalogImport: vi.fn().mockRejectedValue(targetFailure),
    };

    await expect(importExerciseCatalog(validCatalog(), target)).rejects.toBe(targetFailure);
  });
});

function validCatalog(): ExerciseCatalogImport {
  return {
    contractVersion,
    payload: {
      muscles: [
        { slug: 'triceps', name: 'Triceps', isActive: true },
        { slug: 'chest', name: 'Chest', isActive: true },
      ],
      equipment: [
        { slug: 'dumbbell', name: 'Dumbbell', isActive: true },
        { slug: 'bench', name: 'Bench', isActive: true },
      ],
      exerciseFamilies: [{ slug: 'horizontal-press', name: 'Horizontal press', isActive: true }],
      exercises: [
        {
          slug: 'dumbbell-floor-press',
          name: 'Dumbbell Floor Press',
          aliases: ['floor dumbbell press'],
          exerciseFamilySlug: 'horizontal-press',
          version: 1,
          isActive: true,
          muscles: [{ muscleSlug: 'chest', role: 'primary', contribution: 1 }],
          equipment: [{ equipmentSlug: 'dumbbell', requirement: 'required' }],
        },
        {
          slug: 'dumbbell-bench-press',
          name: 'Dumbbell Bench Press',
          aliases: ['flat dumbbell press'],
          exerciseFamilySlug: 'horizontal-press',
          version: 1,
          isActive: true,
          muscles: [
            { muscleSlug: 'chest', role: 'primary', contribution: 1 },
            { muscleSlug: 'triceps', role: 'secondary', contribution: 0.5 },
          ],
          equipment: [
            { equipmentSlug: 'dumbbell', requirement: 'required' },
            { equipmentSlug: 'bench', requirement: 'required' },
          ],
        },
      ],
      substitutions: [
        {
          sourceExerciseSlug: 'dumbbell-bench-press',
          substituteExerciseSlug: 'dumbbell-floor-press',
          reasonCode: 'bench_unavailable',
          compatibilityScore: 0.85,
          isActive: true,
        },
      ],
    },
  };
}
