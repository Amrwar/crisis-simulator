'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { EventPanel } from '@/components/sim/EventPanel';
import { DecisionPanel } from '@/components/sim/DecisionPanel';
import { MetricsSidebar, type Metrics } from '@/components/sim/MetricsSidebar';
import { Timeline } from '@/components/sim/Timeline';

interface Turn {
  id: string;
  turnNumber: number;
  title: string;
  narrative: string;
  characterMessagesParsed: Array<{ from: string; message: string }>;
  newsOrSocialParsed?: { type: 'news' | 'social'; text: string } | null;
  optionsParsed: Array<{ id: 'A' | 'B' | 'C' | 'D'; text: string; risk: string; tags: string[] }>;
  tagsParsed: string[];
  metricDeltasParsed: Record<string, number>;
  optionId?: string;
  freeText?: string;
  coachFeedback?: string;
  coachWhyMatters?: string;
  decidedAt?: string | null;
  cashAfter: number;
}

interface SimData {
  id: string;
  companyName: string;
  industry: string;
  difficulty: string;
  companySize: string;
  status: string;
  endingType: string;
  currentTurn: number;
  maxTurns: number;
  competitorName: string;
  competitorStrategy: string;
  cash: number;
  monthlyRevenue: number;
  burnRate: number;
  reputation: number;
  morale: number;
  churn: number;
  legalRisk: number;
  marketShare: number;
  turns: Turn[];
  flags: Record<string, boolean>;
}

interface AchievementToast {
  type: string;
  label: string;
  emoji: string;
}

const ACHIEVEMENT_META: Record<string, { label: string; emoji: string }> = {
  crisis_manager: { label: 'Crisis Manager', emoji: '🛡️' },
  negotiator: { label: 'Master Negotiator', emoji: '🤝' },
  turnaround: { label: 'Turnaround Artist', emoji: '📈' },
  brand_guardian: { label: 'Brand Guardian', emoji: '⭐' },
};

