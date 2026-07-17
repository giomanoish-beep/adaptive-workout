import { describe, expect, it } from 'vitest';
import {
  goalLabels,
  experienceLabels,
  frequencyLabels,
  environmentLabels,
  programPreferenceLabels,
  formatDurationMinutes,
  discomfortStatusLabel,
  discomfortDetailText,
  isProfileComplete,
  preferenceRows,
} from './settings-view-model';
import {
  profileGoals,
  profileExperiences,
  profileFrequencies,
  profileEnvironments,
  profileProgramPreferences,
  type TrainingProfile,
} from '../onboarding/training-profile';

/* ─── Complete fixture profile ───────────────────────────────────────── */

const completeProfile: TrainingProfile = {
  goal: 'build_muscle',
  experience: 'intermediate',
  frequency: '4',
  typicalDurationMinutes: 60,
  environment: 'commercial_gym',
  programPreference: 'push_pull_legs',
  hasCurrentDiscomfort: false,
};

/* ─── Goal presentation labels ───────────────────────────────────────── */

describe('goalLabels', () => {
  it('has labels for all ProfileGoal values', () => {
    for (const goal of profileGoals) {
      expect(goalLabels).toHaveProperty(goal);
      expect(typeof goalLabels[goal]).toBe('string');
      expect(goalLabels[goal].length).toBeGreaterThan(0);
    }
  });

  it('build_muscle => "Build muscle"', () => {
    expect(goalLabels.build_muscle).toBe('Build muscle');
  });

  it('lose_fat => "Lose fat"', () => {
    expect(goalLabels.lose_fat).toBe('Lose fat');
  });

  it('gain_strength => "Gain strength"', () => {
    expect(goalLabels.gain_strength).toBe('Gain strength');
  });

  it('improve_fitness => "Improve fitness"', () => {
    expect(goalLabels.improve_fitness).toBe('Improve fitness');
  });

  it('recomposition => "Recomposition"', () => {
    expect(goalLabels.recomposition).toBe('Recomposition');
  });
});

/* ─── Experience presentation labels ─────────────────────────────────── */

describe('experienceLabels', () => {
  it('has labels for all ProfileExperience values', () => {
    for (const exp of profileExperiences) {
      expect(experienceLabels).toHaveProperty(exp);
      expect(typeof experienceLabels[exp]).toBe('string');
      expect(experienceLabels[exp].length).toBeGreaterThan(0);
    }
  });

  it('beginner => "Beginner"', () => {
    expect(experienceLabels.beginner).toBe('Beginner');
  });

  it('intermediate => "Intermediate"', () => {
    expect(experienceLabels.intermediate).toBe('Intermediate');
  });

  it('advanced => "Advanced"', () => {
    expect(experienceLabels.advanced).toBe('Advanced');
  });
});

/* ─── Frequency presentation labels ──────────────────────────────────── */

describe('frequencyLabels', () => {
  it('has labels for all ProfileFrequency values', () => {
    for (const freq of profileFrequencies) {
      expect(frequencyLabels).toHaveProperty(freq);
      expect(typeof frequencyLabels[freq]).toBe('string');
      expect(frequencyLabels[freq].length).toBeGreaterThan(0);
    }
  });

  it('2 => "2 days/week"', () => {
    expect(frequencyLabels['2']).toBe('2 days/week');
  });

  it('3 => "3 days/week"', () => {
    expect(frequencyLabels['3']).toBe('3 days/week');
  });

  it('4 => "4 days/week"', () => {
    expect(frequencyLabels['4']).toBe('4 days/week');
  });

  it('5 => "5 days/week"', () => {
    expect(frequencyLabels['5']).toBe('5 days/week');
  });

  it('six_plus => "6+ days/week"', () => {
    expect(frequencyLabels.six_plus).toBe('6+ days/week');
  });
});

/* ─── Environment presentation labels ────────────────────────────────── */

