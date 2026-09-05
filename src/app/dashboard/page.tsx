'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { SimulationCard } from '@/components/dashboard/SimulationCard';
import { AppHeader } from '@/components/layout/AppHeader';
import { FilterBar, FilterSelect, SearchInput } from '@/components/ui/FilterBar';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { ApiError, apiGet, buildQuery, messageFor } from '@/lib/client/api';
import { fetchCurrentUser, type CurrentUser } from '@/lib/client/session';
import { humanizeTag } from '@/lib/format';
import type { SortDirection, SortField } from '@/lib/simulations/filters';
import type { SimulationSearchPayload } from '@/lib/simulations/results';
import { DIFFICULTIES, ENDING_TYPES, INDUSTRIES, SIMULATION_STATUSES } from '@/types';

const INDUSTRY_OPTIONS = INDUSTRIES.map((value) => ({ value, label: value }));
const DIFFICULTY_OPTIONS = DIFFICULTIES.map((value) => ({ value, label: value }));
const STATUS_OPTIONS = SIMULATION_STATUSES.map((value) => ({
  value,
  label: value === 'active' ? 'In progress' : 'Completed',
}));
const ENDING_OPTIONS = ENDING_TYPES.map((value) => ({ value, label: humanizeTag(value) }));

const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'performanceScore:desc', label: 'Best score' },
  { value: 'performanceScore:asc', label: 'Worst score' },
  { value: 'currentTurn:desc', label: 'Furthest played' },
  { value: 'companyName:asc', label: 'Company name' },
];

/** How long to wait after the last keystroke before searching. */
const SEARCH_DEBOUNCE_MS = 250;

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [data, setData] = useState<SimulationSearchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [status, setStatus] = useState('');
  const [ending, setEnding] = useState('');
  const [tag, setTag] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchCurrentUser().then(setUser);
  }, []);

  // Typing should not fire one request per character.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [field, direction] = sort.split(':') as [SortField, SortDirection];

    try {
      const query = buildQuery({
        q: debouncedSearch,
        industry,
        difficulty,
        status,
        ending,
        tag,
        from,
        to,
        sort: field,
        direction,
        page,
        pageSize: 12,
      });
      setData(await apiGet<SimulationSearchPayload>(`/api/simulations/search${query}`));
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push('/auth/login');
        return;
      }
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, industry, difficulty, status, ending, tag, from, to, sort, page, router]);

  useEffect(() => {
    load();
  }, [load]);

  const activeFilters = [
    debouncedSearch,
    industry,
    difficulty,
    status,
    ending,
    tag,
    from,
    to,
  ].filter((value) => value !== '').length;

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setIndustry('');
    setDifficulty('');
    setStatus('');
    setEnding('');
    setTag('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  /** A changed filter resets to page one: page 4 of the old result is meaningless. */
  function change(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  const total = data?.page.total ?? 0;
  const neverPlayed = activeFilters === 0 && total === 0 && !loading;

  return (
    <div className="min-h-screen">
      <AppHeader user={user} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Dashboard</h1>
            <p className="text-text-secondary mt-1">
              {total === 0
                ? 'Start your first simulation to begin'
                : `${total} simulation${total === 1 ? '' : 's'}${
                    activeFilters > 0 ? ' matching your filters' : ''
                  }`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/templates" className="btn-ghost text-sm py-3 px-4 rounded-xl">
              Templates
            </Link>
            <Link
              href="/new"
              className="btn-primary px-6 py-3 text-sm rounded-xl inline-flex items-center gap-2"
            >
              <span aria-hidden="true">+</span> New Simulation
            </Link>
          </div>
        </div>

        {!neverPlayed && (
          <FilterBar onClear={clearFilters} activeCount={activeFilters}>
            <SearchInput
              label="Search"
              value={search}
              onChange={setSearch}
              placeholder="Company, competitor or situation"
            />
            <FilterSelect
              label="Status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={change(setStatus)}
              anyLabel="Any status"
            />
            <FilterSelect
              label="Industry"
              value={industry}
              options={INDUSTRY_OPTIONS}
              onChange={change(setIndustry)}
              anyLabel="Any industry"
            />
            <FilterSelect
              label="Difficulty"
              value={difficulty}
              options={DIFFICULTY_OPTIONS}
              onChange={change(setDifficulty)}
              anyLabel="Any difficulty"
            />
            <FilterSelect
              label="Ending"
              value={ending}
              options={ENDING_OPTIONS}
              onChange={change(setEnding)}
              anyLabel="Any ending"
            />
            {(data?.availableTags.length ?? 0) > 0 && (
              <FilterSelect
                label="Label"
                value={tag}
                options={(data?.availableTags ?? []).map((value) => ({ value, label: value }))}
                onChange={change(setTag)}
                anyLabel="Any label"
              />
            )}
            <DateField label="From" value={from} onChange={change(setFrom)} />
            <DateField label="To" value={to} onChange={change(setTo)} />
            <FilterSelect
              label="Sort by"
              value={sort}
              options={SORT_OPTIONS}
              onChange={change(setSort)}
              anyLabel="Newest first"
            />
          </FilterBar>
        )}

        {loading && data === null ? (
          <LoadingState />
        ) : error !== null ? (
          <ErrorState message={error} onRetry={load} />
        ) : neverPlayed ? (
          <EmptyState
            icon="🏢"
            title="No simulations yet"
            description="Start your first simulation to experience the CEO seat, or launch one from a template."
            action={{ href: '/new', label: 'Create First Simulation' }}
          />
        ) : data === null || data.page.items.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="Nothing matches those filters"
            description="Try widening the search, or clear the filters to see every run."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.page.items.map((sim) => (
                <SimulationCard key={sim.id} sim={sim} />
              ))}
            </div>
            <Pagination page={data.page} onPageChange={setPage} itemLabel="simulations" />
          </>
        )}
      </main>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      {label}
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-field py-1.5 text-sm"
      />
    </label>
  );
}
