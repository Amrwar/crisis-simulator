import { describe, expect, it } from 'vitest';

import {
  buildTrajectories,
  buildTrajectory,
  pivotalTurn,
  summarizeDirection,
  type TurnSnapshot,
} from '@/lib/analytics/trajectories';

/** A snapshot row with every column at a flat baseline unless overridden. */
function snapshot(turnNumber: number, overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    turnNumber,
    cashAfter: 1_000_000,
    revenueAfter: 300_000,
    burnRateAfter: 200_000,
    reputationAfter: 60,
    moraleAfter: 60,
    churnAfter: 20,
    legalRiskAfter: 10,
    marketShareAfter: 20,
    ...overrides,
  };
}

describe('buildTrajectories — mapping the snapshot columns', () => {
  it('reads every visible metric from its own column', () => {
    const { byMetric } = buildTrajectories([
      snapshot(1, {
        cashAfter: 11,
        revenueAfter: 22,
        burnRateAfter: 33,
        reputationAfter: 44,
        moraleAfter: 55,
        churnAfter: 66,
        legalRiskAfter: 77,
        marketShareAfter: 88,
      }),
    ]);

    expect(byMetric.cash.values).toEqual([11]);
    expect(byMetric.monthlyRevenue.values).toEqual([22]);
    expect(byMetric.burnRate.values).toEqual([33]);
    expect(byMetric.reputation.values).toEqual([44]);
    expect(byMetric.morale.values).toEqual([55]);
    expect(byMetric.churn.values).toEqual([66]);
    expect(byMetric.legalRisk.values).toEqual([77]);
    expect(byMetric.marketShare.values).toEqual([88]);
  });

  it('reports the turn axis', () => {
    expect(buildTrajectories([snapshot(1), snapshot(2), snapshot(3)]).turnNumbers).toEqual([1, 2, 3]);
  });

  it('sorts turns that arrive out of order', () => {
    const { turnNumbers, byMetric } = buildTrajectories([
      snapshot(3, { cashAfter: 300 }),
      snapshot(1, { cashAfter: 100 }),
      snapshot(2, { cashAfter: 200 }),
    ]);

    expect(turnNumbers).toEqual([1, 2, 3]);
    expect(byMetric.cash.values).toEqual([100, 200, 300]);
  });

  it('produces an empty trajectory for a run with no turns', () => {
    const { turnNumbers, byMetric } = buildTrajectories([]);

    expect(turnNumbers).toEqual([]);
    expect(byMetric.cash.values).toEqual([]);
    expect(byMetric.cash.change).toBe(0);
    expect(byMetric.cash.worstTurn).toBeNull();
  });

  it('covers all eight metrics', () => {
    expect(Object.keys(buildTrajectories([snapshot(1)]).byMetric)).toHaveLength(8);
  });
});

describe('buildTrajectory — the derived shape of one line', () => {
  it('reports the endpoints, range and net change', () => {
    const t = buildTrajectory('cash', [100, 150, 90, 120], [1, 2, 3, 4]);

    expect(t.first).toBe(100);
    expect(t.last).toBe(120);
    expect(t.min).toBe(90);
    expect(t.max).toBe(150);
    expect(t.change).toBe(20);
  });

  it('reports the change as a share of the opening value', () => {
    expect(buildTrajectory('cash', [200, 250], [1, 2]).changePercent).toBe(25);
  });

  it('reports no percentage when the metric opened at zero', () => {
    expect(buildTrajectory('cash', [0, 250], [1, 2]).changePercent).toBeNull();
  });

  it('measures a percentage against the magnitude of a negative opening', () => {
    expect(buildTrajectory('cash', [-100, -50], [1, 2]).changePercent).toBe(50);
  });

  it('calls a rise an improvement where higher is better', () => {
    expect(buildTrajectory('reputation', [40, 70], [1, 2]).improved).toBe(true);
    expect(buildTrajectory('reputation', [70, 40], [1, 2]).improved).toBe(false);
  });

  it('calls a fall an improvement where lower is better', () => {
    expect(buildTrajectory('churn', [40, 10], [1, 2]).improved).toBe(true);
    expect(buildTrajectory('churn', [10, 40], [1, 2]).improved).toBe(false);
    expect(buildTrajectory('legalRisk', [50, 20], [1, 2]).improved).toBe(true);
    expect(buildTrajectory('burnRate', [50, 20], [1, 2]).improved).toBe(true);
  });

  it('calls no change no improvement', () => {
    expect(buildTrajectory('reputation', [50, 50], [1, 2]).improved).toBe(false);
  });

  it('names the best and worst turn where higher is better', () => {
    const t = buildTrajectory('reputation', [50, 70, 40, 45], [1, 2, 3, 4]);

    expect(t.bestTurn).toEqual({ turnNumber: 2, delta: 20 });
    expect(t.worstTurn).toEqual({ turnNumber: 3, delta: -30 });
  });

  it('flips best and worst where lower is better', () => {
    const t = buildTrajectory('churn', [50, 70, 40, 45], [1, 2, 3, 4]);

    expect(t.bestTurn).toEqual({ turnNumber: 3, delta: -30 });
    expect(t.worstTurn).toEqual({ turnNumber: 2, delta: 20 });
  });

  it('names no best or worst turn for a single-turn run', () => {
    const t = buildTrajectory('cash', [100], [1]);

    expect(t.bestTurn).toBeNull();
    expect(t.worstTurn).toBeNull();
    expect(t.volatility).toBe(0);
  });

  it('attributes a delta to the turn it landed on, not the one before', () => {
    expect(buildTrajectory('cash', [10, 90], [4, 5]).bestTurn?.turnNumber).toBe(5);
  });

  it('measures volatility as the mean absolute per-turn move', () => {
    // Moves of +10, -5, +10 average 8.33 — a fall counts as much as a rise.
    expect(buildTrajectory('cash', [0, 10, 5, 15], [1, 2, 3, 4]).volatility).toBe(8.33);
  });

  it('counts a fall as much as a rise when measuring volatility', () => {
    expect(buildTrajectory('cash', [0, 10, 0], [1, 2, 3]).volatility).toBe(10);
    expect(buildTrajectory('cash', [0, 10, 20], [1, 2, 3]).volatility).toBe(10);
  });

  it('reports zero volatility for a flat line', () => {
    expect(buildTrajectory('cash', [7, 7, 7], [1, 2, 3]).volatility).toBe(0);
  });
});

