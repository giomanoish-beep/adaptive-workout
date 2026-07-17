import { formatRepRange, type WorkoutReview as WorkoutReviewModel } from './workout-review';

/**
 * Presentational review screen for the Workout tab (WEB_APP-003). Renders the
 * review model — title, estimated duration, total working sets, ordered
 * exercise cards (sets, rep range, RIR), muscle-volume summary, a UI-only
 * Replace action per exercise, and the primary Start / secondary Edit actions.
 * Owns no state.
 */
export interface WorkoutReviewProps {
  readonly review: WorkoutReviewModel;
  readonly replacingPosition: number | null;
  readonly onReplaceExercise: (position: number) => void;
  readonly onStartWorkout: () => void;
  readonly onEditRequest: () => void;
}

export function WorkoutReview({
  review,
  replacingPosition,
  onReplaceExercise,
  onStartWorkout,
  onEditRequest,
}: WorkoutReviewProps) {
  return (
    <section className="workout-review">
      <header className="workout-review__header">
        <p className="eyebrow">Review</p>
        <h2>{review.title}</h2>
        <div className="workout-review__stats">
          <span className="workout-review__stat">
            <span className="workout-review__stat-value">{review.estimatedDurationMinutes}</span>
            <span className="workout-review__stat-label">min</span>
          </span>
          <span className="workout-review__stat">
            <span className="workout-review__stat-value">{review.totalWorkingSets}</span>
            <span className="workout-review__stat-label">sets</span>
          </span>
        </div>
      </header>

      <ol className="workout-review__exercises">
        {review.exercises.map((exercise) => {
          const replacing = replacingPosition === exercise.position;
          return (
            <li
              key={exercise.position}
              className={`workout-card${replacing ? ' workout-card--replacing' : ''}`}
            >
              <div className="workout-card__top">
                <span className="workout-card__position">{exercise.position}</span>
                <span className="workout-card__name">{exercise.name}</span>
              </div>
              <div className="workout-card__metrics">
                <span className="workout-card__metric">{exercise.sets} sets</span>
                <span className="workout-card__metric">{formatRepRange(exercise.reps)} reps</span>
                <span className="workout-card__metric">RIR {exercise.rir}</span>
              </div>
              <button
                type="button"
                className="workout-card__replace"
                aria-pressed={replacing}
                onClick={() => onReplaceExercise(exercise.position)}
              >
                {replacing ? 'Replacing…' : 'Replace'}
              </button>
              {replacing && (
                <p className="workout-card__placeholder">
                  Substitution arrives with server-side generation.
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <section className="workout-review__volume">
        <h3 className="workout-review__volume-title">Muscle volume</h3>
        <ul className="workout-review__volume-list">
          {review.muscleVolume.map((entry) => (
            <li key={entry.muscle} className="workout-review__volume-item">
              <span className="workout-review__volume-muscle">{entry.muscle}</span>
              <span className="workout-review__volume-value">{entry.volume.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="workout-review__actions">
        <button type="button" className="workout-review__start" onClick={onStartWorkout}>
          Start workout
        </button>
        <button type="button" className="workout-review__edit" onClick={onEditRequest}>
          Edit request
        </button>
      </div>
    </section>
  );
}
