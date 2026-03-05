'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const INDUSTRIES = [
  { id: 'Retail', icon: '🛍️', label: 'Retail', desc: 'Consumer goods, storefronts, e-commerce' },
  { id: 'Restaurant', icon: '🍽️', label: 'Restaurant', desc: 'F&B, food supply chains, staff turnover' },
  { id: 'SaaS', icon: '💻', label: 'SaaS', desc: 'Tech startup, recurring revenue, growth pressure' },
  { id: 'Construction', icon: '🏗️', label: 'Construction', desc: 'Capital-heavy, regulatory, project delays' },
  { id: 'Healthcare', icon: '🏥', label: 'Healthcare', desc: 'Clinic/hospital, compliance, patient trust' },
];

const DIFFICULTIES = [
  {
    id: 'Easy',
    label: 'Easy',
    desc: 'Healthy starting position. Forgiving mistakes. Good for first timers.',
    color: 'border-accent-green hover:bg-green-950/20',
    selectedColor: 'border-accent-green bg-green-950/30',
    badge: '🟢',
  },
  {
    id: 'Medium',
    label: 'Medium',
    desc: 'Balanced. Some pressure from day one. Realistic business environment.',
    color: 'border-bg-border hover:bg-bg-hover',
    selectedColor: 'border-accent-blue bg-blue-950/30',
    badge: '🔵',
  },
  {
    id: 'Hard',
    label: 'Hard',
    desc: 'Crisis from turn 1. Every decision is high stakes. Negative effects amplified.',
    color: 'border-accent-red/40 hover:bg-red-950/20',
    selectedColor: 'border-accent-red bg-red-950/30',
    badge: '🔴',
  },
];

const SIZES = [
  {
    id: 'Small',
    icon: '🏪',
    label: 'Small Company',
    desc: '~600K EGP starting cash · 220K/mo revenue · 10-30 employees',
  },
  {
    id: 'Medium',
    icon: '🏢',
    label: 'Medium Company',
    desc: '~2.2M EGP starting cash · 850K/mo revenue · 50-200 employees',
  },
];

export default function NewSimPage() {
  const router = useRouter();
  const [industry, setIndustry] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = industry && difficulty && companySize && !loading;

  async function handleCreate() {
    if (!canSubmit) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry, difficulty, companySize }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create simulation');
        return;
      }

      router.push(`/sim/${data.id}`);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-bg-border bg-bg-secondary/50 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-text-muted hover:text-text-primary text-sm">
            ← Dashboard
          </Link>
          <span className="text-bg-border">|</span>
          <span className="text-2xl font-bold">
            <span className="text-text-primary">Crisis</span>
            <span className="text-accent-red">Sim</span>
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-text-primary mb-2">New Simulation</h1>
          <p className="text-text-secondary">
            Configure your company. Your decisions will shape its fate over 10 turns.
          </p>
        </div>

        <div className="space-y-10">
          {/* Industry */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-1">
              Select Industry
            </h2>
            <p className="text-sm text-text-muted mb-4">
              Each industry has unique challenges and starting conditions.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => setIndustry(ind.id)}
                  className={`option-card text-left transition-all ${
                    industry === ind.id
                      ? 'border-accent-blue bg-blue-950/30'
                      : 'border-bg-border hover:border-accent-blue/50 hover:bg-bg-hover'
                  }`}
                >
                  <div className="text-2xl mb-2">{ind.icon}</div>
                  <div className="font-semibold text-text-primary">{ind.label}</div>
                  <div className="text-xs text-text-muted mt-1">{ind.desc}</div>
                  {industry === ind.id && (
                    <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-accent-blue flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Difficulty */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-1">
              Difficulty
            </h2>
            <p className="text-sm text-text-muted mb-4">
              Difficulty affects starting conditions and amplifies negative consequences.
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={`option-card text-left transition-all ${
                    difficulty === d.id ? d.selectedColor : d.color
                  }`}
                >
                  <div className="text-xl mb-2">{d.badge}</div>
                  <div className="font-semibold text-text-primary">{d.label}</div>
                  <div className="text-xs text-text-muted mt-1">{d.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Company Size */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-1">
              Company Size
            </h2>
            <p className="text-sm text-text-muted mb-4">
              Determines starting capital, revenue scale, and operational complexity.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {SIZES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setCompanySize(s.id)}
                  className={`option-card text-left transition-all ${
                    companySize === s.id
                      ? 'border-accent-blue bg-blue-950/30'
                      : 'border-bg-border hover:border-accent-blue/50 hover:bg-bg-hover'
                  }`}
                >
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <div className="font-semibold text-text-primary">{s.label}</div>
                  <div className="text-xs text-text-muted mt-1">{s.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Summary + Create */}
          {industry && difficulty && companySize && (
            <section className="glass-panel p-6 animate-fade-in">
              <h3 className="font-semibold text-text-primary mb-3">Simulation Preview</h3>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-xs text-text-muted">Industry</p>
                  <p className="font-medium text-text-primary">{industry}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Difficulty</p>
                  <p className="font-medium text-text-primary">{difficulty}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Company Size</p>
                  <p className="font-medium text-text-primary">{companySize}</p>
                </div>
              </div>
              <p className="text-sm text-text-secondary mb-4">
                The AI will generate your company name, competitor, and opening crisis. Metrics are set
                deterministically based on your choices.
              </p>
              {error && (
                <div className="bg-red-950/40 border border-accent-red/40 text-accent-red text-sm rounded-lg px-4 py-3 mb-4">
                  {error}
                </div>
              )}
              <button
                onClick={handleCreate}
                disabled={!canSubmit}
                className="btn-primary w-full py-3 text-base rounded-xl"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating your company…
                  </span>
                ) : (
                  'Launch Simulation →'
                )}
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
