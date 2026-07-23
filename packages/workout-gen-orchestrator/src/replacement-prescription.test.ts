import { describe, expect, it } from 'vitest';
import { replaceWorkoutExercise } from './replacement';
import type {
  CatalogExerciseRow,
  CatalogMuscleRow,
  CatalogExerciseMuscleRow,
  CatalogExerciseEquipmentRow,
  CatalogEquipmentRow,
  EquipmentContextMap,
  MuscleIdMap,
  ServerTrainingProfile,
  WorkoutGenerationDependencies,
  CatalogLoader,
  ProfileLoader,
} from './contracts';

const muscleId = 'm-chest';
const muscleSlug = 'chest';

const equipmentContextMap: EquipmentContextMap = {
  'full-gym': [
    'barbell',
    'dumbbell',
    'cable',
    'bench',
    'smith-machine',
    'selectorized-machine',
    'bodyweight',
  ],
};

const muscleIdMap: MuscleIdMap = { chest: 'chest' };

function makeProfile(overrides: Partial<ServerTrainingProfile> = {}): ServerTrainingProfile {
  return {
    goal: 'build_muscle',
    experience: 'intermediate',
    frequency: '3',
    typicalDurationMinutes: 45,
    environment: 'commercial_gym',
    programPreference: 'app_decide',
    hasCurrentDiscomfort: false,
    bodyWeightKg: 75,
    ...overrides,
  };
}

function exerciseRow(id: string, familySlug: string, name: string): CatalogExerciseRow {
  return {
    id,
    slug: id,
    name,
    exerciseFamilyId: `fam-${familySlug}`,
    exerciseFamilySlug: familySlug,
    isActive: true,
    version: 1,
  };
}

function equipmentRow(slug: string): CatalogEquipmentRow {
  return { id: `eq-${slug}`, slug, name: slug, isActive: true };
}

function exerciseEquipment(exerciseId: string, slug: string): CatalogExerciseEquipmentRow {
  return {
    exerciseId,
    equipmentId: `eq-${slug}`,
    equipmentSlug: slug,
    requirement: 'required' as const,
  };
}

interface CatalogSetup {
  readonly exercises: readonly {
    readonly row: CatalogExerciseRow;
    readonly equipmentSlug: string;
  }[];
}

function makeCatalogLoader(setup: CatalogSetup): CatalogLoader {
  const exercises = setup.exercises.map((e) => e.row);
  const muscles: CatalogMuscleRow[] = [
    { id: muscleId, slug: muscleSlug, name: 'Chest', isActive: true },
  ];
  const exerciseMuscles: CatalogExerciseMuscleRow[] = setup.exercises.map((e) => ({
    exerciseId: e.row.id,
    muscleId,
    role: 'primary' as const,
    contribution: 1,
  }));
  const equipmentSlugs = [...new Set(setup.exercises.map((e) => e.equipmentSlug))];
  const equipment: CatalogEquipmentRow[] = equipmentSlugs.map(equipmentRow);
  const exerciseEquipmentRows: CatalogExerciseEquipmentRow[] = setup.exercises.map((e) =>
    exerciseEquipment(e.row.id, e.equipmentSlug),
  );

  return {
    loadActiveCatalog() {
      return Promise.resolve({
        exercises,
        muscles,
        exerciseMuscles,
        exerciseEquipment: exerciseEquipmentRows,
        equipment,
      });
    },
  };
}

function makeProfileLoader(profile: ServerTrainingProfile): ProfileLoader {
  return {
    loadProfile() {
      return Promise.resolve(profile);
    },
  };
}

function makeDeps(
  catalog: CatalogSetup,
  profile: ServerTrainingProfile,
): WorkoutGenerationDependencies {
  return {
    profileLoader: makeProfileLoader(profile),
    catalogLoader: makeCatalogLoader(catalog),
    equipmentContextMap,
    muscleIdMap,
  };
}

function replacementRequest(currentId: string) {
  return {
    action: 'replace_exercise' as const,
    targetMuscles: ['chest'],
    durationMinutes: 45,
    equipmentContext: 'full-gym',
    currentExerciseId: currentId,
    workoutExerciseIds: [currentId],
  };
}

