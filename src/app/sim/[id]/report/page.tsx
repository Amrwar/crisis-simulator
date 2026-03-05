'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface FinalReport {
  overallScore: number;
  skillScores: {
    finance: number;
    leadership: number;
    risk: number;
    communication: number;
    ethics: number;
  };
  endingType: string;
  strengths: string[];
  improvements: string[];
  learningPath: string[];
  summary: string;
}

interface Achievement {
  type: string;
  unlockedAt: string;
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
  cash: number;
  monthlyRevenue: number;
  burnRate: number;
  reputation: number;
  morale: number;
  churn: number;
  legalRisk: number;
  marketShare: number;
  achievements: Achievement[];
  finalReport: FinalReport | null;
  turns: Array<{
    turnNumber: number;
    title: string;
    optionId: string;
    freeText: string;
    tagsParsed: string[];
    metricDeltasParsed: Record<string, number>;
    decidedAt: string | null;
    cashAfter: number;
    reputationAfter: number;
    marketShareAfter: number;
  }>;
}

const ENDING_META: Record<
  string,
  { label: string; color: string; bg: string; border: string; desc: string; icon: string }
> = {
  growth_win: {
    label: 'Growth Champion',
    color: 'text-accent-green',
    bg: 'bg-green-950/30',
    border: 'border-accent-green/40',
    desc: 'Exceptional leadership. Strong market position with healthy cash reserves.',
    icon: '🏆',
  },
  survival: {
    label: 'Survivor',
    color: 'text-accent-blue',
    bg: 'bg-blue-950/30',
    border: 'border-accent-blue/40',
    desc: 'Solid management under pressure. The business endured all challenges.',
    icon: '🛡️',
  },
  takeover: {
    label: 'Investor Takeover',
    color: 'text-accent-orange',
    bg: 'bg-orange-950/30',
    border: 'border-accent-orange/40',
    desc: 'The board replaced management. A hard lesson in stakeholder expectations.',
    icon: '🔄',
  },
  bankruptcy: {
    label: 'Bankruptcy',
    color: 'text-accent-red',
    bg: 'bg-red-950/30',
    border: 'border-accent-red/40',
    desc: 'Cash ran out. Critical decisions led to unsustainable depletion.',
    icon: '💸',
  },
  scandal: {
    label: 'Corporate Scandal',
    color: 'text-accent-red',
    bg: 'bg-red-950/30',
    border: 'border-accent-red/40',
    desc: 'Legal and reputational failures destroyed the business.',
    icon: '⚠️',
  },
};

const ACHIEVEMENT_META: Record<string, { label: string; desc: string; emoji: string }> = {
  crisis_manager: { label: 'Crisis Manager', desc: 'Survived all 10 turns.', emoji: '🛡️' },
  negotiator: { label: 'Master Negotiator', desc: 'Negotiated with suppliers 3+ times.', emoji: '🤝' },
  turnaround: { label: 'Turnaround Artist', desc: 'Recovered from near-bankruptcy.', emoji: '📈' },
  brand_guardian: { label: 'Brand Guardian', desc: 'Maintained reputation ≥ 80.', emoji: '⭐' },
};

const SKILL_ICONS: Record<string, string> = {
  finance: '💰',
  leadership: '👑',
  risk: '⚖️',
  communication: '📣',
  ethics: '🌟',
};

