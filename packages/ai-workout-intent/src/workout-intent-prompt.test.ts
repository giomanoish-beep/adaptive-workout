import type { AIProviderRequest } from '@adaptive-workout/ai';
import type {
  ContractVersion,
  DomainId,
  EquipmentId,
  ExerciseFamilyId,
  ExerciseId,
  MuscleId,
} from '@adaptive-workout/domain';
import { describe, expect, it } from 'vitest';
import { buildWorkoutIntentPromptMessages, parseWorkoutIntentOutput, packageName } from './index';

const contractVersion = 'ai-contract-1' as ContractVersion;
const chestId = '00000000-0000-0000-0000-000000000001' as MuscleId;
const backId = '00000000-0000-0000-0000-000000000002' as MuscleId;
const legsId = '00000000-0000-0000-0000-000000000003' as MuscleId;
const dumbbellId = '00000000-0000-0000-0000-000000000010' as EquipmentId;
const benchId = '00000000-0000-0000-0000-000000000011' as EquipmentId;
const barbellId = '00000000-0000-0000-0000-000000000012' as EquipmentId;
const pressId = '00000000-0000-0000-0000-000000000020' as ExerciseId;
const rowId = '00000000-0000-0000-0000-000000000021' as ExerciseId;
const pressFamilyId = '00000000-0000-0000-0000-000000000030' as ExerciseFamilyId;
const requestId = '00000000-0000-0000-0000-000000000099' as DomainId<'ai-request'>;

function request(
  text: string,
  overrides?: Partial<AIProviderRequest<'workout_intent_extraction'>['input']>,
): AIProviderRequest<'workout_intent_extraction'> {
  return {
    task: 'workout_intent_extraction',
    input: {
      task: 'workout_intent_extraction',
      contractVersion,
      requestText: text,
      controlledVocabulary: {
        muscleIds: [chestId, backId, legsId],
        equipmentIds: [dumbbellId, benchId, barbellId],
        exerciseIds: [pressId, rowId],
        exerciseFamilyIds: [pressFamilyId],
      },
      currentWorkout: null,
      ...overrides,
    },
    metadata: {
      requestId,
      requestedAt: '2026-07-14T10:00:00.000Z',
      timeoutMilliseconds: 10_000,
    },
  };
}

describe('ai-workout-intent package', () => {
  it('exports the documented package name', () => {
    expect(packageName).toBe('@adaptive-workout/ai-workout-intent');
  });
});

describe('buildWorkoutIntentPromptMessages', () => {
  it('injects the controlled vocabulary ids into the prompt', () => {
    const messages = buildWorkoutIntentPromptMessages(request('chest and back today'));

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
    const userContent = messages[1]?.content ?? '';
    // The model is handed every legal id so it can only echo known ids.
    expect(userContent).toContain(chestId);
    expect(userContent).toContain(backId);
    expect(userContent).toContain(dumbbellId);
    expect(userContent).toContain(pressFamilyId);
  });

  it('forbids guessing and invention in the system message', () => {
    const messages = buildWorkoutIntentPromptMessages(request('anything'));
    const systemContent = messages[0]?.content ?? '';
    expect(systemContent.toLowerCase()).toContain('never invent');
    expect(systemContent.toLowerCase()).toContain('only');
  });

  it('includes current-workout context when present', () => {
    const messages = buildWorkoutIntentPromptMessages(
      request('add more chest', {
        currentWorkout: {
          origin: 'generated',
          targetMuscleIds: [chestId],
          exerciseIds: [pressId],
        },
      }),
    );
    expect(messages[1]?.content ?? '').toContain('Current workout context');
  });
});

