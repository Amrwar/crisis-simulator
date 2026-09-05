'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState, Notice, Spinner } from '@/components/ui/States';
import { StatRow, StatTile } from '@/components/ui/StatTile';
import { ApiError, apiGet, apiSend, messageFor } from '@/lib/client/api';
import { fetchCurrentUser, type CurrentUser } from '@/lib/client/session';
import { formatDate } from '@/lib/format';
import { DELETE_CONFIRMATION, MIN_PASSWORD_LENGTH, type ProfilePayload } from '@/lib/profile';
import { COMPANY_SIZES, DIFFICULTIES, INDUSTRIES } from '@/types';

export default function SettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser().then(setUser);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setProfile(await apiGet<ProfilePayload>('/api/profile'));
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push('/auth/login');
        return;
      }
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen">
      <AppHeader user={user} />

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">Settings</h1>
          <p className="text-text-secondary mt-1">Your profile, your defaults, and your account.</p>
        </div>

        {loading && profile === null ? (
          <LoadingState label="Loading your account…" />
        ) : error !== null ? (
          <ErrorState message={error} onRetry={load} />
        ) : profile === null ? null : (
          <div className="space-y-6">
            <ProfileSection profile={profile} onSaved={load} />
            <PasswordSection />
            <DangerSection profile={profile} />
          </div>
        )}
      </main>
    </div>
  );
}

function ProfileSection({ profile, onSaved }: { profile: ProfilePayload; onSaved: () => void }) {
  const [name, setName] = useState(profile.name);
  const [industry, setIndustry] = useState(profile.preferredIndustry);
  const [difficulty, setDifficulty] = useState(profile.preferredDifficulty);
  const [size, setSize] = useState(profile.preferredCompanySize);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await apiSend('/api/profile', 'PATCH', {
        name,
        preferredIndustry: industry,
        preferredDifficulty: difficulty,
        preferredCompanySize: size,
      });
      setMessage({ tone: 'success', text: 'Saved.' });
      onSaved();
    } catch (cause) {
      setMessage({ tone: 'danger', text: messageFor(cause) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Profile"
        subtitle={`${profile.email} · joined ${formatDate(profile.createdAt)}`}
      />

      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="text-sm text-text-secondary">Display name</span>
          <input
            className="input-field mt-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Shown on the leaderboard"
          />
          <span className="text-xs text-text-muted">
            Leave this empty to appear under an anonymous label instead.
          </span>
        </label>

        <fieldset>
          <legend className="text-sm text-text-secondary mb-2">
            Defaults for a new simulation
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <PreferenceSelect
              label="Industry"
              value={industry}
              onChange={setIndustry}
              options={INDUSTRIES}
            />
            <PreferenceSelect
              label="Difficulty"
              value={difficulty}
              onChange={setDifficulty}
              options={DIFFICULTIES}
            />
            <PreferenceSelect
              label="Company size"
              value={size}
              onChange={setSize}
              options={COMPANY_SIZES}
            />
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary text-sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {saving && <Spinner label="Saving" />}
        </div>

        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </form>
    </Card>
  );
}

function PreferenceSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block">
      <span className="text-xs text-text-muted">{label}</span>
      <select
        aria-label={label}
        className="input-field mt-1 py-1.5 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">No preference</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await apiSend('/api/profile/password', 'POST', {
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
      setMessage({ tone: 'success', text: 'Password changed.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (cause) {
      setMessage({ tone: 'danger', text: messageFor(cause) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Password"
        subtitle="Your current password is required, even though you are signed in."
      />

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-sm text-text-secondary">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            className="input-field mt-1"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            className="input-field mt-1"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
          <span className="text-xs text-text-muted">
            At least {MIN_PASSWORD_LENGTH} characters.
          </span>
        </label>

        <label className="block">
          <span className="text-sm text-text-secondary">Repeat new password</span>
          <input
            type="password"
            autoComplete="new-password"
            className="input-field mt-1"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>

        <button type="submit" className="btn-primary text-sm" disabled={saving}>
          {saving ? 'Changing…' : 'Change password'}
        </button>

        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </form>
    </Card>
  );
}

function DangerSection({ profile }: { profile: ProfilePayload }) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setDeleting(true);
    setError(null);

    try {
      await apiSend('/api/profile', 'DELETE', { password, confirm });
      router.push('/auth/register');
    } catch (cause) {
      setError(messageFor(cause));
      setDeleting(false);
    }
  }

  return (
    <Card className="border-accent-red/40">
      <CardHeader
        title="Delete account"
        subtitle="This cannot be undone. Everything below goes with it."
      />

      <StatRow>
        <StatTile label="Simulations" value={profile.stats.simulations} />
        <StatTile label="Completed runs" value={profile.stats.completedRuns} />
        <StatTile label="Achievements" value={profile.stats.achievements} />
        <StatTile label="Templates" value={profile.stats.templates} />
      </StatRow>

      {open ? (
        <form onSubmit={submit} className="space-y-3 mt-5">
          <label className="block">
            <span className="text-sm text-text-secondary">Your password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="input-field mt-1"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm text-text-secondary">
              Type {DELETE_CONFIRMATION} to confirm
            </span>
            <input
              className="input-field mt-1 font-mono"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </label>

          <div className="flex gap-2">
            <button type="submit" className="btn-danger text-sm" disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete my account'}
            </button>
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => setOpen(false)}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>

          {error !== null && <Notice tone="danger">{error}</Notice>}
        </form>
      ) : (
        <button type="button" className="btn-ghost text-sm mt-5" onClick={() => setOpen(true)}>
          Delete account…
        </button>
      )}
    </Card>
  );
}
