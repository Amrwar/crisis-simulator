'use client';

interface CharacterMessage {
  from: 'CFO' | 'HR' | 'OPS' | 'MARKETING' | 'INVESTOR';
  message: string;
}

interface NewsOrSocial {
  type: 'news' | 'social';
  text: string;
}

interface EventPanelProps {
  turnNumber: number;
  maxTurns: number;
  title: string;
  narrative: string;
  characterMessages: CharacterMessage[];
  newsOrSocial?: NewsOrSocial | null;
  competitorName?: string;
  coachFeedback?: string;
  coachWhyMatters?: string;
}

const CHARACTER_META: Record<
  string,
  { icon: string; label: string; color: string; border: string }
> = {
  CFO: {
    icon: '💼',
    label: 'CFO',
    color: 'text-accent-green',
    border: 'border-accent-green/30',
  },
  HR: {
    icon: '👥',
    label: 'HR Director',
    color: 'text-accent-blue',
    border: 'border-accent-blue/30',
  },
  OPS: {
    icon: '⚙️',
    label: 'Operations',
    color: 'text-accent-orange',
    border: 'border-accent-orange/30',
  },
  MARKETING: {
    icon: '📣',
    label: 'Marketing',
    color: 'text-accent-purple',
    border: 'border-accent-purple/30',
  },
  INVESTOR: {
    icon: '📈',
    label: 'Investor',
    color: 'text-accent-yellow',
    border: 'border-accent-yellow/30',
  },
};

export function EventPanel({
  turnNumber,
  maxTurns,
  title,
  narrative,
  characterMessages,
  newsOrSocial,
  competitorName,
  coachFeedback,
  coachWhyMatters,
}: EventPanelProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Turn header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: maxTurns }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i < turnNumber ? 'bg-accent-blue w-4' : 'bg-bg-border w-2'
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-text-muted ml-1">
          Turn {turnNumber} / {maxTurns}
        </span>
      </div>

      {/* Event title */}
      <div>
        <h2 className="text-xl font-bold text-text-primary leading-tight">{title}</h2>
      </div>

      {/* Narrative */}
      <div className="glass-panel p-5">
        <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-line">
          {narrative}
        </p>
      </div>

      {/* Character messages */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Incoming Messages
        </h3>
        {characterMessages.map((msg, i) => {
          const meta = CHARACTER_META[msg.from] || {
            icon: '🧑',
            label: msg.from,
            color: 'text-text-secondary',
            border: 'border-bg-border',
          };
          return (
            <div
              key={i}
              className={`flex gap-3 p-3 rounded-lg bg-bg-card border ${meta.border}`}
            >
              <span className="text-lg mt-0.5 flex-shrink-0">{meta.icon}</span>
              <div className="min-w-0">
                <span className={`text-xs font-semibold uppercase tracking-wide ${meta.color}`}>
                  {meta.label}
                </span>
                <p className="text-sm text-text-secondary mt-0.5 leading-relaxed">{msg.message}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* News / Social */}
      {newsOrSocial && (
        <div
          className={`p-4 rounded-lg border ${
            newsOrSocial.type === 'news'
              ? 'bg-blue-950/20 border-accent-blue/30'
              : 'bg-purple-950/20 border-accent-purple/30'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span>{newsOrSocial.type === 'news' ? '📰' : '📱'}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {newsOrSocial.type === 'news' ? 'News Headline' : 'Social Media'}
            </span>
          </div>
          <p className="text-sm text-text-primary italic">"{newsOrSocial.text}"</p>
        </div>
      )}

      {/* Coach feedback (from last turn) */}
      {coachFeedback && (
        <div className="p-4 rounded-lg bg-bg-card border border-accent-cyan/20">
          <div className="flex items-center gap-2 mb-2">
            <span>🎓</span>
            <span className="text-xs font-semibold text-accent-cyan uppercase tracking-wide">
              Coach Feedback — Previous Decision
            </span>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">{coachFeedback}</p>
          {coachWhyMatters && (
            <p className="text-xs text-text-muted mt-2 italic">{coachWhyMatters}</p>
          )}
        </div>
      )}
    </div>
  );
}
