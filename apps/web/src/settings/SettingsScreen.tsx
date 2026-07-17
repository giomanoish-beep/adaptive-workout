import { useCallback, useState } from 'react';
import {
  goalLabels,
  discomfortStatusLabel,
  discomfortDetailText,
  isProfileComplete,
  preferenceRows,
} from './settings-view-model';
import type { TrainingProfile } from '../onboarding/training-profile';
import { profileGoals, type ProfileGoal } from '../onboarding/training-profile';

/**
 * Mobile-first Profile / Settings screen. Receives the profile and
 * persistence callbacks from the parent; owns no data fetching,
 * Supabase client creation, or browser storage.
 */
export interface SettingsScreenProps {
  readonly profile: TrainingProfile;
  readonly onProfileChange: (profile: TrainingProfile) => Promise<void>;
  readonly saving: boolean;
  readonly saveError: string | null;
  readonly signOut: () => Promise<void>;
}

export function SettingsScreen({
  profile,
  onProfileChange,
  saving,
  saveError,
  signOut,
}: SettingsScreenProps) {
  return (
    <section className="settings-screen">
      {/* ── Profile header ─────────────────────────────────────────── */}
      <header className="settings-screen__header">
        <p className="eyebrow">PROFILE</p>
        <h2 className="settings-screen__title">Training profile</h2>
        <p className="settings-screen__subtitle">
          These settings shape workout recommendations for your sessions.
        </p>
        {isProfileComplete(profile) && (
          <span className="settings-screen__complete-badge">Profile complete</span>
        )}
      </header>

      {/* ── Training goal (editable) ────────────────────────────────── */}
      <GoalSection
        profile={profile}
        onProfileChange={onProfileChange}
        saving={saving}
        saveError={saveError}
      />

      {/* ── Training preferences (read-only summary) ────────────────── */}
      <PreferencesSection profile={profile} />

      {/* ── Current discomfort status ───────────────────────────────── */}
      <DiscomfortSection hasCurrentDiscomfort={profile.hasCurrentDiscomfort} />

      {/* ── App & data status (replaced prototype messaging) ─────────── */}
      <DataStatusSection saving={saving} saveError={saveError} />

      {/* ── Sign out ────────────────────────────────────────────────── */}
      <SignOutSection signOut={signOut} />
    </section>
  );
}

/* ─── Goal section (editable inline) ──────────────────────────────────── */

interface GoalSectionProps {
  readonly profile: TrainingProfile;
  readonly onProfileChange: (profile: TrainingProfile) => Promise<void>;
  readonly saving: boolean;
  readonly saveError: string | null;
}

function GoalSection({ profile, onProfileChange, saving, saveError }: GoalSectionProps) {
  const [editing, setEditing] = useState(false);
  const [pendingGoal, setPendingGoal] = useState<ProfileGoal>(profile.goal);

  const handleEdit = useCallback(() => {
    setPendingGoal(profile.goal);
    setEditing(true);
  }, [profile.goal]);

  const handleCancel = useCallback(() => {
    setEditing(false);
  }, []);

  const handleSelect = useCallback((goal: ProfileGoal) => {
    setPendingGoal(goal);
  }, []);

  const handleSave = useCallback(() => {
    void onProfileChange({ ...profile, goal: pendingGoal });
    setEditing(false);
  }, [onProfileChange, pendingGoal, profile]);

  return (
    <div className="settings-card">
      <div className="settings-card__header">
        <h3 className="settings-card__title">Training goal</h3>
        {!editing && (
          <button
            type="button"
            className="settings-card__edit-btn"
            onClick={handleEdit}
            disabled={saving}
            aria-label="Edit training goal"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="settings-goal-edit">
          <div className="settings-goal-edit__options" role="radiogroup" aria-label="Training goal">
            {profileGoals.map((goal) => {
              const isSelected = goal === pendingGoal;
              return (
                <button
                  key={goal}
                  type="button"
                  className={`settings-chip${isSelected ? ' settings-chip--selected' : ''}`}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelect(goal)}
                >
                  {goalLabels[goal]}
                </button>
              );
            })}
          </div>
          <div className="settings-goal-edit__actions">
            <button
              type="button"
              className="settings-btn settings-btn--cancel"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {saveError && (
            <p className="settings-card__error" role="alert">
              {saveError}
            </p>
          )}
        </div>
      ) : (
        <p className="settings-card__value">{goalLabels[profile.goal]}</p>
      )}
    </div>
  );
}

/* ─── Preferences section (read-only summary rows) ────────────────────── */

interface PreferencesSectionProps {
  readonly profile: TrainingProfile;
}

function PreferencesSection({ profile }: PreferencesSectionProps) {
  const rows = preferenceRows(profile);

  return (
    <div className="settings-card">
      <h3 className="settings-card__title">Training preferences</h3>
      <dl className="settings-rows">
        {rows.map((row) => (
          <div key={row.label} className="settings-row">
            <dt className="settings-row__label">{row.label}</dt>
            <dd className="settings-row__value">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ─── Discomfort section ───────────────────────────────────────────────── */

interface DiscomfortSectionProps {
  readonly hasCurrentDiscomfort: boolean;
}

function DiscomfortSection({ hasCurrentDiscomfort }: DiscomfortSectionProps) {
  return (
    <div className="settings-card">
      <h3 className="settings-card__title">Current discomfort status</h3>
      <p
        className={`settings-card__value${
          hasCurrentDiscomfort ? ' settings-card__value--discomfort' : ''
        }`}
      >
        {discomfortStatusLabel(hasCurrentDiscomfort)}
      </p>
      {hasCurrentDiscomfort && (
        <p className="settings-card__detail">{discomfortDetailText()}</p>
      )}
    </div>
  );
}

/* ─── Data status section ──────────────────────────────────────────────── */

interface DataStatusSectionProps {
  readonly saving: boolean;
  readonly saveError: string | null;
}

function DataStatusSection({ saving, saveError }: DataStatusSectionProps) {
  return (
    <div className="settings-card settings-card--muted">
      <h3 className="settings-card__title">Data & save status</h3>
      {saving && (
        <p className="settings-card__detail">Saving profile changes…</p>
      )}
      {saveError && (
        <p className="settings-card__error" role="alert">
          {saveError}
        </p>
      )}
      {!saving && !saveError && (
        <p className="settings-card__detail">
          Your training profile is persisted to the cloud. Changes appear here
          after a successful save.
        </p>
      )}
    </div>
  );
}

/* ─── Sign-out section ─────────────────────────────────────────────────── */

interface SignOutSectionProps {
  readonly signOut: () => Promise<void>;
}

function SignOutSection({ signOut }: SignOutSectionProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = useCallback(() => {
    setSubmitting(true);
    setError(null);
    void signOut()
      .then(() => {
        // Auth state change is handled by the parent useAuth listener.
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : 'Sign out failed. Please try again.';
        setError(message);
        setSubmitting(false);
      });
  }, [signOut]);

  return (
    <div className="settings-sign-out">
      <button
        type="button"
        className="settings-sign-out__btn"
        onClick={handleSignOut}
        disabled={submitting}
        aria-busy={submitting}
      >
        {submitting ? 'Signing out\u2026' : 'Sign out'}
      </button>
      {error && (
        <p className="settings-sign-out__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}