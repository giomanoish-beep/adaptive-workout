import {
  PROGRAM_ENGINE_VERSION,
  PROGRAM_RULE_SET_VERSION,
  type GeneratedProgram,
  type ProgramExerciseCandidate,
  type ProgramGoal,
  type ProgramPrescription,
  type ProgramSessionTemplate,
  type ProgramSetup,
  type ScheduledProgramSession,
} from './contracts.js';

const DAY_PATTERNS: Readonly<Record<number, readonly number[]>> = {
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 6],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
};

const SPLITS: Readonly<Record<number, readonly { name: string; patterns: readonly string[] }[]>> = {
  2: [
    { name: 'Full Body A', patterns: ['squat', 'horizontal-press', 'horizontal-pull', 'hinge'] },
    { name: 'Full Body B', patterns: ['hinge', 'vertical-press', 'vertical-pull', 'single-leg'] },
  ],
  3: [
    { name: 'Full Body A', patterns: ['squat', 'horizontal-press', 'horizontal-pull'] },
    { name: 'Full Body B', patterns: ['hinge', 'vertical-press', 'vertical-pull'] },
    { name: 'Full Body C', patterns: ['single-leg', 'incline-press', 'horizontal-pull'] },
  ],
  4: [
    { name: 'Upper A', patterns: ['horizontal-press', 'horizontal-pull', 'vertical-press'] },
    { name: 'Lower A', patterns: ['squat', 'hinge', 'calf-raise'] },
    { name: 'Upper B', patterns: ['incline-press', 'vertical-pull', 'horizontal-pull'] },
    { name: 'Lower B', patterns: ['single-leg', 'hinge', 'knee-flexion'] },
  ],
  5: [
    { name: 'Upper', patterns: ['horizontal-press', 'horizontal-pull', 'vertical-press'] },
    { name: 'Lower', patterns: ['squat', 'hinge', 'calf-raise'] },
    { name: 'Push', patterns: ['incline-press', 'vertical-press', 'triceps-extension'] },
    { name: 'Pull', patterns: ['vertical-pull', 'horizontal-pull', 'elbow-flexion'] },
    { name: 'Legs', patterns: ['single-leg', 'knee-extension', 'knee-flexion'] },
  ],
  6: [
    { name: 'Push A', patterns: ['horizontal-press', 'vertical-press', 'triceps-extension'] },
    { name: 'Pull A', patterns: ['vertical-pull', 'horizontal-pull', 'elbow-flexion'] },
    { name: 'Legs A', patterns: ['squat', 'hinge', 'calf-raise'] },
    { name: 'Push B', patterns: ['incline-press', 'vertical-press', 'triceps-extension'] },
    { name: 'Pull B', patterns: ['horizontal-pull', 'vertical-pull', 'elbow-flexion'] },
    { name: 'Legs B', patterns: ['single-leg', 'knee-extension', 'knee-flexion'] },
  ],
};

