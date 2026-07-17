import { describe, expect, it } from 'vitest';
import { InMemorySink } from '@adaptive-workout/observability';
import { mapCatalogToEngineCandidates } from './catalog-mapping.js';
import { buildEngineInput } from './engine-input.js';
import { generateWorkout } from './orchestrator.js';

const muscleId = '00000000-0000-4000-8000-000000000001';
const equipmentId = '00000000-0000-4000-8000-000000000002';
const exerciseId = '00000000-0000-4000-8000-000000000003';
const familyId = '00000000-0000-4000-8000-000000000004';
const secondExerciseId = '00000000-0000-4000-8000-000000000006';
const secondFamilyId = '00000000-0000-4000-8000-000000000007';

describe('equipment context mapping', () => {
  it('maps UI equipment slugs to canonical catalog equipment IDs', () => {
    const catalog = mapCatalogToEngineCandidates(
      [
        {
          id: exerciseId,
          slug: 'dumbbell-bench-press',
          name: 'Dumbbell Bench Press',
          exerciseFamilyId: familyId,
          exerciseFamilySlug: 'horizontal-press',
          isActive: true,
          version: 1,
        },
      ],
      [{ id: muscleId, slug: 'chest', name: 'Chest', isActive: true }],
      [
        {
          exerciseId,
          muscleId,
          role: 'primary',
          contribution: 1,
        },
      ],
      [
        {
          exerciseId,
          equipmentId,
          equipmentSlug: 'dumbbell',
          requirement: 'required',
        },
      ],
      [{ id: equipmentId, slug: 'dumbbell', name: 'Dumbbell', isActive: true }],
    );

    const input = buildEngineInput(
      {
        targetMuscles: ['chest'],
        durationMinutes: 45,
        equipmentContext: 'dumbbells-only',
      },
      catalog,
      { chest: 'chest' },
      { 'dumbbells-only': ['dumbbell'] },
      '00000000-0000-4000-8000-000000000005',
    );

    expect(catalog.equipmentIdToSlug.get(equipmentId)).toBe('dumbbell');
    expect(input.availableEquipmentIds).toEqual([equipmentId]);
    expect(input.exerciseCatalog[0]?.equipment[0]?.equipmentId).toBe(equipmentId);
  });

  it('generates a workout for an authenticated user with a valid equipment context', async () => {
    const sink = new InMemorySink();
    const exercises = [
      {
        id: exerciseId,
        slug: 'dumbbell-bench-press',
        name: 'Dumbbell Bench Press',
        exerciseFamilyId: familyId,
        exerciseFamilySlug: 'horizontal-press',
        isActive: true,
        version: 1,
      },
      {
        id: secondExerciseId,
        slug: 'dumbbell-fly',
        name: 'Dumbbell Fly',
        exerciseFamilyId: secondFamilyId,
        exerciseFamilySlug: 'chest-fly',
        isActive: true,
        version: 1,
      },
    ];
    const result = await generateWorkout(
      {
        targetMuscles: ['chest'],
        durationMinutes: 60,
        equipmentContext: 'dumbbells-only',
      },
      '00000000-0000-4000-8000-000000000005',
      {
        correlationId: 'equipment-mapping-regression',
        muscleIdMap: { chest: 'chest' },
        equipmentContextMap: { 'dumbbells-only': ['dumbbell'] },
        profileLoader: {
          loadProfile: () =>
            Promise.resolve({
              goal: 'build_muscle',
              experience: 'intermediate',
              frequency: '3',
              typicalDurationMinutes: 45,
              environment: 'commercial_gym',
              programPreference: 'app_decide',
              hasCurrentDiscomfort: false,
            }),
        },
        catalogLoader: {
          loadActiveCatalog: () =>
            Promise.resolve({
              exercises,
              muscles: [{ id: muscleId, slug: 'chest', name: 'Chest', isActive: true }],
              exerciseMuscles: exercises.map((exercise) => ({
                exerciseId: exercise.id,
                muscleId,
                role: 'primary' as const,
                contribution: 1,
              })),
              exerciseEquipment: exercises.map((exercise) => ({
                exerciseId: exercise.id,
                equipmentId,
                equipmentSlug: 'dumbbell',
                requirement: 'required' as const,
              })),
              equipment: [{ id: equipmentId, slug: 'dumbbell', name: 'Dumbbell', isActive: true }],
            }),
        },
      },
      sink,
    );

    if (result.status === 'error') {
      throw new Error(JSON.stringify({ result, events: sink.events }));
    }
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.exercises.length).toBeGreaterThan(0);
      expect(result.exercises.every((exercise) => exercise.sets > 0)).toBe(true);
    }
  });
});
