import { describe, expect, it } from 'vitest';

import {
  compareMetrics,
  replaySimulation,
  snapshotOf,
  type ReplaySource,
  type StoredTurn,
} from '@/lib/game/replay';
import type { MetricsState } from '@/lib/game/rules-engine';

const OPENING: MetricsState = {
  cash: 1_000_000,
  monthlyRevenue: 500_000,
  burnRate: 100_000,
  reputation: 60,
  morale: 60,
  churn: 20,
  legalRisk: 10,
  marketShare: 50,
};

function source(overrides: Partial<ReplaySource> = {}): ReplaySource {
  return {
    simulationId: 'sim-1',
    seed: 12_345,
    difficulty: 'Medium',
    maxTurns: 2,
    storedEnding: '',
    competitorStrength: 50,
    competitorStrategy: 'price_war',
    openingMetrics: OPENING,
    openingHidden: {
      supplierReliability: 70,
      employeeLoyalty: 70,
      demandVolatility: 30,
      competitorAggression: 40,
    },
    ...overrides,
  };
}

/** A stored turn whose snapshot is deliberately blank unless overridden. */
function turn(turnNumber: number, overrides: Partial<StoredTurn> = {}): StoredTurn {
  return {
    turnNumber,
    tags: '[]',
    decidedAt: new Date('2025-03-12T10:00:00.000Z'),
    cashAfter: 0,
    revenueAfter: 0,
    burnRateAfter: 0,
    reputationAfter: 0,
    moraleAfter: 0,
    churnAfter: 0,
    legalRiskAfter: 0,
    marketShareAfter: 0,
    ...overrides,
  };
}

describe('snapshotOf', () => {
  it('maps each snapshot column onto its metric', () => {
    expect(
      snapshotOf(
        turn(1, {
          cashAfter: 1,
          revenueAfter: 2,
          burnRateAfter: 3,
          reputationAfter: 4,
          moraleAfter: 5,
          churnAfter: 6,
          legalRiskAfter: 7,
          marketShareAfter: 8,
        })
      )
    ).toEqual({
      cash: 1,
      monthlyRevenue: 2,
      burnRate: 3,
      reputation: 4,
      morale: 5,
      churn: 6,
      legalRisk: 7,
      marketShare: 8,
    });
  });
});

describe('compareMetrics', () => {
  it('reports nothing when two states agree', () => {
    expect(compareMetrics(OPENING, OPENING)).toEqual([]);
  });

  it('names each metric that disagrees, with both values', () => {
    const [mismatch] = compareMetrics({ ...OPENING, reputation: 80 }, OPENING);

    expect(mismatch).toEqual({
      metric: 'reputation',
      computed: 80,
      stored: 60,
      difference: 20,
    });
  });

  it('reports several disagreements at once', () => {
    const mismatches = compareMetrics({ ...OPENING, reputation: 80, churn: 5 }, OPENING);
    expect(mismatches.map((m) => m.metric).sort()).toEqual(['churn', 'reputation']);
  });

  it('tolerates a difference within the precision snapshots are stored at', () => {
    expect(compareMetrics({ ...OPENING, reputation: 60.04 }, OPENING)).toEqual([]);
  });

  it('reports a difference beyond that precision', () => {
    expect(compareMetrics({ ...OPENING, reputation: 60.2 }, OPENING)).toHaveLength(1);
  });

  it('reports a fall as readily as a rise', () => {
    const [mismatch] = compareMetrics({ ...OPENING, reputation: 40 }, OPENING);
    expect(mismatch.difference).toBe(-20);
  });
});

describe('replaySimulation — which turns it replays', () => {
  it('replays nothing for a run with no decided turns', () => {
    const result = replaySimulation(source(), []);

    expect(result.turnsReplayed).toBe(0);
    expect(result.steps).toEqual([]);
    expect(result.reproduced).toBe(true);
  });

  it('skips a turn that was never decided', () => {
    const result = replaySimulation(source(), [turn(1), turn(2, { decidedAt: null })]);
    expect(result.turnsReplayed).toBe(1);
  });

  it('replays turns in order even when they arrive shuffled', () => {
    const result = replaySimulation(source({ maxTurns: 10 }), [turn(2), turn(1), turn(3)]);
    expect(result.steps.map((s) => s.turnNumber)).toEqual([1, 2, 3]);
  });

  it('stops at the turn that ended the run', () => {
    // Cash starts below the floor, so turn one is a bankruptcy.
    const result = replaySimulation(
      source({ maxTurns: 10, openingMetrics: { ...OPENING, monthlyRevenue: 10_000, burnRate: 900_000, cash: 100_000 } }),
      [turn(1), turn(2), turn(3)]
    );

    expect(result.steps).toHaveLength(1);
    expect(result.computedEnding).toBe('bankruptcy');
  });

  it('reports the seed it replayed from', () => {
    expect(replaySimulation(source({ seed: 777 }), [turn(1)]).seed).toBe(777);
  });
});