function formatEGP(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M EGP`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K EGP`;
  return `${Math.round(n)} EGP`;
}

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const pct = Math.min(100, Math.max(0, score));
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="#1e2a3a" strokeWidth="5" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-text-primary">{score}</span>
        </div>
      </div>
      <span className="text-xs text-text-muted capitalize">{label}</span>
    </div>
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sim, setSim] = useState<SimData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/simulations/${id}`);
      if (res.status === 401) { router.push('/auth/login'); return; }
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setSim(data);
      setLoading(false);
    }
    load();
  }, [id, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!sim) return null;

  const ending = ENDING_META[sim.endingType] || ENDING_META.survival;
  const report = sim.finalReport;
  const completedTurns = sim.turns.filter((t) => t.decidedAt);

  // Cash trajectory from turns
  const cashHistory = sim.turns.map((t) => ({ turn: t.turnNumber, cash: t.cashAfter }));

  return (
    <div className="min-h-screen">
      <header className="border-b border-bg-border bg-bg-secondary/50 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-text-muted hover:text-text-primary text-sm">
            ← Dashboard
          </Link>
          <span className="text-2xl font-bold">
            <span className="text-text-primary">Crisis</span>
            <span className="text-accent-red">Sim</span>
          </span>
          <Link href="/new" className="btn-primary text-sm px-4 py-2">
            New Simulation
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        {/* Ending banner */}
        <div className={`rounded-2xl border p-8 text-center ${ending.bg} ${ending.border}`}>
          <div className="text-6xl mb-4">{ending.icon}</div>
          <h1 className={`text-4xl font-bold mb-2 ${ending.color}`}>{ending.label}</h1>
          <p className="text-text-secondary max-w-xl mx-auto">{ending.desc}</p>
          <div className="mt-4 flex items-center justify-center gap-6">
            <span className="text-text-muted text-sm">
              {sim.companyName} · {sim.industry} · {sim.difficulty}
            </span>
            <span className="text-text-muted text-sm">
              {completedTurns.length}/{sim.maxTurns} turns completed
            </span>
          </div>
        </div>

        {/* Overall score + skill breakdown */}
        {report && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Overall score */}
            <div className="glass-panel p-6 flex flex-col items-center justify-center">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-6">
                Overall Score
              </h2>
              <div className="relative w-36 h-36">
                <svg className="w-36 h-36 -rotate-90" viewBox="0 0 144 144">
                  <circle cx="72" cy="72" r="60" fill="none" stroke="#1e2a3a" strokeWidth="10" />
                  <circle
                    cx="72"
                    cy="72"
                    r="60"
                    fill="none"
                    stroke={report.overallScore >= 70 ? '#22c55e' : report.overallScore >= 40 ? '#eab308' : '#ef4444'}
                    strokeWidth="10"
                    strokeDasharray={2 * Math.PI * 60}
                    strokeDashoffset={2 * Math.PI * 60 * (1 - report.overallScore / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold text-text-primary">{report.overallScore}</span>
                  <span className="text-xs text-text-muted">/100</span>
                </div>
              </div>
            </div>

            {/* Skill scores */}
            <div className="glass-panel p-6">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-6">
                Skill Breakdown
              </h2>
              <div className="flex justify-around">
                {Object.entries(report.skillScores).map(([skill, score]) => {
                  const colors: Record<string, string> = {
                    finance: '#22c55e',
                    leadership: '#a855f7',
                    risk: '#eab308',
                    communication: '#3b82f6',
                    ethics: '#06b6d4',
                  };
                  return (
                    <div key={skill} className="flex flex-col items-center gap-1">
                      <ScoreRing score={score} label={skill} color={colors[skill] || '#3b82f6'} />
                      <span className="text-base">{SKILL_ICONS[skill]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Final metrics */}
        <div className="glass-panel p-6">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
            Final Company State
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Cash', value: formatEGP(sim.cash), color: sim.cash > 500_000 ? 'text-accent-green' : 'text-accent-red', icon: '💰' },
              { label: 'Revenue/mo', value: formatEGP(sim.monthlyRevenue), color: 'text-accent-blue', icon: '📈' },
              { label: 'Reputation', value: `${Math.round(sim.reputation)}/100`, color: 'text-accent-purple', icon: '⭐' },
              { label: 'Market Share', value: `${Math.round(sim.marketShare * 10) / 10}%`, color: 'text-accent-cyan', icon: '📊' },
              { label: 'Morale', value: `${Math.round(sim.morale)}/100`, color: sim.morale >= 60 ? 'text-accent-green' : 'text-accent-red', icon: '💙' },
              { label: 'Churn', value: `${Math.round(sim.churn)}%`, color: sim.churn <= 20 ? 'text-accent-green' : 'text-accent-red', icon: '🔄' },
              { label: 'Legal Risk', value: `${Math.round(sim.legalRisk)}/100`, color: sim.legalRisk <= 20 ? 'text-accent-green' : 'text-accent-red', icon: '⚖️' },
              { label: 'Burn Rate', value: formatEGP(sim.burnRate), color: 'text-accent-orange', icon: '🔥' },
            ].map((m) => (
              <div key={m.label} className="bg-bg-secondary rounded-lg p-3 text-center">
                <div className="text-xl mb-1">{m.icon}</div>
                <div className={`font-mono font-bold ${m.color}`}>{m.value}</div>
                <div className="text-xs text-text-muted mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements */}
        {sim.achievements.length > 0 && (
          <div className="glass-panel p-6">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
              Achievements Unlocked
            </h2>
            <div className="flex flex-wrap gap-3">
              {sim.achievements.map((a) => {
                const meta = ACHIEVEMENT_META[a.type];
                if (!meta) return null;
                return (
                  <div
                    key={a.type}
                    className="flex items-center gap-3 bg-yellow-950/30 border border-accent-yellow/30 rounded-xl px-4 py-3"
                  >
                    <span className="text-2xl">{meta.emoji}</span>
                    <div>
                      <p className="font-semibold text-accent-yellow text-sm">{meta.label}</p>
                      <p className="text-xs text-text-muted">{meta.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Report: Summary, Strengths, Improvements */}
        {report && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass-panel p-6 space-y-4">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
                What You Did Well
              </h2>
              <ul className="space-y-2">
                {report.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-text-secondary">
                    <span className="text-accent-green mt-0.5">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass-panel p-6 space-y-4">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
                Areas to Improve
              </h2>
              <ul className="space-y-2">
                {report.improvements.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-text-secondary">
                    <span className="text-accent-orange mt-0.5">→</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            {/* Summary */}
            <div className="glass-panel p-6 md:col-span-2">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
                Coach Summary
              </h2>
              <p className="text-text-secondary leading-relaxed">{report.summary}</p>
            </div>

            {/* Learning path */}
            <div className="glass-panel p-6 md:col-span-2">
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
                Recommended Learning Path
              </h2>
              <div className="space-y-2">
                {report.learningPath.map((step, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent-blue/20 border border-accent-blue/40 flex items-center justify-center text-xs text-accent-blue font-bold">
                      {i + 1}
                    </span>
                    <p className="text-sm text-text-secondary pt-0.5">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Decision timeline summary */}
        <div className="glass-panel p-6">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
            Decision History
          </h2>
          <div className="space-y-2">
            {completedTurns.map((turn) => (
              <div key={turn.turnNumber} className="flex gap-4 items-start text-sm">
                <span className="flex-shrink-0 text-text-muted font-mono w-16">
                  Turn {turn.turnNumber}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-text-secondary truncate">
                    {turn.freeText
                      ? `"${turn.freeText.slice(0, 80)}${turn.freeText.length > 80 ? '…' : ''}"`
                      : `Option ${turn.optionId}`}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {turn.tagsParsed.slice(0, 3).map((tag) => (
                      <span key={tag} className="tag-badge text-xs">
                        {tag.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className={`text-xs font-mono ${turn.metricDeltasParsed.cash >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {turn.metricDeltasParsed.cash >= 0 ? '+' : ''}{Math.round(turn.metricDeltasParsed.cash / 1000)}K
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center gap-4 pb-8">
          <Link href="/new" className="btn-primary px-8 py-3 rounded-xl">
            Try Again
          </Link>
          <Link href="/dashboard" className="btn-ghost px-8 py-3 rounded-xl">
            Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
