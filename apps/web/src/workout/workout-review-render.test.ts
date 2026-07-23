import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkoutReview } from './WorkoutReview';
import { workoutReviewFixture } from './workout-review';

describe('WorkoutReview load display', () => {
  it('renders each exercise load prescription after its metrics', () => {
    const html = renderToStaticMarkup(
      createElement(WorkoutReview, {
        review: workoutReviewFixture,
        replacingPosition: null,
        replacementError: null,
        onReplaceExercise: vi.fn(),
        onStartWorkout: vi.fn(),
        onEditRequest: vi.fn(),
      }),
    );

    expect(html).toContain('Load: 8 kg · Estimated per dumbbell — confirm after first set');
    expect(html).toContain('Load: Choose a light stack and calibrate on the first set');
    expect(html.indexOf('workout-card__load')).toBeGreaterThan(
      html.indexOf('workout-card__metrics'),
    );
  });
});