describe('parseWorkoutIntentOutput', () => {
  describe('English extraction', () => {
    it('maps a complete structured response to the typed output', () => {
      const result = parseWorkoutIntentOutput(
        request('45 minute chest workout with dumbbells, no bench press'),
        {
          targetMuscleIds: [chestId],
          excludedMuscleIds: [],
          availableDurationMinutes: 45,
          equipmentIntent: {
            kind: 'specified',
            availableEquipmentIds: [dumbbellId],
            unavailableEquipmentIds: [],
          },
          excludedExerciseIds: [],
          excludedExerciseFamilyIds: [],
          preferredMuscleIds: [chestId],
          constraints: [],
          missingInformation: [],
        },
      );

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.output.targetMuscleIds).toEqual([chestId]);
        expect(result.output.availableDurationMinutes).toBe(45);
        expect(result.output.equipmentIntent).toEqual({
          kind: 'specified',
          availableEquipmentIds: [dumbbellId],
          unavailableEquipmentIds: [],
        });
      }
    });

    it('reduces exercise priority and caps duration via constraints', () => {
      const result = parseWorkoutIntentOutput(request('avoid rows, cap at 30 minutes'), {
        targetMuscleIds: [backId],
        excludedMuscleIds: [],
        availableDurationMinutes: null,
        equipmentIntent: { kind: 'unspecified' },
        excludedExerciseIds: [rowId],
        excludedExerciseFamilyIds: [],
        preferredMuscleIds: [],
        constraints: [
          { kind: 'reduced_exercise_priority', exerciseIds: [rowId] },
          { kind: 'maximum_workout_duration', maximumMinutes: 30 },
        ],
        missingInformation: [],
      });

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.output.constraints).toHaveLength(2);
        expect(result.output.constraints[0]).toEqual({
          kind: 'reduced_exercise_priority',
          exerciseIds: [rowId],
        });
      }
    });
  });

  describe('French extraction', () => {
    it('maps a French request to structured target muscles and duration', () => {
      // "Un entraînement de 40 minutes pour les pectoraux avec des haltères"
      const result = parseWorkoutIntentOutput(
        request('Un entraînement de 40 minutes pour les pectoraux avec des haltères'),
        {
          targetMuscleIds: [chestId],
          excludedMuscleIds: [],
          availableDurationMinutes: 40,
          equipmentIntent: {
            kind: 'specified',
            availableEquipmentIds: [dumbbellId],
            unavailableEquipmentIds: [],
          },
          excludedExerciseIds: [],
          excludedExerciseFamilyIds: [],
          preferredMuscleIds: [chestId],
          constraints: [],
          missingInformation: [],
        },
      );

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.output.targetMuscleIds).toEqual([chestId]);
        expect(result.output.availableDurationMinutes).toBe(40);
        expect(result.output.equipmentIntent.kind).toBe('specified');
      }
    });

    it('maps a French request excluding a muscle and leaving equipment unspecified', () => {
      // "Séance jambes, pas de dos, sans matériel précisé"
      const result = parseWorkoutIntentOutput(
        request('Séance jambes, pas de dos, sans matériel précisé'),
        {
          targetMuscleIds: [legsId],
          excludedMuscleIds: [backId],
          availableDurationMinutes: null,
          equipmentIntent: { kind: 'unspecified' },
          excludedExerciseIds: [],
          excludedExerciseFamilyIds: [],
          preferredMuscleIds: [],
          constraints: [],
          missingInformation: [],
        },
      );

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.output.targetMuscleIds).toEqual([legsId]);
        expect(result.output.excludedMuscleIds).toEqual([backId]);
        expect(result.output.equipmentIntent.kind).toBe('unspecified');
        expect(result.output.availableDurationMinutes).toBeNull();
      }
    });
  });

  describe('unknown and unstated values', () => {
    it('keeps unstated duration null and equipment unspecified', () => {
      const result = parseWorkoutIntentOutput(request('just chest'), {
        targetMuscleIds: [chestId],
        excludedMuscleIds: [],
        availableDurationMinutes: null,
        equipmentIntent: { kind: 'unspecified' },
        excludedExerciseIds: [],
        excludedExerciseFamilyIds: [],
        preferredMuscleIds: [],
        constraints: [],
        missingInformation: ['duration_unclear', 'equipment_context_unclear'],
      });

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.output.availableDurationMinutes).toBeNull();
        expect(result.output.equipmentIntent.kind).toBe('unspecified');
        expect(result.output.missingInformation).toContain('duration_unclear');
      }
    });

    it('rejects invented muscle ids outside the controlled vocabulary', () => {
      const invented = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const result = parseWorkoutIntentOutput(request('whole body'), {
        targetMuscleIds: [invented],
        excludedMuscleIds: [],
        availableDurationMinutes: null,
        equipmentIntent: { kind: 'unspecified' },
        excludedExerciseIds: [],
        excludedExerciseFamilyIds: [],
        preferredMuscleIds: [],
        constraints: [],
        missingInformation: [],
      });

      expect(result.status).toBe('failure');
    });
  });

  describe('malformed provider output', () => {
    it('fails on non-JSON string content', () => {
      const result = parseWorkoutIntentOutput(request('chest'), 'not-json');
      expect(result.status).toBe('failure');
    });

    it('fails on empty content', () => {
      const result = parseWorkoutIntentOutput(request('chest'), '');
      expect(result.status).toBe('failure');
    });

    it('fails on null content', () => {
      const result = parseWorkoutIntentOutput(request('chest'), null);
      expect(result.status).toBe('failure');
    });

    it('fails when the content is an array instead of an object', () => {
      const result = parseWorkoutIntentOutput(request('chest'), [chestId]);
      expect(result.status).toBe('failure');
    });

    it('fails on a missing required field', () => {
      const result = parseWorkoutIntentOutput(request('chest'), {
        targetMuscleIds: [chestId],
        // equipmentIntent omitted entirely
      });
      expect(result.status).toBe('failure');
    });

    it('accepts a JSON string payload', () => {
      const result = parseWorkoutIntentOutput(
        request('chest'),
        JSON.stringify({
          targetMuscleIds: [chestId],
          excludedMuscleIds: [],
          availableDurationMinutes: null,
          equipmentIntent: { kind: 'unspecified' },
          excludedExerciseIds: [],
          excludedExerciseFamilyIds: [],
          preferredMuscleIds: [],
          constraints: [],
          missingInformation: [],
        }),
      );
      expect(result.status).toBe('ok');
    });

    it('rejects an unsupported constraint kind', () => {
      const result = parseWorkoutIntentOutput(request('chest'), {
        targetMuscleIds: [chestId],
        excludedMuscleIds: [],
        availableDurationMinutes: null,
        equipmentIntent: { kind: 'unspecified' },
        excludedExerciseIds: [],
        excludedExerciseFamilyIds: [],
        preferredMuscleIds: [],
        constraints: [{ kind: 'invent_a_workout', exerciseIds: [pressId] }],
        missingInformation: [],
      });
      expect(result.status).toBe('failure');
    });

    it('rejects a diagnosis-shaped field that does not belong', () => {
      const result = parseWorkoutIntentOutput(request('chest'), {
        targetMuscleIds: [chestId],
        excludedMuscleIds: [],
        availableDurationMinutes: null,
        equipmentIntent: { kind: 'unspecified' },
        excludedExerciseIds: [],
        excludedExerciseFamilyIds: [],
        preferredMuscleIds: [],
        constraints: [],
        missingInformation: [],
        authoritativeWorkout: { exercises: [pressId] },
      });
      expect(result.status).toBe('failure');
    });
  });
});