describe('replaySimulation — the cash baseline', () => {
  /**
   * Every proportional threshold in the engine is measured against a baseline
   * the live route reads from turn one's snapshot column — which holds the
   * opening cash while turn one is resolving, and turn one's *result* from turn
   * two onwards. A replay that kept the opening figure throughout would judge
   * the closing turn against the wrong number.
   *
   * This run is built so the two answers differ. Turn one takes cash from 1.0M
   * to 1.4M; turn two closes at roughly 1.8M with a 44.8% market share. Growth
   * requires a 35% share and one and a half times the baseline:
   *
   *   against 1.4M (correct)  -> needs 2.10M -> not reached -> survival
   *   against 1.0M (baseline never moved) -> needs 1.50M -> reached -> growth
   */
  const twoTurnRun = [turn(1), turn(2)];

  it('moves the baseline to turn one result, as the live route does', () => {
    const result = replaySimulation(source({ maxTurns: 2 }), twoTurnRun);

    expect(result.steps[0].computed.cash).toBe(1_400_000);
    expect(result.steps[1].computed.marketShare).toBeGreaterThanOrEqual(35);
    expect(result.steps[1].computed.cash).toBeGreaterThan(1_500_000);
    expect(result.steps[1].computed.cash).toBeLessThan(2_100_000);

    // Judged against the moved baseline, this is a survival rather than a win.
    expect(result.computedEnding).toBe('survival');
  });

  it('agrees with the stored ending when the run really did survive', () => {
    const result = replaySimulation(
      source({ maxTurns: 2, storedEnding: 'survival' }),
      twoTurnRun
    );

    expect(result.endingMatches).toBe(true);
  });

  it('disagrees when the stored ending says otherwise', () => {
    const result = replaySimulation(
      source({ maxTurns: 2, storedEnding: 'growth_win' }),
      twoTurnRun
    );

    expect(result.endingMatches).toBe(false);
  });

  it('treats a run that stored no ending as nothing to disagree with', () => {
    expect(replaySimulation(source({ maxTurns: 10, storedEnding: '' }), [turn(1)]).endingMatches).toBe(
      true
    );
  });
});

describe('replaySimulation — determinism', () => {
  it('produces the same numbers every time', () => {
    const first = replaySimulation(source({ maxTurns: 10 }), [turn(1), turn(2), turn(3)]);
    const second = replaySimulation(source({ maxTurns: 10 }), [turn(1), turn(2), turn(3)]);

    expect(second.steps.map((s) => s.computed)).toEqual(first.steps.map((s) => s.computed));
  });

  it('produces different numbers from a different seed', () => {
    const a = replaySimulation(source({ seed: 1, maxTurns: 10 }), [turn(1), turn(2)]);
    const b = replaySimulation(source({ seed: 2, maxTurns: 10 }), [turn(1), turn(2)]);

    expect(b.steps[0].computed).not.toEqual(a.steps[0].computed);
  });

  it('keys the randomness on the stored turn number, not the position', () => {
    // The same single decision replayed as turn 1 and as turn 5 must differ:
    // the RNG is seeded per turn, so a gap in the history cannot be silently
    // absorbed by renumbering.
    const asFirst = replaySimulation(source({ maxTurns: 10 }), [turn(1)]);
    const asFifth = replaySimulation(source({ maxTurns: 10 }), [turn(5)]);

    expect(asFifth.steps[0].computed).not.toEqual(asFirst.steps[0].computed);
  });

  it('applies the decision tags that were stored', () => {
    const withLoan = replaySimulation(
      source({ maxTurns: 10 }),
      [turn(1, { tags: JSON.stringify(['take_loan']) })]
    );
    const without = replaySimulation(source({ maxTurns: 10 }), [turn(1)]);

    expect(withLoan.steps[0].tags).toEqual(['take_loan']);
    expect(withLoan.steps[0].computed.cash).toBeGreaterThan(without.steps[0].computed.cash);
  });

  it('ignores a stored tag the engine does not know', () => {
    const result = replaySimulation(
      source({ maxTurns: 10 }),
      [turn(1, { tags: JSON.stringify(['take_loan', 'summon_dragon']) })]
    );

    expect(result.steps[0].tags).toEqual(['take_loan']);
  });

  it('treats a corrupt tag column as no decision rather than failing', () => {
    const result = replaySimulation(source({ maxTurns: 10 }), [turn(1, { tags: 'not json' })]);
    expect(result.steps[0].tags).toEqual([]);
  });
});

describe('replaySimulation — the verdict', () => {
  it('reports a divergence when the stored snapshot does not match', () => {
    const result = replaySimulation(source({ maxTurns: 10 }), [turn(1)]);

    // The stored snapshot on these fixtures is all zeroes, so nothing matches.
    expect(result.reproduced).toBe(false);
    expect(result.mismatchCount).toBeGreaterThan(0);
  });

  it('reports a reproduction when every metric agrees', () => {
    const computed = replaySimulation(source({ maxTurns: 10 }), [turn(1)]).steps[0].computed;
    const stored = turn(1, {
      cashAfter: computed.cash,
      revenueAfter: computed.monthlyRevenue,
      burnRateAfter: computed.burnRate,
      reputationAfter: computed.reputation,
      moraleAfter: computed.morale,
      churnAfter: computed.churn,
      legalRiskAfter: computed.legalRisk,
      marketShareAfter: computed.marketShare,
    });

    const result = replaySimulation(source({ maxTurns: 10 }), [stored]);
    expect(result.reproduced).toBe(true);
    expect(result.mismatchCount).toBe(0);
  });

  it('counts the mismatches across every turn', () => {
    const result = replaySimulation(source({ maxTurns: 10 }), [turn(1), turn(2)]);
    const perStep = result.steps.reduce((sum, step) => sum + step.mismatches.length, 0);

    expect(result.mismatchCount).toBe(perStep);
  });
});
