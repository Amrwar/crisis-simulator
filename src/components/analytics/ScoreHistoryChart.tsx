'use client';

import { TrajectoryChart } from '@/components/charts/TrajectoryChart';

/**
 * "Am I getting better at this?" — every completed run's score in finish
 * order. One point is not a trend, so a single run renders as a note rather
 * than a chart with nothing to compare against.
 */

interface ScoreHistoryChartProps {
  history: Array<{ simulationId: string; score: number; endedAt: string | null }>;
}

export function ScoreHistoryChart({ history }: ScoreHistoryChartProps) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-text-muted text-center py-8">
        Finish a run and its score appears here.
      </p>
    );
  }

  if (history.length === 1) {
    return (
      <div className="text-center py-8">
        <p className="font-mono text-3xl font-bold text-accent-blue">{history[0].score}</p>
        <p className="text-sm text-text-muted mt-1">
          Your first completed run. Finish another to see the trend.
        </p>
      </div>
    );
  }

  return (
    <TrajectoryChart
      title="Performance score by completed run"
      labels={history.map((_, index) => index + 1)}
      domain={[0, 100]}
      formatValue={(value) => String(Math.round(value))}
      series={[
        {
          key: 'score',
          label: 'Score',
          color: '#3b82f6',
          points: history.map((entry) => entry.score),
        },
      ]}
    />
  );
}

/** The gap between the first and last completed run, in words. */
export function trendSummary(history: ReadonlyArray<{ score: number }>): string {
  if (history.length < 2) return '';

  const change = history[history.length - 1].score - history[0].score;
  if (change === 0) return 'Level with your first run.';

  return change > 0
    ? `Up ${change} points since your first run.`
    : `Down ${Math.abs(change)} points since your first run.`;
}