export function generateProgram(
  setup: ProgramSetup,
  catalog: readonly ProgramExerciseCandidate[],
): GeneratedProgram {
  validateSetup(setup);
  const frequency = Math.min(6, Math.max(2, setup.daysPerWeek));
  const splitRows = SPLITS[frequency]!;
  const usable = catalog
    .filter((item) => !setup.dislikedExerciseIds.includes(item.id))
    .filter((item) => !setup.restrictedMovementPatterns.includes(item.movementPattern))
    .filter(
      (item) =>
        item.equipment.length === 0 || item.equipment.some((e) => setup.equipment.includes(e)),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  if (usable.length === 0)
    throw new Error('No exercises match the selected equipment and restrictions.');

  const templates = splitRows.map((row, index) => buildTemplate(row, index, setup, usable));
  const schedule = buildSchedule(setup, templates);
  return {
    name: `${goalName(setup.goal)} · ${setup.durationWeeks} weeks`,
    split: splitName(frequency, setup.programPreference),
    engineVersion: PROGRAM_ENGINE_VERSION,
    ruleSetVersion: PROGRAM_RULE_SET_VERSION,
    templates,
    schedule,
  };
}

function buildTemplate(
  row: { readonly name: string; readonly patterns: readonly string[] },
  templateIndex: number,
  setup: ProgramSetup,
  catalog: readonly ProgramExerciseCandidate[],
): ProgramSessionTemplate {
  const maxExercises =
    setup.sessionDurationMinutes <= 45 ? 4 : setup.sessionDurationMinutes <= 75 ? 5 : 6;
  const selected: ProgramExerciseCandidate[] = [];
  for (const pattern of row.patterns) {
    const match = catalog.find(
      (item) => item.movementPattern === pattern && !selected.includes(item),
    );
    if (match) selected.push(match);
  }
  for (const candidate of catalog) {
    if (selected.length >= maxExercises) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  const prescriptions = selected
    .slice(0, maxExercises)
    .map((exercise, i) => prescription(exercise, i + 1, setup.goal, setup.experience));
  return {
    templateKey: `template-${templateIndex + 1}`,
    name: row.name,
    focus: [...new Set(prescriptions.map((item) => item.movementPattern))],
    expectedDurationMinutes: setup.sessionDurationMinutes,
    prescriptions,
  };
}

function prescription(
  exercise: ProgramExerciseCandidate,
  position: number,
  goal: ProgramGoal,
  experience: ProgramSetup['experience'],
): ProgramPrescription {
  const rules =
    goal === 'gain_strength'
      ? { sets: experience === 'beginner' ? 3 : 4, min: 3, max: 6, rir: 2, rest: 180 }
      : goal === 'build_muscle'
        ? { sets: experience === 'advanced' ? 4 : 3, min: 8, max: 12, rir: 2, rest: 120 }
        : goal === 'fat_loss_support'
          ? { sets: 3, min: 10, max: 15, rir: 3, rest: 75 }
          : { sets: 3, min: 6, max: 12, rir: 2, rest: 105 };
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    position,
    movementPattern: exercise.movementPattern,
    sets: rules.sets,
    repsMin: rules.min,
    repsMax: rules.max,
    targetRir: rules.rir,
    restSeconds: rules.rest,
    initialLoadKg: null,
    calibrationStatus: 'calibration_required',
    recommendationReason:
      'Calibrate with a controlled set inside the prescribed rep and RIR range.',
  };
}

function buildSchedule(
  setup: ProgramSetup,
  templates: readonly ProgramSessionTemplate[],
): readonly ScheduledProgramSession[] {
  const start = parseDate(setup.startDate);
  const dayPattern = DAY_PATTERNS[Math.min(6, Math.max(2, setup.daysPerWeek))]!;
  const rows: ScheduledProgramSession[] = [];
  for (let week = 1; week <= setup.durationWeeks; week += 1) {
    const deload = week % 4 === 0 && week !== setup.durationWeeks;
    const phase = deload
      ? 'deload'
      : week <= 3
        ? 'foundation'
        : week > setup.durationWeeks * 0.75
          ? 'intensification'
          : 'build';
    dayPattern.forEach((day, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + (week - 1) * 7 + day - 1);
      rows.push({
        scheduleKey: `week-${week}-session-${index + 1}`,
        week,
        dayOfWeek: day,
        scheduledDate: date.toISOString().slice(0, 10),
        phase,
        isDeload: deload,
        templateKey: templates[index % templates.length]!.templateKey,
      });
    });
  }
  return rows;
}

function parseDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error('Program start date is invalid.');
  return parsed;
}

function validateSetup(setup: ProgramSetup): void {
  if (![8, 12, 16].includes(setup.durationWeeks))
    throw new Error('Program duration must be 8, 12, or 16 weeks.');
  if (setup.daysPerWeek < 2 || setup.daysPerWeek > 6)
    throw new Error('Training frequency must be between 2 and 6 days.');
}

function goalName(goal: ProgramGoal): string {
  return {
    build_muscle: 'Build muscle',
    gain_strength: 'Strength',
    recomposition: 'Recomposition',
    fat_loss_support: 'Fat-loss support',
  }[goal];
}

function splitName(frequency: number, preference: ProgramSetup['programPreference']): string {
  if (preference !== 'app_decide')
    return { push_pull_legs: 'Push Pull Legs', upper_lower: 'Upper Lower', full_body: 'Full Body' }[
      preference
    ];
  if (frequency <= 3) return 'Full Body';
  if (frequency === 4) return 'Upper Lower';
  return 'Push Pull Legs';
}