describe('summarizeDirection', () => {
  it('sorts each metric into improved, worsened or unchanged', () => {
    const direction = summarizeDirection(
      buildTrajectories([
        snapshot(1, { reputationAfter: 40, churnAfter: 40, moraleAfter: 50 }),
        snapshot(2, { reputationAfter: 70, churnAfter: 10, moraleAfter: 50 }),
      ])
    );

    expect(direction.improved).toContain('reputation');
    expect(direction.improved).toContain('churn');
    expect(direction.unchanged).toContain('morale');
  });

  it('counts a metric that fell where higher is better as worsened', () => {
    const direction = summarizeDirection(
      buildTrajectories([snapshot(1, { moraleAfter: 80 }), snapshot(2, { moraleAfter: 30 })])
    );

    expect(direction.worsened).toContain('morale');
    expect(direction.improved).not.toContain('morale');
  });

  it('accounts for every metric exactly once', () => {
    const direction = summarizeDirection(buildTrajectories([snapshot(1), snapshot(2)]));
    const all = [...direction.improved, ...direction.worsened, ...direction.unchanged];

    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);
  });
});

describe('pivotalTurn', () => {
  it('names the turn that moved the metrics furthest', () => {
    const pivotal = pivotalTurn(
      buildTrajectories([
        snapshot(1, { reputationAfter: 60 }),
        snapshot(2, { reputationAfter: 58 }),
        snapshot(3, { reputationAfter: 20 }),
        snapshot(4, { reputationAfter: 19 }),
      ])
    );

    expect(pivotal?.turnNumber).toBe(3);
  });

  it('normalises across metrics so cash does not always win', () => {
    // Cash moves 500,000 on turns 2 and 4 — half of its own range each time.
    // Reputation moves only 30 on turn 3, but that is its entire range.
    // Ranked on raw magnitude, turn 2 would win by four orders of magnitude.
    const pivotal = pivotalTurn(
      buildTrajectories([
        snapshot(1, { cashAfter: 1_000_000, reputationAfter: 60 }),
        snapshot(2, { cashAfter: 1_500_000, reputationAfter: 60 }),
        snapshot(3, { cashAfter: 1_500_000, reputationAfter: 30 }),
        snapshot(4, { cashAfter: 2_000_000, reputationAfter: 30 }),
      ])
    );

    expect(pivotal?.turnNumber).toBe(3);
  });

  it('returns nothing for a run too short to have a turning point', () => {
    expect(pivotalTurn(buildTrajectories([snapshot(1)]))).toBeNull();
    expect(pivotalTurn(buildTrajectories([]))).toBeNull();
  });

  it('returns nothing when no metric ever moved', () => {
    expect(pivotalTurn(buildTrajectories([snapshot(1), snapshot(2), snapshot(3)]))).toBeNull();
  });

  it('resolves an exact tie to the earlier turn', () => {
    const pivotal = pivotalTurn(
      buildTrajectories([
        snapshot(1, { reputationAfter: 20 }),
        snapshot(2, { reputationAfter: 60 }),
        snapshot(3, { reputationAfter: 20 }),
      ])
    );

    expect(pivotal?.turnNumber).toBe(2);
  });
});
