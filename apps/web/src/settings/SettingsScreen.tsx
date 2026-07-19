import { useCallback, useState } from 'react';
import {
  environmentLabels,
  frequencyLabels,
  goalLabels,
  programPreferenceLabels,
} from './settings-view-model';
import {
  profileEnvironments,
  profileFrequencies,
  profileGoals,
  profileProgramPreferences,
  type TrainingProfile,
} from '../onboarding/training-profile';

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
  const [pendingProfile, setPendingProfile] = useState(profile);
  const [lastAttempt, setLastAttempt] = useState<TrainingProfile | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const save = useCallback(
    (next: TrainingProfile) => {
      setPendingProfile(next);
      setLastAttempt(next);
      void onProfileChange(next);
    },
    [onProfileChange],
  );

  const handleSignOut = useCallback(() => {
    setSigningOut(true);
    setSignOutError(null);
    void signOut().catch(() => {
      setSignOutError('Sign out failed. Please try again.');
      setSigningOut(false);
    });
  }, [signOut]);

  return (
    <section className="settings-screen">
      <header className="settings-screen__header">
        <p className="eyebrow">Settings</p>
        <h2>Training preferences</h2>
        <p>Changes save to your account and shape future workout recommendations.</p>
      </header>

      <SettingsSection title="Training goal">
        <SettingSelect
          label="Goal"
          value={pendingProfile.goal}
          disabled={saving}
          options={profileGoals.map((value) => ({ value, label: goalLabels[value] }))}
          onChange={(goal) => save({ ...pendingProfile, goal })}
        />
      </SettingsSection>

      <SettingsSection title="Training environment">
        <SettingSelect
          label="Environment"
          value={pendingProfile.environment}
          disabled={saving}
          options={profileEnvironments.map((value) => ({
            value,
            label: environmentLabels[value],
          }))}
          onChange={(environment) => save({ ...pendingProfile, environment })}
        />
      </SettingsSection>

      <SettingsSection title="Equipment">
        <p className="settings-section__detail">{equipmentSummary(pendingProfile.environment)}</p>
        <p className="settings-section__hint">
          Change Training environment to update availability.
        </p>
      </SettingsSection>

      <SettingsSection title="Session preferences">
        <SettingSelect
          label="Training frequency"
          value={pendingProfile.frequency}
          disabled={saving}
          options={profileFrequencies.map((value) => ({ value, label: frequencyLabels[value] }))}
          onChange={(frequency) => save({ ...pendingProfile, frequency })}
        />
        <label className="settings-field">
          <span>Typical duration</span>
          <select
            value={pendingProfile.typicalDurationMinutes}
            disabled={saving}
            onChange={(event) =>
              save({ ...pendingProfile, typicalDurationMinutes: Number(event.target.value) })
            }
          >
            {[30, 45, 60, 75, 90, 120].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
        </label>
        <SettingSelect
          label="Workout structure"
          value={pendingProfile.programPreference}
          disabled={saving}
          options={profileProgramPreferences.map((value) => ({
            value,
            label: programPreferenceLabels[value],
          }))}
          onChange={(programPreference) => save({ ...pendingProfile, programPreference })}
        />
      </SettingsSection>

      <SettingsSection title="Discomfort">
        <label className="settings-toggle">
          <span>
            <strong>Currently affecting training</strong>
            <small>Workout generation will pause for a safety review.</small>
          </span>
          <input
            type="checkbox"
            checked={pendingProfile.hasCurrentDiscomfort}
            disabled={saving}
            onChange={(event) =>
              save({ ...pendingProfile, hasCurrentDiscomfort: event.target.checked })
            }
          />
        </label>
      </SettingsSection>

      <SettingsSection title="Account">
        <button className="settings-sign-out__btn" disabled={signingOut} onClick={handleSignOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
        {signOutError && (
          <p role="alert" className="settings-error">
            {signOutError}
          </p>
        )}
      </SettingsSection>

      <SettingsSection title="Data and privacy">
        <p className="settings-section__detail">
          Workout and fitness data is saved to your account, not browser storage.
        </p>
      </SettingsSection>

      <div className="settings-save-status" aria-live="polite">
        {saving && <span>Saving…</span>}
        {!saving && !saveError && lastAttempt && <span>Saved</span>}
        {saveError && (
          <>
            <span role="alert">{saveError}</span>
            <button type="button" onClick={() => lastAttempt && void onProfileChange(lastAttempt)}>
              Retry
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      <div className="settings-section__content">{children}</div>
    </section>
  );
}

function SettingSelect<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function equipmentSummary(environment: TrainingProfile['environment']): string {
  switch (environment) {
    case 'commercial_gym':
      return 'Full gym equipment';
    case 'home_gym':
      return 'Home gym equipment';
    case 'minimal_equipment':
      return 'Dumbbells and compact equipment';
    case 'bodyweight':
      return 'Bodyweight only';
  }
}
