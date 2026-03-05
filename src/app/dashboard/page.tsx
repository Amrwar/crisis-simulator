'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SimSummary {
  id: string;
  industry: string;
  difficulty: string;
  companySize: string;
  companyName: string;
  status: string;
  endingType: string;
  currentTurn: number;
  maxTurns: number;
  cash: number;
  reputation: number;
  marketShare: number;
  createdAt: string;
  endedAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-accent-green bg-green-950/40 border-accent-green/40',
  ended: 'text-text-secondary bg-bg-secondary border-bg-border',
};

const ENDING_COLORS: Record<string, string> = {
  growth_win: 'text-accent-green',
  survival: 'text-accent-blue',
  takeover: 'text-accent-orange',
  bankruptcy: 'text-accent-red',
  scandal: 'text-accent-red',
};

const ENDING_LABELS: Record<string, string> = {
  growth_win: '🏆 Growth Win',
  survival: '🛡️ Survival',
  takeover: '🔄 Takeover',
  bankruptcy: '💸 Bankruptcy',
  scandal: '⚠️ Scandal',
};

const INDUSTRY_ICONS: Record<string, string> = {
  Retail: '🛍️',
  Restaurant: '🍽️',
  SaaS: '💻',
  Construction: '🏗️',
  Healthcare: '🏥',
};

export default function DashboardPage() {
  const router = useRouter();
  const [sims, setSims] = useState<SimSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ email: string; name?: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [meRes, simsRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/simulations'),
        ]);

        if (meRes.status === 401) {
          router.push('/auth/login');
          return;
        }

        const meData = await meRes.json();
        setUser(meData);

        if (simsRes.ok) {
          const simsData = await simsRes.json();
          setSims(simsData);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/auth/login');
  }

  const activeSims = sims.filter((s) => s.status === 'active');
  const endedSims = sims.filter((s) => s.status === 'ended');

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-bg-border bg-bg-secondary/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold">
            <span className="text-text-primary">Crisis</span>
            <span className="text-accent-red">Sim</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-text-secondary text-sm">
              {user?.name || user?.email}
            </span>
            <button onClick={handleLogout} className="btn-ghost text-sm py-1.5 px-3">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Dashboard</h1>
            <p className="text-text-secondary mt-1">
              {activeSims.length > 0
                ? `${activeSims.length} active simulation${activeSims.length > 1 ? 's' : ''}`
                : 'Start your first simulation to begin'}
            </p>
          </div>
          <Link
            href="/new"
            className="btn-primary px-6 py-3 text-sm rounded-xl inline-flex items-center gap-2"
          >
            <span>+</span> New Simulation
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-20 text-text-muted">Loading…</div>
        ) : sims.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            {/* Active simulations */}
            {activeSims.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
                  Active Simulations
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activeSims.map((sim) => (
                    <SimCard key={sim.id} sim={sim} active />
                  ))}
                </div>
              </section>
            )}

            {/* Ended simulations */}
            {endedSims.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
                  Completed Simulations
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {endedSims.map((sim) => (
                    <SimCard key={sim.id} sim={sim} active={false} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function SimCard({ sim, active }: { sim: SimSummary; active: boolean }) {
  const progress = (sim.currentTurn / sim.maxTurns) * 100;
  const netFlow = sim.cash;

  return (
    <Link
      href={sim.status === 'ended' ? `/sim/${sim.id}/report` : `/sim/${sim.id}`}
      className="glass-panel p-5 hover:border-accent-blue/40 transition-all duration-150 block group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{INDUSTRY_ICONS[sim.industry] || '🏢'}</span>
          <div>
            <h3 className="font-semibold text-text-primary text-sm leading-tight group-hover:text-accent-blue transition-colors">
              {sim.companyName || sim.industry}
            </h3>
            <p className="text-xs text-text-muted">{sim.industry} · {sim.companySize}</p>
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded border font-medium ${STATUS_COLORS[sim.status]}`}
        >
          {sim.status === 'active' ? 'Active' : 'Done'}
        </span>
      </div>

      {/* Ending badge */}
      {sim.status === 'ended' && sim.endingType && (
        <div className={`text-sm font-semibold mb-3 ${ENDING_COLORS[sim.endingType]}`}>
          {ENDING_LABELS[sim.endingType] || sim.endingType}
        </div>
      )}

      {/* Turn progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-text-muted mb-1.5">
          <span>Turn {sim.currentTurn}/{sim.maxTurns}</span>
          <span>{sim.difficulty}</span>
        </div>
        <div className="w-full bg-bg-secondary rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${active ? 'bg-accent-blue' : 'bg-bg-border'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2">
        <MetricMini label="Cash" value={formatCash(sim.cash)} color="text-accent-green" />
        <MetricMini label="Repute" value={`${Math.round(sim.reputation)}`} color="text-accent-purple" />
        <MetricMini label="Mkt%" value={`${Math.round(sim.marketShare)}%`} color="text-accent-blue" />
      </div>

      {/* Date */}
      <p className="text-xs text-text-muted mt-3">
        {new Date(sim.createdAt).toLocaleDateString('en-EG', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </p>
    </Link>
  );
}

function MetricMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg-secondary rounded-md p-2 text-center">
      <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">🏢</div>
      <h3 className="text-xl font-semibold text-text-primary mb-2">No simulations yet</h3>
      <p className="text-text-secondary mb-6">
        Start your first simulation to experience the CEO seat.
      </p>
      <Link href="/new" className="btn-primary px-6 py-3 rounded-xl">
        Create First Simulation
      </Link>
    </div>
  );
}

function formatCash(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return String(Math.round(amount));
}
