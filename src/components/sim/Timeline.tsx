'use client';

interface TurnEntry {
  turnNumber: number;
  title: string;
  optionId?: string;
  freeText?: string;
  tags?: string[];
  metricDeltas?: Record<string, number>;
  decidedAt?: string | null;
}

interface TimelineProps {
  turns: TurnEntry[];
  currentTurn: number;
}

function formatDelta(key: string, value: number): { label: string; color: string } {
  const isMonetary = ['cash', 'monthlyRevenue', 'burnRate'].includes(key);
  const isInvertedBad = ['churn', 'legalRisk'].includes(key);

  let formatted = '';
  if (isMonetary) {
    const abs = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    formatted = `${sign}${abs >= 1_000_000 ? `${(abs / 1_000_000).toFixed(1)}M` : abs >= 1_000 ? `${Math.round(abs / 1_000)}K` : abs} EGP`;
  } else {
    formatted = `${value >= 0 ? '+' : ''}${Math.round(value * 10) / 10}`;
  }

  const isGood = isInvertedBad ? value < 0 : value > 0;
  const color = value === 0 ? 'text-text-muted' : isGood ? 'text-accent-green' : 'text-accent-red';

  return { label: formatted, color };
}

const DELTA_LABELS: Record<string, string> = {
  cash: 'Cash',
  monthlyRevenue: 'Revenue',
  burnRate: 'Burn',
  reputation: 'Rep',
  morale: 'Morale',
  churn: 'Churn',
  legalRisk: 'Legal',
  marketShare: 'Mkt%',
};

const KEY_DELTAS = ['cash', 'reputation', 'morale', 'churn', 'legalRisk', 'marketShare'];

export function Timeline({ turns, currentTurn }: TimelineProps) {
  const completedTurns = turns
    .filter((t) => t.decidedAt)
    .sort((a, b) => b.turnNumber - a.turnNumber);

  if (completedTurns.length === 0) {
    return (
      <div className="text-xs text-text-muted text-center py-4">
        Your decision history will appear here
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
        Turn History
      </h3>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {completedTurns.map((turn) => {
          const decision = turn.freeText
            ? turn.freeText.slice(0, 60) + (turn.freeText.length > 60 ? '…' : '')
            : `Option ${turn.optionId}`;

          return (
            <div
              key={turn.turnNumber}
              className="bg-bg-secondary border border-bg-border rounded-lg p-3 text-xs"
            >
              {/* Turn header */}
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-text-primary">
                  T{turn.turnNumber}: {turn.title}
                </span>
                <span className="text-text-muted">Done</span>
              </div>

              {/* Decision */}
              <p className="text-text-muted italic mb-2">&quot;{decision}&quot;</p>

              {/* Tags */}
              {turn.tags && turn.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {turn.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="tag-badge text-xs">
                      {tag.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {turn.tags.length > 3 && (
                    <span className="tag-badge text-xs">+{turn.tags.length - 3}</span>
                  )}
                </div>
              )}

              {/* Key deltas */}
              {turn.metricDeltas && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {KEY_DELTAS.filter((k) => turn.metricDeltas![k] !== undefined && turn.metricDeltas![k] !== 0)
                    .slice(0, 4)
                    .map((key) => {
                      const { label, color } = formatDelta(key, turn.metricDeltas![key]);
                      return (
                        <span key={key} className={`font-mono ${color}`}>
                          {DELTA_LABELS[key]}: {label}
                        </span>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
