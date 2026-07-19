import { useState } from 'react';
import { localDate, templateFor, titleCase } from './program-view-model';
import type { LoadedProgram, ProgramAdaptationDto, ProgramSetupDraft } from './program-types';

export function ProgramScreen({
  program,
  saving,
  error,
  onBack,
  onRevise,
  onReschedule,
  onSkip,
  onAddAdaptation,
  onRemoveAdaptation,
}: {
  readonly program: LoadedProgram;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onBack: () => void;
  readonly onRevise: (setup: ProgramSetupDraft) => void;
  readonly onReschedule: (id: string, date: string) => void;
  readonly onSkip: (id: string) => void;
  readonly onAddAdaptation: (input: Omit<ProgramAdaptationDto, 'id'>) => void;
  readonly onRemoveAdaptation: (id: string) => void;
}) {
  const [week, setWeek] = useState(1);
  const [editing, setEditing] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const sessions = program.schedule.filter((item) => item.week === week);
  return (
    <section className="program-screen">
      <p className="eyebrow">Program · Revision {program.revision}</p>
      <div className="program-screen__title">
        <div>
          <h2>{program.generated.name}</h2>
          <p>
            {program.generated.split} · {program.durationWeeks} weeks
          </p>
        </div>
        <button className="text-button" onClick={onBack}>
          Today
        </button>
      </div>
      <label className="week-select">
        Week{' '}
        <select value={week} onChange={(e) => setWeek(Number(e.target.value))}>
          {Array.from({ length: program.durationWeeks }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              Week {i + 1}
            </option>
          ))}
        </select>
      </label>
      <div className="program-week" data-testid="program-week-detail">
        {sessions.map((scheduled) => {
          const template = templateFor(program, scheduled);
          return (
            <article
              className={`program-session program-session--${scheduled.status}`}
              key={scheduled.id}
            >
              <header>
                <div>
                  <span>{scheduled.scheduledDate}</span>
                  <h3>{template.name}</h3>
                </div>
                <span className="program-badge">{scheduled.status}</span>
              </header>
              <p>
                {titleCase(scheduled.phase)}
                {scheduled.isDeload ? ' · Reduced-load week' : ''}
              </p>
              <ul>
                {template.prescriptions.map((item) => {
                  const adapted = program.adaptations.some((a) =>
                    a.affectedMovementPatterns.includes(item.movementPattern),
                  );
                  return (
                    <li key={item.exerciseId} className={adapted ? 'is-adapted' : ''}>
                      <strong>{item.exerciseName}</strong>
                      <span>
                        {item.sets} × {item.repsMin}–{item.repsMax} @ RIR {item.targetRir} ·{' '}
                        {item.restSeconds}s
                      </span>
                      <small>
                        {item.initialLoadKg === null
                          ? 'Calibration recommended'
                          : `${item.initialLoadKg} kg`}{' '}
                        · {item.recommendationReason}
                      </small>
                      {adapted && <em>Temporary adaptation applies; base preserved</em>}
                    </li>
                  );
                })}
              </ul>
              {['upcoming', 'rescheduled'].includes(scheduled.status) && (
                <div className="program-session__actions">
                  <label>
                    Move{' '}
                    <input
                      aria-label={`Reschedule ${template.name}`}
                      type="date"
                      value={scheduled.scheduledDate}
                      onChange={(e) => onReschedule(scheduled.id, e.target.value)}
                    />
                  </label>
                  <button onClick={() => onSkip(scheduled.id)}>Skip</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <section className="program-adaptations">
        <h3>Training adaptations</h3>
        {program.adaptations.length === 0 ? (
          <p>No active temporary restrictions.</p>
        ) : (
          program.adaptations.map((item) => (
            <div key={item.id}>
              <span>
                <strong>{titleCase(item.affectedRegion)}</strong> · {item.severity} ·{' '}
                {item.affectedMovementPatterns.map(titleCase).join(', ')}
              </span>
              <button onClick={() => onRemoveAdaptation(item.id)}>Remove</button>
            </div>
          ))
        )}
        <button className="secondary-button" onClick={() => setAdapting(!adapting)}>
          Add temporary restriction
        </button>
        {adapting && (
          <AdaptationForm
            saving={saving}
            onSave={(input) => {
              onAddAdaptation(input);
              setAdapting(false);
            }}
          />
        )}
      </section>
      <button className="secondary-button" onClick={() => setEditing(!editing)}>
        Edit future program
      </button>
      {editing && (
        <ProgramEdit
          program={program}
          saving={saving}
          onSave={(setup) => {
            onRevise(setup);
            setEditing(false);
          }}
        />
      )}
      {error && (
        <div className="program-action-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

function AdaptationForm({
  saving,
  onSave,
}: {
  readonly saving: boolean;
  readonly onSave: (input: Omit<ProgramAdaptationDto, 'id'>) => void;
}) {
  const [region, setRegion] = useState('shoulder');
  const [pattern, setPattern] = useState('horizontal-press');
  const [severity, setSeverity] = useState<ProgramAdaptationDto['severity']>('mild');
  return (
    <div className="program-edit">
      <label>
        Affected region
        <input value={region} onChange={(e) => setRegion(e.target.value)} />
      </label>
      <label>
        Restricted movement
        <select value={pattern} onChange={(e) => setPattern(e.target.value)}>
          <option value="vertical-press">Overhead press</option>
          <option value="horizontal-press">Horizontal press</option>
          <option value="squat">Squat</option>
          <option value="hinge">Hinge</option>
          <option value="vertical-pull">Vertical pull</option>
        </select>
      </label>
      <label>
        Severity
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as ProgramAdaptationDto['severity'])}
        >
          <option value="mild">Mild</option>
          <option value="moderate">Moderate</option>
          <option value="severe">Severe — stop affected training</option>
        </select>
      </label>
      {severity === 'severe' && (
        <p role="alert">
          Stop the affected training and seek medical advice. This app does not generate
          rehabilitation.
        </p>
      )}
      <button
        disabled={saving || !region.trim()}
        onClick={() =>
          onSave({
            affectedRegion: region.trim(),
            affectedMovementPatterns: [pattern],
            severity,
            startDate: localDate(),
            reviewDate: null,
          })
        }
      >
        Save adaptation
      </button>
    </div>
  );
}

function ProgramEdit({
  program,
  saving,
  onSave,
}: {
  readonly program: LoadedProgram;
  readonly saving: boolean;
  readonly onSave: (setup: ProgramSetupDraft) => void;
}) {
  const [days, setDays] = useState(program.setup.daysPerWeek);
  const [minutes, setMinutes] = useState(program.setup.sessionDurationMinutes);
  const [equipment, setEquipment] = useState(program.setup.equipment.join(', '));
  return (
    <div className="program-edit">
      <p>Completed history stays unchanged. Saving creates revision {program.revision + 1}.</p>
      <label>
        Training days
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[2, 3, 4, 5, 6].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Session duration
        <input
          type="number"
          min="15"
          max="240"
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
      </label>
      <label>
        Equipment
        <input value={equipment} onChange={(e) => setEquipment(e.target.value)} />
      </label>
      <button
        disabled={saving}
        onClick={() =>
          onSave({
            ...program.setup,
            daysPerWeek: days,
            sessionDurationMinutes: minutes,
            equipment: equipment
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
          })
        }
      >
        {saving ? 'Saving…' : 'Save new revision'}
      </button>
    </div>
  );
}