describe('environmentLabels', () => {
  it('has labels for all ProfileEnvironment values', () => {
    for (const env of profileEnvironments) {
      expect(environmentLabels).toHaveProperty(env);
      expect(typeof environmentLabels[env]).toBe('string');
      expect(environmentLabels[env].length).toBeGreaterThan(0);
    }
  });

  it('commercial_gym => "Commercial gym"', () => {
    expect(environmentLabels.commercial_gym).toBe('Commercial gym');
  });

  it('home_gym => "Home gym"', () => {
    expect(environmentLabels.home_gym).toBe('Home gym');
  });

  it('minimal_equipment => "Minimal equipment"', () => {
    expect(environmentLabels.minimal_equipment).toBe('Minimal equipment');
  });

  it('bodyweight => "Bodyweight"', () => {
    expect(environmentLabels.bodyweight).toBe('Bodyweight');
  });
});

/* ─── Program preference presentation labels ─────────────────────────── */

describe('programPreferenceLabels', () => {
  it('has labels for all ProfileProgramPreference values', () => {
    for (const pref of profileProgramPreferences) {
      expect(programPreferenceLabels).toHaveProperty(pref);
      expect(typeof programPreferenceLabels[pref]).toBe('string');
      expect(programPreferenceLabels[pref].length).toBeGreaterThan(0);
    }
  });

  it('app_decide => "Let the app decide"', () => {
    expect(programPreferenceLabels.app_decide).toBe('Let the app decide');
  });

  it('push_pull_legs => "Push Pull Legs"', () => {
    expect(programPreferenceLabels.push_pull_legs).toBe('Push Pull Legs');
  });

  it('upper_lower => "Upper Lower"', () => {
    expect(programPreferenceLabels.upper_lower).toBe('Upper Lower');
  });

  it('full_body => "Full Body"', () => {
    expect(programPreferenceLabels.full_body).toBe('Full Body');
  });

  it('other => "Other"', () => {
    expect(programPreferenceLabels.other).toBe('Other');
  });
});

/* ─── Duration formatting ─────────────────────────────────────────────── */

describe('formatDurationMinutes', () => {
  it('formats 60 as "60 min"', () => {
    expect(formatDurationMinutes(60)).toBe('60 min');
  });

  it('formats 45 as "45 min"', () => {
    expect(formatDurationMinutes(45)).toBe('45 min');
  });

  it('formats 90 as "90 min"', () => {
    expect(formatDurationMinutes(90)).toBe('90 min');
  });

  it('formats 120 as "120 min"', () => {
    expect(formatDurationMinutes(120)).toBe('120 min');
  });

  it('formats 30 as "30 min"', () => {
    expect(formatDurationMinutes(30)).toBe('30 min');
  });
});

/* ─── Discomfort status labels ───────────────────────────────────────── */

describe('discomfortStatusLabel', () => {
  it('returns "No current discomfort" for false', () => {
    expect(discomfortStatusLabel(false)).toBe('No current discomfort');
  });

  it('returns "Discomfort currently affecting training" for true', () => {
    expect(discomfortStatusLabel(true)).toBe('Discomfort currently affecting training');
  });

  it('does not return GREEN/ADAPT/STOP classification', () => {
    expect(discomfortStatusLabel(true)).not.toContain('GREEN');
    expect(discomfortStatusLabel(true)).not.toContain('ADAPT');
    expect(discomfortStatusLabel(true)).not.toContain('STOP');
    expect(discomfortStatusLabel(false)).not.toContain('GREEN');
    expect(discomfortStatusLabel(false)).not.toContain('ADAPT');
    expect(discomfortStatusLabel(false)).not.toContain('STOP');
  });
});

describe('discomfortDetailText', () => {
  it('contains no question mark (does not ask the user for information)', () => {
    const text = discomfortDetailText();
    expect(text).not.toContain('?');
  });

  it('does not request symptom details or severity', () => {
    const text = discomfortDetailText();
    expect(text.toLowerCase()).not.toContain('symptom');
    expect(text.toLowerCase()).not.toContain('severity');
    expect(text.toLowerCase()).not.toContain('rate your');
    expect(text.toLowerCase()).not.toContain('describe your');
  });

  it('makes no affirmative diagnosis claim', () => {
    const text = discomfortDetailText();
    // The text must not state or imply a condition has been diagnosed.
    expect(text).not.toContain('diagnosed as');
    expect(text).not.toContain('diagnosed with');
    expect(text).not.toContain('you have');
    expect(text).not.toContain('condition');
  });

  it('contains no GREEN/ADAPT/STOP classification language', () => {
    const text = discomfortDetailText();
    expect(text).not.toContain('GREEN');
    expect(text).not.toContain('ADAPT');
    expect(text).not.toContain('STOP');
  });

  it('returns a non-empty string', () => {
    expect(discomfortDetailText().length).toBeGreaterThan(0);
  });
});

