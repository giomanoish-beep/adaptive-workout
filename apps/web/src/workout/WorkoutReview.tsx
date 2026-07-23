import {
  formatLoadPrescription,
  formatRepRange,
  type WorkoutReview as WorkoutReviewModel,
} from './workout-review';

export interface WorkoutReviewProps {
  readonly review: WorkoutReviewModel;
  readonly replacingPosition: number | null;
  readonly replacementError: string | null;
  readonly onReplaceExercise: (position: number) => void;
  readonly onStartWorkout: () => void;
  readonly onEditRequest: () => void;
}

export function WorkoutReview({
  review,
  replacingPosition,
  replacementError,
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
                <span>{exercise.sets} sets</span>
                <span>{formatRepRange(exercise.reps)} reps</span>
                <span>RIR {exercise.rir}</span>
              </div>
              <p className="workout-card__load">
                Load: {formatLoadPrescription(exercise.loadPrescription)}
              </p>
              <ExerciseProgressionSummary exercise={exercise} />
              <button
                type="button"
                className="workout-card__replace"
                aria-busy={replacing}
                disabled={replacingPosition !== null}
                onClick={() => onReplaceExercise(exercise.position)}
              >
                {replacing ? 'Finding substitute…' : 'Replace for this workout'}
              </button>
            </li>
          );
        })}
      </ol>

      {replacementError && (
        <p className="workout-review__replacement-error" role="alert">
          {replacementError}
        </p>
      )}

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

function ExerciseProgressionSummary({
  exercise,
}: {
  exercise: WorkoutReviewModel['exercises'][number];
}) {
  const progress = exercise.progression;
  if (!progress?.hasEnoughData) {
    return <p className="exercise-progress exercise-progress--empty">Calibration recommended</p>;
  }
  const last =
    progress.lastWeightKg !== null && progress.lastReps !== null
      ? `Last: ${progress.lastWeightKg} kg × ${progress.lastReps}${
          progress.lastRir === null ? '' : ` @ RIR ${progress.lastRir}`
        }`
      : 'Last: Not enough data';
  const next =
    progress.nextWeightKg === null
      ? 'Next: Calibration recommended'
      : `Next: ${progress.nextWeightKg} kg × ${formatRepRange(exercise.reps)} @ RIR ${exercise.rir}`;
  return (
    <div className="exercise-progress" aria-label={`Progress for ${exercise.name}`}>
      <span>{last}</span>
      <span>{next}</span>
      {progress.trend && <span className="exercise-progress__trend">{progress.trend}</span>}
    </div>
  );
}