describe('replacement load prescription', () => {
  it('machine to dumbbell: prescription reflects dumbbell base not machine', async () => {
    const result = await replaceWorkoutExercise(
      replacementRequest('ex-machine'),
      'user-1',
      makeDeps(
        {
          exercises: [
            {
              row: exerciseRow('ex-machine', 'chest-press-machine', 'Machine Chest Press'),
              equipmentSlug: 'selectorized-machine',
            },
            {
              row: exerciseRow('ex-dumbbell', 'horizontal-press', 'Dumbbell Bench Press'),
              equipmentSlug: 'dumbbell',
            },
          ],
        },
        makeProfile(),
      ),
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.replacement.loadPrescription.kind).toBe('external_numeric');
    expect(result.replacement.loadPrescription.suggestedLoadKg).toBe(6);
    expect(result.replacement.loadPrescription.incrementKg).toBe(2);
  });

  it('dumbbell to machine: prescription reflects machine base not dumbbell', async () => {
    const result = await replaceWorkoutExercise(
      replacementRequest('ex-dumbbell'),
      'user-1',
      makeDeps(
        {
          exercises: [
            {
              row: exerciseRow('ex-dumbbell', 'horizontal-press', 'Dumbbell Bench Press'),
              equipmentSlug: 'dumbbell',
            },
            {
              row: exerciseRow('ex-machine', 'chest-press-machine', 'Machine Chest Press'),
              equipmentSlug: 'selectorized-machine',
            },
          ],
        },
        makeProfile(),
      ),
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.replacement.loadPrescription.kind).toBe('external_numeric');
    expect(result.replacement.loadPrescription.suggestedLoadKg).toBe(15);
    expect(result.replacement.loadPrescription.incrementKg).toBe(5);
  });

  it('barbell to smith: prescription uses smith multiplier not barbell', async () => {
    const result = await replaceWorkoutExercise(
      replacementRequest('ex-barbell'),
      'user-1',
      makeDeps(
        {
          exercises: [
            {
              row: exerciseRow('ex-barbell', 'horizontal-press', 'Barbell Bench Press'),
              equipmentSlug: 'barbell',
            },
            {
              row: exerciseRow('ex-smith', 'horizontal-press', 'Smith Bench Press'),
              equipmentSlug: 'smith-machine',
            },
          ],
        },
        makeProfile({ experience: 'advanced', bodyWeightKg: 80 }),
      ),
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    const smithExpected = Math.max(Math.round((0.6 * 80 * 0.8 * 0.85) / 2.5) * 2.5, 20);
    expect(result.replacement.loadPrescription.suggestedLoadKg).toBe(smithExpected);
  });

  it('bodyweight to external numeric: kind switches to external_numeric', async () => {
    const result = await replaceWorkoutExercise(
      replacementRequest('ex-bodyweight'),
      'user-1',
      makeDeps(
        {
          exercises: [
            {
              row: exerciseRow('ex-bodyweight', 'horizontal-press', 'Push-up'),
              equipmentSlug: 'bodyweight',
            },
            {
              row: exerciseRow('ex-dumbbell', 'horizontal-press', 'Dumbbell Bench Press'),
              equipmentSlug: 'dumbbell',
            },
          ],
        },
        makeProfile(),
      ),
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.replacement.loadPrescription.kind).toBe('external_numeric');
    expect(result.replacement.loadPrescription.suggestedLoadKg).not.toBeNull();
  });

  it('external load to bodyweight: kind switches to bodyweight', async () => {
    const result = await replaceWorkoutExercise(
      replacementRequest('ex-dumbbell'),
      'user-1',
      makeDeps(
        {
          exercises: [
            {
              row: exerciseRow('ex-dumbbell', 'horizontal-press', 'Dumbbell Bench Press'),
              equipmentSlug: 'dumbbell',
            },
            {
              row: exerciseRow('ex-bodyweight', 'horizontal-press', 'Push-up'),
              equipmentSlug: 'bodyweight',
            },
          ],
        },
        makeProfile(),
      ),
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.replacement.loadPrescription.kind).toBe('bodyweight');
    expect(result.replacement.loadPrescription.suggestedLoadKg).toBeNull();
  });

  it('unknown family with machine equipment returns safe conservative estimate', async () => {
    const result = await replaceWorkoutExercise(
      replacementRequest('ex-known'),
      'user-1',
      makeDeps(
        {
          exercises: [
            {
              row: exerciseRow('ex-known', 'horizontal-press', 'Known Exercise'),
              equipmentSlug: 'dumbbell',
            },
            {
              row: exerciseRow('ex-unknown', 'unknown-family', 'Unknown Exercise'),
              equipmentSlug: 'bench',
            },
          ],
        },
        makeProfile(),
      ),
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.replacement.loadPrescription.kind).toBe('external_numeric');
    expect(result.replacement.loadPrescription.suggestedLoadKg).not.toBeNull();
    expect(result.replacement.loadPrescription.suggestedLoadKg).toBe(10);
    expect(result.replacement.loadPrescription.label).toContain('not standardized');
  });

  it('missing body weight for barbell replacement returns calibration_required', async () => {
    const result = await replaceWorkoutExercise(
      replacementRequest('ex-cable'),
      'user-1',
      makeDeps(
        {
          exercises: [
            { row: exerciseRow('ex-cable', 'pec-fly', 'Cable Fly'), equipmentSlug: 'cable' },
            {
              row: exerciseRow('ex-barbell', 'horizontal-press', 'Barbell Bench Press'),
              equipmentSlug: 'barbell',
            },
          ],
        },
        makeProfile({ bodyWeightKg: null }),
      ),
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.replacement.loadPrescription.kind).toBe('calibration_required');
    expect(result.replacement.loadPrescription.suggestedLoadKg).toBeNull();
  });

  it('replacement never copies the old exercise incompatible load', async () => {
    const result = await replaceWorkoutExercise(
      replacementRequest('ex-machine'),
      'user-1',
      makeDeps(
        {
          exercises: [
            {
              row: exerciseRow('ex-machine', 'chest-press-machine', 'Machine Chest Press'),
              equipmentSlug: 'selectorized-machine',
            },
            {
              row: exerciseRow('ex-dumbbell', 'horizontal-press', 'Dumbbell Bench Press'),
              equipmentSlug: 'dumbbell',
            },
          ],
        },
        makeProfile({ experience: 'beginner', bodyWeightKg: 60 }),
      ),
    );
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    const beginnerMachineLoad = Math.max(Math.round((25 * 0.4) / 5) * 5, 5);
    expect(result.replacement.loadPrescription.suggestedLoadKg).not.toBe(beginnerMachineLoad);
    const beginnerDumbbellLoad = Math.max(Math.round((10 * 0.4) / 2) * 2, 2);
    expect(result.replacement.loadPrescription.suggestedLoadKg).toBe(beginnerDumbbellLoad);
  });
});
