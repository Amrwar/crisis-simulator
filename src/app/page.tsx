import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-20 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent-blue/5 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-accent-red/5 rounded-full blur-3xl" />
        </div>

        {/* Badge */}
        <div className="mb-6 flex items-center gap-2 bg-bg-card border border-bg-border rounded-full px-4 py-1.5 text-sm text-text-secondary">
          <span className="w-2 h-2 bg-accent-green rounded-full animate-pulse-slow" />
          Live Business Simulation — Egypt/MENA Context
        </div>

        {/* Title */}
        <h1 className="text-6xl md:text-7xl font-bold text-center mb-4 leading-tight">
          <span className="text-text-primary">Crisis</span>
          <span className="text-accent-red">Sim</span>
        </h1>

        <p className="text-xl text-text-secondary text-center max-w-2xl mb-4">
          Step into the CEO seat. Every decision matters. Every turn has consequences.
          Can you steer your company through crisis?
        </p>

        <p className="text-sm text-text-muted text-center max-w-xl mb-10">
          A university-grade business simulation with AI-powered narratives, deterministic metrics,
          and real Egyptian business context. Designed for management education.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/auth/register"
            className="btn-primary text-center px-8 py-3 text-base rounded-xl"
          >
            Start Simulating
          </Link>
          <Link
            href="/auth/login"
            className="btn-ghost text-center px-8 py-3 text-base rounded-xl"
          >
            Sign In
          </Link>
        </div>

        {/* Features grid */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl w-full">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass-panel p-5">
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-text-primary mb-1">{f.title}</h3>
              <p className="text-sm text-text-secondary">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Industries */}
        <div className="mt-12 text-center">
          <p className="text-text-muted text-sm mb-4">Available Industries</p>
          <div className="flex flex-wrap justify-center gap-3">
            {['🛍️ Retail', '🍽️ Restaurant', '💻 SaaS', '🏗️ Construction', '🏥 Healthcare'].map(
              (industry) => (
                <span key={industry} className="tag-badge px-3 py-1 text-sm">
                  {industry}
                </span>
              )
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-bg-border py-6 text-center text-sm text-text-muted">
        CrisisSim — Built for Egyptian university business education
      </footer>
    </main>
  );
}

const FEATURES = [
  {
    icon: '🎯',
    title: 'Deterministic Rules',
    desc: 'Fair, consistent metric updates — AI handles storytelling, numbers follow strict rules.',
  },
  {
    icon: '🕵️',
    title: 'Hidden Variables',
    desc: 'Supplier reliability, employee loyalty, demand volatility — affecting you silently.',
  },
  {
    icon: '📰',
    title: 'Living World',
    desc: 'Recurring characters, competitor pressure, news headlines, and social media reactions.',
  },
  {
    icon: '📊',
    title: 'Performance Report',
    desc: 'Detailed final analysis of your finance, leadership, risk, and ethics skills.',
  },
];