export default function SimPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [sim, setSim] = useState<SimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastDeltas, setLastDeltas] = useState<Partial<Metrics>>({});
  const [achievements, setAchievements] = useState<AchievementToast[]>([]);

  const fetchSim = useCallback(async () => {
    try {
      const res = await fetch(`/api/simulations/${id}`);
      if (res.status === 401) { router.push('/auth/login'); return; }
      if (!res.ok) { setError('Simulation not found'); return; }
      const data = await res.json();
      setSim(data);
    } catch {
      setError('Failed to load simulation');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchSim();
  }, [fetchSim]);

  // Redirect to report if ended
  useEffect(() => {
    if (sim?.status === 'ended') {
      router.push(`/sim/${id}/report`);
    }
  }, [sim?.status, id, router]);

  async function handleDecision(decision: { optionId?: 'A' | 'B' | 'C' | 'D'; freeText?: string }) {
    if (!sim || submitting) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/simulations/${id}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to process decision');
        return;
      }

      // Show achievements
      if (data.newAchievements?.length > 0) {
        const toasts = data.newAchievements
          .map((type: string) => ({
            type,
            label: ACHIEVEMENT_META[type]?.label || type,
            emoji: ACHIEVEMENT_META[type]?.emoji || '🏆',
          }));
        setAchievements(toasts);
        setTimeout(() => setAchievements([]), 4000);
      }

      // Store last deltas for metrics display
      setLastDeltas(data.deltas || {});

      if (data.ending?.ended) {
        // Game ended — navigate to report
        router.push(`/sim/${id}/report`);
        return;
      }

      // Refresh sim data
      await fetchSim();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-muted">Loading simulation…</p>
        </div>
      </div>
    );
  }

  if (!sim) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-accent-red mb-4">{error || 'Simulation not found'}</p>
          <Link href="/dashboard" className="btn-ghost">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const currentTurnData = sim.turns.find((t) => t.turnNumber === sim.currentTurn);
  const prevTurnData = sim.turns.find((t) => t.turnNumber === sim.currentTurn - 1);
  const isCurrentTurnDecided = !!currentTurnData?.decidedAt;

  const metrics: Metrics = {
    cash: sim.cash,
    monthlyRevenue: sim.monthlyRevenue,
    burnRate: sim.burnRate,
    reputation: sim.reputation,
    morale: sim.morale,
    churn: sim.churn,
    legalRisk: sim.legalRisk,
    marketShare: sim.marketShare,
  };

  // Starting cash from turn 1
  const startingCash = sim.turns[0]?.cashAfter ?? sim.cash;

  const timelineTurns = sim.turns.map((t) => ({
    turnNumber: t.turnNumber,
    title: t.title,
    optionId: t.optionId,
    freeText: t.freeText,
    tags: t.tagsParsed,
    metricDeltas: t.metricDeltasParsed,
    decidedAt: t.decidedAt,
  }));

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-bg-border bg-bg-secondary/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-text-muted hover:text-text-primary text-sm">
              ← Dashboard
            </Link>
            <div className="h-4 w-px bg-bg-border" />
            <div>
              <span className="font-bold text-text-primary">{sim.companyName}</span>
              <span className="text-text-muted text-sm ml-2">
                {sim.industry} · {sim.difficulty} · {sim.companySize}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Competitor info */}
            <div className="hidden md:flex items-center gap-2 bg-bg-card border border-bg-border rounded-lg px-3 py-1.5 text-xs">
              <span className="text-accent-red">⚔️</span>
              <span className="text-text-muted">{sim.competitorName}</span>
              <span className="tag-badge">{sim.competitorStrategy.replace(/_/g, ' ')}</span>
            </div>

            {/* Turn indicator */}
            <div className="bg-bg-card border border-bg-border rounded-lg px-3 py-1.5 text-xs font-mono">
              <span className="text-text-muted">Turn </span>
              <span className="text-accent-blue font-bold">{sim.currentTurn}</span>
              <span className="text-text-muted">/{sim.maxTurns}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="bg-red-950/60 border-b border-accent-red/40 px-4 py-2 text-sm text-accent-red text-center">
          {error}
          <button onClick={() => setError('')} className="ml-3 underline">Dismiss</button>
        </div>
      )}

      {/* Achievement toasts */}
      {achievements.length > 0 && (
        <div className="fixed top-20 right-4 z-50 space-y-2">
          {achievements.map((a) => (
            <div
              key={a.type}
              className="flex items-center gap-3 bg-bg-card border border-accent-yellow/40 rounded-xl px-4 py-3 shadow-xl animate-slide-up"
            >
              <span className="text-2xl">{a.emoji}</span>
              <div>
                <p className="text-xs text-text-muted">Achievement Unlocked!</p>
                <p className="font-semibold text-accent-yellow">{a.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main layout */}
      <div className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px_260px] gap-6">
          {/* LEFT: Event panel */}
          <div>
            {currentTurnData ? (
              <EventPanel
                turnNumber={sim.currentTurn}
                maxTurns={sim.maxTurns}
                title={currentTurnData.title}
                narrative={currentTurnData.narrative}
                characterMessages={currentTurnData.characterMessagesParsed as any}
                newsOrSocial={currentTurnData.newsOrSocialParsed}
                competitorName={sim.competitorName}
                coachFeedback={prevTurnData?.coachFeedback}
                coachWhyMatters={prevTurnData?.coachWhyMatters}
              />
            ) : (
              <div className="text-text-muted text-sm">Loading event…</div>
            )}
          </div>

          {/* CENTER: Decision panel */}
          <div>
            {currentTurnData && !isCurrentTurnDecided ? (
              <div className="glass-panel p-5 sticky top-[65px]">
                <DecisionPanel
                  options={currentTurnData.optionsParsed as any}
                  onSubmit={handleDecision}
                  loading={submitting}
                  disabled={isCurrentTurnDecided}
                />
              </div>
            ) : isCurrentTurnDecided ? (
              <div className="glass-panel p-5 text-center">
                <div className="text-4xl mb-3">⏳</div>
                <p className="text-text-secondary font-medium">Decision submitted</p>
                <p className="text-text-muted text-sm mt-1">
                  {submitting ? 'Generating next turn…' : 'Waiting for next turn…'}
                </p>
                {submitting && (
                  <div className="mt-4 flex justify-center">
                    <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* RIGHT: Metrics + Timeline */}
          <div className="space-y-6">
            {/* Metrics sidebar */}
            <div className="glass-panel p-4">
              <MetricsSidebar
                metrics={metrics}
                deltas={lastDeltas}
                startingCash={startingCash}
              />
            </div>

            {/* Timeline */}
            <div className="glass-panel p-4">
              <Timeline turns={timelineTurns} currentTurn={sim.currentTurn} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
