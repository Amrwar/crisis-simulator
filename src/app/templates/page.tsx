'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AppHeader } from '@/components/layout/AppHeader';
import { Badge, difficultyTone, industryIcon } from '@/components/ui/Badge';
import { Card, CardHeader, SectionHeading } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState, Notice } from '@/components/ui/States';
import { ApiError, apiGet, apiSend, messageFor } from '@/lib/client/api';
import { fetchCurrentUser, type CurrentUser } from '@/lib/client/session';
import { pluralize } from '@/lib/format';
import {
  describeModifiers,
  type BuiltInTemplate,
  type StoredTemplate,
  type TemplatesPayload,
} from '@/lib/game/scenario-templates';
import { COMPANY_SIZES, DIFFICULTIES, INDUSTRIES } from '@/types';

export default function TemplatesPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<TemplatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchCurrentUser().then(setUser);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setData(await apiGet<TemplatesPayload>('/api/templates'));
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

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Scenario templates</h1>
            <p className="text-text-secondary mt-1">
              Named starting positions. Launch one straight into a new simulation.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary text-sm shrink-0"
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? 'Cancel' : 'New template'}
          </button>
        </div>

        {creating && (
          <div className="mb-8">
            <TemplateForm
              onCreated={() => {
                setCreating(false);
                load();
              }}
            />
          </div>
        )}

        {loading && data === null ? (
          <LoadingState label="Loading templates…" />
        ) : error !== null ? (
          <ErrorState message={error} onRetry={load} />
        ) : data === null ? null : (
          <div className="space-y-8">
            <section>
              <SectionHeading>Built in</SectionHeading>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.builtIn.map((template) => (
                  <BuiltInCard key={template.key} template={template} />
                ))}
              </div>
            </section>

            <section>
              <SectionHeading>Yours</SectionHeading>
              {data.mine.length === 0 ? (
                <EmptyState
                  icon="🗂️"
                  title="No templates of your own yet"
                  description="Save a starting position you want to come back to — a class exercise, or a scenario you are practising."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {data.mine.map((template) => (
                    <StoredCard key={template.id} template={template} onChanged={load} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function launchHref(params: {
  industry: string;
  difficulty: string;
  companySize: string;
  templateKey: string;
}): string {
  const search = new URLSearchParams(params);
  return `/new?${search.toString()}`;
}

function BuiltInCard({ template }: { template: BuiltInTemplate }) {
  return (
    <Card>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl" aria-hidden="true">
          {template.emoji}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary leading-tight">{template.name}</h3>
          <p className="text-xs text-text-muted mt-1">{template.description}</p>
        </div>
      </div>

      <TemplateMeta
        industry={template.industry}
        difficulty={template.difficulty}
        companySize={template.companySize}
      />

      <p className="text-xs text-text-muted font-mono mt-3 mb-4">
        {describeModifiers(template.metricModifiers)}
      </p>

      <Link
        href={launchHref({
          industry: template.industry,
          difficulty: template.difficulty,
          companySize: template.companySize,
          templateKey: template.key,
        })}
        className="btn-primary text-sm inline-block"
      >
        Launch
      </Link>
    </Card>
  );
}

function StoredCard({ template, onChanged }: { template: StoredTemplate; onChanged: () => void }) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setRemoving(true);
    setError(null);

    try {
      await apiSend(`/api/templates/${template.id}`, 'DELETE');
      onChanged();
    } catch (cause) {
      setError(messageFor(cause));
      setRemoving(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary leading-tight">{template.name}</h3>
          {template.description !== '' && (
            <p className="text-xs text-text-muted mt-1">{template.description}</p>
          )}
        </div>
        {template.usageCount > 0 && (
          <Badge tone="neutral">{pluralize(template.usageCount, 'run')}</Badge>
        )}
      </div>

      <TemplateMeta
        industry={template.industry}
        difficulty={template.difficulty}
        companySize={template.companySize}
      />

      <p className="text-xs text-text-muted font-mono mt-3 mb-4">
        {describeModifiers(template.metricModifiers)}
      </p>

      <div className="flex gap-2">
        <Link
          href={launchHref({
            industry: template.industry,
            difficulty: template.difficulty,
            companySize: template.companySize,
            templateKey: template.id,
          })}
          className="btn-primary text-sm"
        >
          Launch
        </Link>
        <button type="button" className="btn-ghost text-sm" onClick={remove} disabled={removing}>
          {removing ? 'Deleting…' : 'Delete'}
        </button>
      </div>

      {error !== null && (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
    </Card>
  );
}

function TemplateMeta({
  industry,
  difficulty,
  companySize,
}: {
  industry: string;
  difficulty: string;
  companySize: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="neutral">
        <span aria-hidden="true">{industryIcon(industry)}</span> {industry}
      </Badge>
      <Badge tone={difficultyTone(difficulty)}>{difficulty}</Badge>
      <Badge tone="neutral">{companySize}</Badge>
    </div>
  );
}

function TemplateForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [industry, setIndustry] = useState<string>(INDUSTRIES[0]);
  const [difficulty, setDifficulty] = useState<string>(DIFFICULTIES[1]);
  const [companySize, setCompanySize] = useState<string>(COMPANY_SIZES[0]);
  const [cash, setCash] = useState('0');
  const [reputation, setReputation] = useState('0');
  const [morale, setMorale] = useState('0');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const metricModifiers: Record<string, number> = {};
    for (const [key, raw] of [
      ['cash', cash],
      ['reputation', reputation],
      ['morale', morale],
    ] as const) {
      const value = Number(raw);
      // A zero is not a modifier, and an unparseable box is treated as blank.
      if (Number.isFinite(value) && value !== 0) metricModifiers[key] = value;
    }

    try {
      await apiSend('/api/templates', 'POST', {
        name,
        description,
        industry,
        difficulty,
        companySize,
        metricModifiers,
      });
      onCreated();
    } catch (cause) {
      setError(messageFor(cause));
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="New template"
        subtitle="A starting position plus the amounts you want moved on top of it."
      />

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-text-secondary">Name</span>
            <input
              className="input-field mt-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Week 3 exercise"
            />
          </label>
          <label className="block">
            <span className="text-sm text-text-secondary">Description</span>
            <input
              className="input-field mt-1"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What the scenario is about"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Industry" value={industry} onChange={setIndustry} options={INDUSTRIES} />
          <SelectField
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTIES}
          />
          <SelectField
            label="Company size"
            value={companySize}
            onChange={setCompanySize}
            options={COMPANY_SIZES}
          />
        </div>

        <fieldset>
          <legend className="text-sm text-text-secondary mb-2">Starting adjustments</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label="Cash (EGP)" value={cash} onChange={setCash} />
            <NumberField label="Reputation" value={reputation} onChange={setReputation} />
            <NumberField label="Morale" value={morale} onChange={setMorale} />
          </div>
        </fieldset>

        <button type="submit" className="btn-primary text-sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save template'}
        </button>

        {error !== null && <Notice tone="danger">{error}</Notice>}
      </form>
    </Card>
  );
}

function SelectField({
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
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-text-muted">{label}</span>
      <input
        type="number"
        aria-label={label}
        className="input-field mt-1 py-1.5 text-sm font-mono"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
