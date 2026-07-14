import { describe, expect, it } from 'vitest';
import {
  normalizeExerciseAlias,
  parseVersionIdentifier,
  validateExerciseCatalogImport,
  type ExerciseCatalogImport,
  type ExerciseEquipmentRequirement,
  type ExerciseImportRecord,
  type ExerciseMuscleRole,
  type ExerciseSubstitutionImportRecord,
} from './index';

const contractVersionResult = parseVersionIdentifier('exercise-catalog-v1', 'contract');

if (!contractVersionResult.ok) {
  throw new Error('The exercise catalog fixture contract version must be valid.');
}

const contractVersion = contractVersionResult.value;

describe('exercise catalog validation', () => {
  it('accepts a small valid catalog', () => {
    expect(validateExerciseCatalogImport(validCatalog())).toEqual([]);
  });

  it('normalizes aliases consistently', () => {
    expect(normalizeExerciseAlias('  Flat   BENCH Press ')).toBe('flat bench press');
  });

  it('rejects invalid and duplicate reference slugs', () => {
    const catalog = validCatalog();
    const invalidCatalog: ExerciseCatalogImport = {
      ...catalog,
      payload: {
        ...catalog.payload,
        muscles: [
          ...catalog.payload.muscles,
          { slug: 'chest', name: 'Duplicate chest', isActive: true },
          { slug: 'Invalid Slug', name: 'Invalid', isActive: true },
        ],
      },
    };

    expect(issueCodes(invalidCatalog)).toEqual(
      expect.arrayContaining(['DUPLICATE_REFERENCE_SLUG', 'INVALID_SLUG']),
    );
  });

  it('rejects duplicate canonical exercise slugs', () => {
    const catalog = validCatalog();
    const duplicate = replaceExercise(catalog, 1, { slug: 'barbell-bench-press' });

    expect(issueCodes(duplicate)).toContain('DUPLICATE_CANONICAL_SLUG');
  });

  it('rejects invalid canonical exercise slugs', () => {
    const catalog = replaceExercise(validCatalog(), 0, { slug: 'Barbell Bench Press' });

    expect(issueCodes(catalog)).toContain('INVALID_SLUG');
  });

  it('rejects duplicate normalized aliases', () => {
    const catalog = replaceExercise(validCatalog(), 0, {
      aliases: ['flat bench press', '  FLAT   BENCH PRESS '],
    });

    expect(issueCodes(catalog)).toContain('DUPLICATE_NORMALIZED_ALIAS');
  });

  it('rejects aliases colliding with canonical names', () => {
    const catalog = replaceExercise(validCatalog(), 0, {
      aliases: ['Close-Grip Bench Press'],
    });

    expect(issueCodes(catalog)).toContain('ALIAS_COLLIDES_WITH_CANONICAL_NAME');
  });

  it('rejects a missing exercise family', () => {
    const catalog = replaceExercise(validCatalog(), 0, {
      exerciseFamilySlug: 'unknown-family',
    });

    expect(issueCodes(catalog)).toContain('MISSING_EXERCISE_FAMILY');
  });

  it('rejects missing and invalid muscle data', () => {
    const catalog = replaceExercise(validCatalog(), 0, {
      muscles: [
        {
          muscleSlug: 'unknown-muscle',
          role: 'invalid' as ExerciseMuscleRole,
          contribution: 0,
        },
      ],
    });

    expect(issueCodes(catalog)).toEqual(
      expect.arrayContaining([
        'UNKNOWN_MUSCLE',
        'MISSING_PRIMARY_MUSCLE',
        'INVALID_MUSCLE_ROLE',
        'INVALID_MUSCLE_CONTRIBUTION',
      ]),
    );
  });

  it.each([0, -0.1, 1.1, Number.NaN])('rejects invalid muscle contribution %s', (contribution) => {
    const catalog = replaceExercise(validCatalog(), 0, {
      muscles: [{ muscleSlug: 'chest', role: 'primary', contribution }],
    });

    expect(issueCodes(catalog)).toContain('INVALID_MUSCLE_CONTRIBUTION');
  });

  it('rejects unknown equipment and invalid requirement values', () => {
    const catalog = replaceExercise(validCatalog(), 0, {
      equipment: [
        {
          equipmentSlug: 'unknown-equipment',
          requirement: 'sometimes' as ExerciseEquipmentRequirement,
        },
      ],
    });

    expect(issueCodes(catalog)).toEqual(
      expect.arrayContaining(['UNKNOWN_EQUIPMENT', 'INVALID_EQUIPMENT_REQUIREMENT']),
    );
  });

  it('rejects substitutions referencing unknown exercises', () => {
    const catalog = replaceSubstitutions(validCatalog(), [
      {
        ...validCatalog().payload.substitutions[0],
        sourceExerciseSlug: 'unknown-exercise',
      } as ExerciseSubstitutionImportRecord,
    ]);

    expect(issueCodes(catalog)).toContain('UNKNOWN_SUBSTITUTION_EXERCISE');
  });

  it('rejects self-substitution', () => {
    const catalog = replaceSubstitutions(validCatalog(), [
      {
        ...validCatalog().payload.substitutions[0],
        substituteExerciseSlug: 'barbell-bench-press',
      } as ExerciseSubstitutionImportRecord,
    ]);

    expect(issueCodes(catalog)).toContain('SELF_SUBSTITUTION');
  });

  it('rejects duplicate directed substitution edges', () => {
    const catalog = validCatalog();
    const substitution = catalog.payload.substitutions[0];

    if (!substitution) {
      throw new Error('The valid catalog fixture requires a substitution.');
    }

    const duplicate = replaceSubstitutions(catalog, [substitution, { ...substitution }]);

    expect(issueCodes(duplicate)).toContain('DUPLICATE_SUBSTITUTION_EDGE');
  });

  it.each([0, -0.1, 1.1, Number.POSITIVE_INFINITY])(
    'rejects invalid substitution compatibility %s',
    (compatibilityScore) => {
      const catalog = validCatalog();
      const substitution = catalog.payload.substitutions[0];

      if (!substitution) {
        throw new Error('The valid catalog fixture requires a substitution.');
      }

      const invalidCatalog = replaceSubstitutions(catalog, [
        { ...substitution, compatibilityScore },
      ]);

      expect(issueCodes(invalidCatalog)).toContain('INVALID_SUBSTITUTION_COMPATIBILITY');
    },
  );
});