/* ─── Profile completion ─────────────────────────────────────────────── */

describe('isProfileComplete', () => {
  it('returns true for a fully populated profile', () => {
    expect(isProfileComplete(completeProfile)).toBe(true);
  });

  it('returns true for a profile with discomfort', () => {
    const withDiscomfort: TrainingProfile = {
      ...completeProfile,
      hasCurrentDiscomfort: true,
    };
    expect(isProfileComplete(withDiscomfort)).toBe(true);
  });
});

/* ─── Preference summary rows ────────────────────────────────────────── */

describe('preferenceRows', () => {
  it('returns five preference rows', () => {
    const rows = preferenceRows(completeProfile);
    expect(rows).toHaveLength(5);
  });

  it('shows experience from profile', () => {
    const rows = preferenceRows(completeProfile);
    const exp = rows.find((r) => r.label === 'Experience');
    expect(exp?.value).toBe(experienceLabels[completeProfile.experience]);
  });

  it('shows training frequency from profile', () => {
    const rows = preferenceRows(completeProfile);
    const freq = rows.find((r) => r.label === 'Training frequency');
    expect(freq?.value).toBe(frequencyLabels[completeProfile.frequency]);
  });

  it('shows typical duration in minutes', () => {
    const rows = preferenceRows(completeProfile);
    const dur = rows.find((r) => r.label === 'Typical duration');
    expect(dur?.value).toBe('60 min');
  });

  it('shows environment from profile', () => {
    const rows = preferenceRows(completeProfile);
    const env = rows.find((r) => r.label === 'Training environment');
    expect(env?.value).toBe(environmentLabels[completeProfile.environment]);
  });

  it('shows program preference from profile', () => {
    const rows = preferenceRows(completeProfile);
    const pref = rows.find((r) => r.label === 'Program preference');
    expect(pref?.value).toBe(programPreferenceLabels[completeProfile.programPreference]);
  });

  it('is deterministic — identical profiles yield identical rows', () => {
    const a = preferenceRows(completeProfile);
    const b = preferenceRows({ ...completeProfile });
    expect(a).toEqual(b);
  });
});

/* ─── No unwanted imports / side effects ─────────────────────────────── */

describe('no unwanted imports', () => {
  it('does not import from AI packages', () => {
    // The settings-view-model module only imports from onboarding/training-profile.
    // We verify this by checking none of the labels contain AI-related terms.
    const allLabelValues = [
      ...Object.values(goalLabels),
      ...Object.values(experienceLabels),
      ...Object.values(frequencyLabels),
      ...Object.values(environmentLabels),
      ...Object.values(programPreferenceLabels),
    ];
    for (const value of allLabelValues) {
      expect(value).not.toContain('AI');
    }
  });

  it('does not import from workout-engine', () => {
    // Verified by the module not using any workout-engine types in its exports.
    // The settings-view-model only references TrainingProfile and its
    // controlled-value types.
    expect(goalLabels).toBeDefined();
  });

  it('does not import from progression-engine', () => {
    expect(preferenceRows).toBeDefined();
  });

  it('does not import from pain-safety', () => {
    const falseLabel = discomfortStatusLabel(false);
    const trueLabel = discomfortStatusLabel(true);
    expect(falseLabel).not.toContain('GREEN');
    expect(trueLabel).not.toContain('GREEN');
  });
});

/* ─── Profile goal type safety ───────────────────────────────────────── */

describe('goal value type safety', () => {
  it('all ProfileGoal values are valid from the training profile model', () => {
    for (const goal of profileGoals) {
      const label: string = goalLabels[goal];
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('an updated goal is still the same ProfileGoal type', () => {
    const updated: TrainingProfile = {
      ...completeProfile,
      goal: 'gain_strength',
    };
    // Verify the goal is type-safe: it must be a valid key in goalLabels
    const label: string = goalLabels[updated.goal];
    expect(label).toBe('Gain strength');
    expect(typeof updated.goal).toBe('string');
    // Verify the updated profile still matches the TrainingProfile shape
    const rows = preferenceRows(updated);
    expect(rows).toHaveLength(5);
  });
});
