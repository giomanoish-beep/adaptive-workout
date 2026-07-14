import { describe, expect, it } from 'vitest';
import {
  prepareExerciseCatalogImport,
  productionExerciseCatalog,
  productionExerciseCatalogSeedSql,
  productionExerciseCatalogStatistics,
  renderExerciseCatalogSeedSql,
  validateExerciseCatalogImport,
} from './index';

describe('production exercise catalog', () => {
  it('passes deterministic validation with stable import output', () => {
    expect(validateExerciseCatalogImport(productionExerciseCatalog)).toEqual([]);

    const firstPlan = prepareExerciseCatalogImport(productionExerciseCatalog);
    const secondPlan = prepareExerciseCatalogImport(productionExerciseCatalog);

    expect(firstPlan).toEqual(secondPlan);
    expect(firstPlan.ok).toBe(true);
    if (firstPlan.ok) {
      expect(renderExerciseCatalogSeedSql(firstPlan.value)).toBe(productionExerciseCatalogSeedSql);
    }
  });

  it('prevents accidental catalog shrinkage and count inflation', () => {
    expect(productionExerciseCatalogStatistics).toMatchObject({
      muscleCount: 18,
      equipmentCount: 12,
      exerciseFamilyCount: 31,
      exerciseCount: 140,
      substitutionCount: 50,
    });
    expect(productionExerciseCatalogStatistics.exerciseCount).toBeGreaterThanOrEqual(120);
    expect(productionExerciseCatalogStatistics.exerciseCount).toBeLessThanOrEqual(160);
  });

  it('provides balanced major-area coverage', () => {
    expect(productionExerciseCatalogStatistics.exercisesByMajorArea).toEqual({
      chest: 16,
      back: 24,
      shoulders: 18,
      arms: 28,
      'lower-body': 42,
      core: 12,
    });
  });

  it('supports dumbbell-only chest candidate selection', () => {
    const availableEquipment = new Set(['dumbbell', 'bench', 'bodyweight']);
    const candidates = productionExerciseCatalog.payload.exercises.filter(
      (catalogExercise) =>
        hasPrimaryMuscle(catalogExercise.slug, 'chest') &&
        catalogExercise.equipment.every(({ equipmentSlug }) =>
          availableEquipment.has(equipmentSlug),
        ),
    );

    expect(candidates.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining([
        'dumbbell-bench-press',
        'incline-dumbbell-bench-press',
        'dumbbell-chest-fly',
        'push-up',
      ]),
    );
  });

  it('supports cable-focused back candidate selection', () => {
    const backMuscles = new Set(['lats', 'upper-back', 'traps']);
    const candidates = productionExerciseCatalog.payload.exercises.filter(
      (catalogExercise) =>
        catalogExercise.equipment.every(({ equipmentSlug }) => equipmentSlug === 'cable') &&
        catalogExercise.muscles.some(
          ({ role, muscleSlug }) => role === 'primary' && backMuscles.has(muscleSlug),
        ),
    );

    expect(candidates.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining([
        'lat-pulldown',
        'single-arm-lat-pulldown',
        'seated-cable-row',
        'single-arm-cable-row',
        'cable-pullover',
      ]),
    );
  });

  it('provides Smith and bench-unavailable pressing paths', () => {
    expect(hasSubstitution('barbell-bench-press', 'smith-bench-press')).toBe(true);
    expect(hasSubstitution('barbell-bench-press', 'plate-loaded-chest-press')).toBe(true);
    expect(hasSubstitution('barbell-overhead-press', 'smith-machine-overhead-press')).toBe(true);
  });

  it('provides squat, leg-press, and posterior-chain alternatives', () => {
    expect(hasSubstitution('barbell-back-squat', 'smith-machine-squat')).toBe(true);
    expect(hasSubstitution('leg-press', 'hack-squat')).toBe(true);
    expect(hasSubstitution('hack-squat', 'leg-press')).toBe(true);
    expect(hasSubstitution('barbell-romanian-deadlift', 'dumbbell-romanian-deadlift')).toBe(true);

    const posteriorFamilies = new Set(['hip-hinge', 'hip-extension', 'knee-flexion']);
    const posteriorExercises = productionExerciseCatalog.payload.exercises.filter(
      ({ exerciseFamilySlug }) => posteriorFamilies.has(exerciseFamilySlug),
    );

    expect(posteriorExercises.length).toBeGreaterThanOrEqual(18);
  });

  it('contains all required taxonomy references', () => {
    expect(productionExerciseCatalog.payload.muscles.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining([
        'chest',
        'lats',
        'upper-back',
        'traps',
        'front-delts',
        'side-delts',
        'rear-delts',
        'biceps',
        'triceps',
        'forearms',
        'quadriceps',
        'hamstrings',
        'glutes',
        'calves',
        'abs',
        'spinal-erectors',
        'adductors',
        'abductors',
      ]),
    );
    expect(productionExerciseCatalog.payload.equipment.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining([
        'bodyweight',
        'barbell',
        'dumbbell',
        'cable',
        'smith-machine',
        'selectorized-machine',
        'plate-loaded-machine',
        'bench',
        'pull-up-station',
        'dip-station',
        'leg-press',
        'hack-squat',
      ]),
    );
  });

  it('covers every required movement pattern', () => {
    expect(productionExerciseCatalog.payload.exerciseFamilies.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining([
        'horizontal-press',
        'incline-press',
        'vertical-press',
        'horizontal-pull',
        'vertical-pull',
        'knee-dominant-squat',
        'hip-hinge',
        'hip-extension',
        'knee-flexion',
        'knee-extension',
        'elbow-flexion',
        'elbow-extension',
        'shoulder-abduction',
        'rear-delt',
        'calf-raise',
        'trunk-flexion',
        'anti-extension',
        'anti-rotation',
        'trunk-rotation',
      ]),
    );
  });

  it('preserves representative substitution paths for common gym constraints', () => {
    const requiredPaths = [
      ['barbell-bench-press', 'dumbbell-bench-press'],
      ['incline-barbell-bench-press', 'incline-smith-bench-press'],
      ['barbell-overhead-press', 'smith-machine-overhead-press'],
      ['lat-pulldown', 'plate-loaded-lat-pulldown'],
      ['pull-up', 'lat-pulldown'],
      ['seated-cable-row', 'selectorized-seated-row'],
      ['barbell-bent-over-row', 'one-arm-dumbbell-row'],
      ['barbell-back-squat', 'smith-machine-squat'],
      ['leg-press', 'hack-squat'],
      ['hack-squat', 'leg-press'],
      ['barbell-romanian-deadlift', 'dumbbell-romanian-deadlift'],
      ['barbell-hip-thrust', 'smith-machine-hip-thrust'],
      ['selectorized-leg-extension', 'cable-leg-extension'],
      ['selectorized-seated-leg-curl', 'cable-leg-curl'],
      ['dumbbell-lateral-raise', 'cable-lateral-raise'],
      ['barbell-curl', 'standing-cable-curl'],
      ['cable-triceps-pushdown', 'selectorized-triceps-extension'],
    ] as const;

    requiredPaths.forEach(([sourceExerciseSlug, substituteExerciseSlug]) => {
      expect(hasSubstitution(sourceExerciseSlug, substituteExerciseSlug)).toBe(true);
    });
  });

  it('keeps hip-dominant lower-body options available independently of squat patterns', () => {
    const hipDominantFamilies = new Set(['hip-hinge', 'hip-extension']);
    const candidates = productionExerciseCatalog.payload.exercises.filter(
      ({ exerciseFamilySlug }) => hipDominantFamilies.has(exerciseFamilySlug),
    );

    expect(candidates.map(({ slug }) => slug)).toEqual(
      expect.arrayContaining([
        'barbell-romanian-deadlift',
        'dumbbell-romanian-deadlift',
        'barbell-hip-thrust',
        'cable-pull-through',
        'back-extension',
      ]),
    );
  });
});

function hasPrimaryMuscle(exerciseSlug: string, muscleSlug: string): boolean {
  return (
    productionExerciseCatalog.payload.exercises
      .find(({ slug }) => slug === exerciseSlug)
      ?.muscles.some((muscle) => muscle.role === 'primary' && muscle.muscleSlug === muscleSlug) ??
    false
  );
}

function hasSubstitution(sourceExerciseSlug: string, substituteExerciseSlug: string): boolean {
  return productionExerciseCatalog.payload.substitutions.some(
    (substitution) =>
      substitution.sourceExerciseSlug === sourceExerciseSlug &&
      substitution.substituteExerciseSlug === substituteExerciseSlug,
  );
}