function validCatalog(): ExerciseCatalogImport {
  return {
    contractVersion,
    payload: {
      muscles: [
        { slug: 'chest', name: 'Chest', isActive: true },
        { slug: 'triceps', name: 'Triceps', isActive: true },
      ],
      equipment: [{ slug: 'barbell', name: 'Barbell', isActive: true }],
      exerciseFamilies: [{ slug: 'horizontal-press', name: 'Horizontal press', isActive: true }],
      exercises: [
        {
          slug: 'barbell-bench-press',
          name: 'Barbell Bench Press',
          aliases: ['flat barbell bench press'],
          exerciseFamilySlug: 'horizontal-press',
          version: 1,
          isActive: true,
          muscles: [
            { muscleSlug: 'chest', role: 'primary', contribution: 1 },
            { muscleSlug: 'triceps', role: 'secondary', contribution: 0.5 },
          ],
          equipment: [{ equipmentSlug: 'barbell', requirement: 'required' }],
        },
        {
          slug: 'close-grip-bench-press',
          name: 'Close-Grip Bench Press',
          aliases: ['narrow-grip bench press'],
          exerciseFamilySlug: 'horizontal-press',
          version: 1,
          isActive: true,
          muscles: [
            { muscleSlug: 'triceps', role: 'primary', contribution: 1 },
            { muscleSlug: 'chest', role: 'secondary', contribution: 0.5 },
          ],
          equipment: [{ equipmentSlug: 'barbell', requirement: 'required' }],
        },
      ],
      substitutions: [
        {
          sourceExerciseSlug: 'barbell-bench-press',
          substituteExerciseSlug: 'close-grip-bench-press',
          reasonCode: 'similar_equipment_and_pattern',
          compatibilityScore: 0.8,
          isActive: true,
        },
      ],
    },
  };
}

function replaceExercise(
  catalog: ExerciseCatalogImport,
  index: number,
  replacement: Partial<ExerciseImportRecord>,
): ExerciseCatalogImport {
  return {
    ...catalog,
    payload: {
      ...catalog.payload,
      exercises: catalog.payload.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, ...replacement } : exercise,
      ),
    },
  };
}

function replaceSubstitutions(
  catalog: ExerciseCatalogImport,
  substitutions: readonly ExerciseSubstitutionImportRecord[],
): ExerciseCatalogImport {
  return { ...catalog, payload: { ...catalog.payload, substitutions } };
}

function issueCodes(catalog: ExerciseCatalogImport): readonly string[] {
  return validateExerciseCatalogImport(catalog).map(({ code }) => code);
}
