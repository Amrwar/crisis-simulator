import { describe, expect, it } from 'vitest';

import {
  applyRules,
  computePerformanceScore,
  type MetricsState,
  type RulesInput,
} from '@/lib/game/rules-engine';
import type { DecisionTag } from '@/lib/game/tags';

const BASE_METRICS: MetricsState = {
  cash: 1_000_000,
  monthlyRevenue: 300_000,
  burnRate: 100_000,
  reputation: 60,
  morale: 60,
  churn: 20,
  legalRisk: 10,
  marketShare: 20,
};

/**
 * A neutral input: an unknown competitor strategy (so the competitor branch is
 * a no-op) and low demand volatility (so no extra random swing fires). What is
 * left is the deterministic cash flow plus the tag effects under test, with a
 * fixed seed so the small seeded variance is identical between two calls.
 */
function input(overrides: Partial<RulesInput> = {}): RulesInput {
  return {
    metrics: { ...BASE_METRICS, ...(overrides.metrics ?? {}) },
    hidden: {
      supplierReliability: 70,
      employeeLoyalty: 70,
      demandVolatility: 30,
      competitorAggression: 40,
      ...(overrides.hidden ?? {}),
    },
    competitor: {
      competitorStrength: 50,
      competitorStrategy: 'idle',
      ...(overrides.competitor ?? {}),
    },
    tags: overrides.tags ?? [],
    difficulty: overrides.difficulty ?? 'Medium',
    simSeed: overrides.simSeed ?? 123_456,
    turnNumber: overrides.turnNumber ?? 1,
    flags: overrides.flags ?? {},
  };
}

describe('applyRules — determinism and purity', () => {
  it('produces identical output for identical input', () => {
    expect(applyRules(input({ tags: ['cut_costs'] }))).toEqual(
      applyRules(input({ tags: ['cut_costs'] }))
    );
  });

  it('produces different output for a different simulation seed', () => {
    const a = applyRules(input({ simSeed: 1 }));
    const b = applyRules(input({ simSeed: 2 }));
    expect(a.metrics).not.toEqual(b.metrics);
  });

  it('produces different output for a different turn number', () => {
    const a = applyRules(input({ turnNumber: 1 }));
    const b = applyRules(input({ turnNumber: 2 }));
    expect(a.metrics).not.toEqual(b.metrics);
  });

  it('does not mutate the caller state', () => {
    const original = input({ tags: ['layoffs', 'take_loan'] });
    const metricsBefore = { ...original.metrics };
    const hiddenBefore = { ...original.hidden };
    const flagsBefore = { ...original.flags };

    applyRules(original);

    expect(original.metrics).toEqual(metricsBefore);
    expect(original.hidden).toEqual(hiddenBefore);
    expect(original.flags).toEqual(flagsBefore);
  });

  it('returns fresh metric objects rather than the ones passed in', () => {
    const original = input();
    const result = applyRules(original);
    expect(result.metrics).not.toBe(original.metrics);
    expect(result.hidden).not.toBe(original.hidden);
  });
});

describe('applyRules — monthly cash flow', () => {
  it('adds revenue and subtracts burn before anything else', () => {
    const result = applyRules(input());
    expect(result.metrics.cash).toBe(1_000_000 + 300_000 - 100_000);
  });

  it('drains cash when burn exceeds revenue', () => {
    const result = applyRules(
      input({ metrics: { ...BASE_METRICS, monthlyRevenue: 100_000, burnRate: 400_000 } })
    );
    expect(result.metrics.cash).toBe(1_000_000 - 300_000);
  });

  it('never lets cash go negative', () => {
    const result = applyRules(
      input({ metrics: { ...BASE_METRICS, cash: 50_000, monthlyRevenue: 10_000, burnRate: 5_000_000 } })
    );
    expect(result.metrics.cash).toBe(0);
  });
});

describe('applyRules — tag effects', () => {
  it('leaves the deterministic metrics alone when no tag is applied', () => {
    const withNothing = applyRules(input());
    expect(withNothing.newFlags).toEqual([]);
    expect(withNothing.metrics.morale).toBe(60);
    expect(withNothing.metrics.churn).toBe(20);
    expect(withNothing.metrics.legalRisk).toBe(10);
  });

  it('credits the loan and raises the burn rate for take_loan', () => {
    const before = applyRules(input());
    const after = applyRules(input({ tags: ['take_loan'] }));
    expect(after.metrics.cash - before.metrics.cash).toBe(1_000_000);
    expect(after.metrics.burnRate).toBe(before.metrics.burnRate + 55_000);
    expect(after.metrics.legalRisk).toBe(before.metrics.legalRisk + 5);
  });

  it('trades morale and reputation for a lower burn rate on cut_costs', () => {
    const before = applyRules(input());
    const after = applyRules(input({ tags: ['cut_costs'] }));
    expect(after.metrics.burnRate).toBeLessThan(before.metrics.burnRate);
    expect(after.metrics.morale).toBeLessThan(before.metrics.morale);
    expect(after.hidden.supplierReliability).toBeLessThan(before.hidden.supplierReliability);
  });

  it('trades churn and reputation for revenue on raise_prices', () => {
    const before = applyRules(input());
    const after = applyRules(input({ tags: ['raise_prices'] }));
    expect(after.metrics.monthlyRevenue).toBeGreaterThan(before.metrics.monthlyRevenue);
    expect(after.metrics.churn).toBe(before.metrics.churn + 10);
    expect(after.metrics.marketShare).toBe(before.metrics.marketShare - 3);
  });

  it('applies several tags cumulatively', () => {
    const single = applyRules(input({ tags: ['take_loan'] }));
    const both = applyRules(input({ tags: ['take_loan', 'pause_expansion'] }));
    expect(both.metrics.cash - single.metrics.cash).toBe(80_000);
  });

  it('ignores a tag the rules engine has no effect for', () => {
    const baseline = applyRules(input());
    const unknown = applyRules(input({ tags: ['not_a_real_tag' as DecisionTag] }));
    expect(unknown.metrics).toEqual(baseline.metrics);
    expect(unknown.newFlags).toEqual([]);
  });

  it('moves hidden variables without the difficulty multiplier', () => {
    const easy = applyRules(input({ tags: ['layoffs'], difficulty: 'Easy' }));
    const hard = applyRules(input({ tags: ['layoffs'], difficulty: 'Hard' }));
    // Structural, so identical on both difficulties: 70 - 28.
    expect(easy.hidden.employeeLoyalty).toBe(42);
    expect(hard.hidden.employeeLoyalty).toBe(42);
  });
});

describe('applyRules — difficulty multipliers', () => {
  it('amplifies negative effects on Hard and dampens them on Easy', () => {
    const easy = applyRules(input({ tags: ['layoffs'], difficulty: 'Easy' }));
    const hard = applyRules(input({ tags: ['layoffs'], difficulty: 'Hard' }));
    const medium = applyRules(input({ tags: ['layoffs'], difficulty: 'Medium' }));

    expect(hard.metrics.morale).toBeLessThan(medium.metrics.morale);
    expect(medium.metrics.morale).toBeLessThan(easy.metrics.morale);
  });

  it('amplifies positive effects on Easy and dampens them on Hard', () => {
    const easy = applyRules(input({ tags: ['improve_quality'], difficulty: 'Easy' }));
    const hard = applyRules(input({ tags: ['improve_quality'], difficulty: 'Hard' }));
    const medium = applyRules(input({ tags: ['improve_quality'], difficulty: 'Medium' }));

    expect(easy.metrics.reputation).toBeGreaterThan(medium.metrics.reputation);
    expect(medium.metrics.reputation).toBeGreaterThan(hard.metrics.reputation);
  });

  it('treats an unrecognised difficulty as Medium', () => {
    expect(applyRules(input({ tags: ['layoffs'], difficulty: 'Impossible' }))).toEqual(
      applyRules(input({ tags: ['layoffs'], difficulty: 'Medium' }))
    );
  });
});

describe('applyRules — clamping', () => {
  it('caps every bounded metric at 100', () => {
    // Each case starts at 99 and applies effects that would overshoot 100.
    const push = (metric: Partial<MetricsState>, tags: DecisionTag[]) =>
      applyRules(input({ metrics: { ...BASE_METRICS, ...metric }, tags, difficulty: 'Easy' })).metrics;

    expect(push({ reputation: 99 }, ['improve_quality']).reputation).toBe(100);
    expect(push({ morale: 99 }, ['hire_staff', 'employee_training']).morale).toBe(100);
    expect(push({ churn: 99 }, ['deny_refund', 'raise_prices']).churn).toBe(100);
    expect(push({ legalRisk: 99 }, ['ignore_compliance']).legalRisk).toBe(100);
    expect(push({ marketShare: 99 }, ['expand_branch']).marketShare).toBe(100);
  });

  it('floors every bounded metric at 0', () => {
    const result = applyRules(
      input({
        metrics: { ...BASE_METRICS, reputation: 2, morale: 2, churn: 1, legalRisk: 1, marketShare: 1 },
        tags: ['layoffs', 'reduce_quality', 'deny_refund', 'cut_marketing'],
        difficulty: 'Hard',
      })
    );
    // Reputation, morale and market share would all go negative without the clamp.
    expect(result.metrics.reputation).toBe(0);
    expect(result.metrics.morale).toBe(0);
    expect(result.metrics.marketShare).toBe(0);
    expect(result.metrics.churn).toBeGreaterThanOrEqual(0);
    expect(result.metrics.legalRisk).toBeGreaterThanOrEqual(0);
  });

  it('clamps hidden variables into 0..100 as well', () => {
    const result = applyRules(
      input({
        hidden: {
          supplierReliability: 5,
          employeeLoyalty: 5,
          demandVolatility: 98,
          competitorAggression: 99,
        },
        tags: ['switch_supplier', 'layoffs'],
      })
    );
    for (const value of Object.values(result.hidden)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('keeps revenue and burn rate above their floors', () => {
    const result = applyRules(
      input({
        metrics: { ...BASE_METRICS, monthlyRevenue: 12_000, burnRate: 12_000 },
        tags: ['cut_marketing', 'reduce_quality', 'ignore_tech_debt'],
        difficulty: 'Hard',
      })
    );
    expect(result.metrics.monthlyRevenue).toBeGreaterThanOrEqual(10_000);
    expect(result.metrics.burnRate).toBeGreaterThanOrEqual(10_000);
  });
});

describe('applyRules — hidden variable cross-effects', () => {
  it('raises burn and hurts reputation when supplier reliability collapses', () => {
    const healthy = applyRules(input({ hidden: { supplierReliability: 90, employeeLoyalty: 70, demandVolatility: 30, competitorAggression: 40 } }));
    const broken = applyRules(input({ hidden: { supplierReliability: 10, employeeLoyalty: 70, demandVolatility: 30, competitorAggression: 40 } }));

    expect(broken.metrics.burnRate).toBeGreaterThan(healthy.metrics.burnRate);
    expect(broken.metrics.reputation).toBeLessThan(healthy.metrics.reputation);
  });

  it('does not apply the supplier penalty at the 40 threshold', () => {
    const atThreshold = applyRules(input({ hidden: { supplierReliability: 40, employeeLoyalty: 70, demandVolatility: 30, competitorAggression: 40 } }));
    const above = applyRules(input({ hidden: { supplierReliability: 90, employeeLoyalty: 70, demandVolatility: 30, competitorAggression: 40 } }));
    expect(atThreshold.metrics.burnRate).toBe(above.metrics.burnRate);
    expect(atThreshold.metrics.reputation).toBe(above.metrics.reputation);
  });

  it('costs revenue and adds churn when employee loyalty collapses', () => {
    const loyal = applyRules(input({ hidden: { supplierReliability: 70, employeeLoyalty: 90, demandVolatility: 30, competitorAggression: 40 } }));
    const disloyal = applyRules(input({ hidden: { supplierReliability: 70, employeeLoyalty: 10, demandVolatility: 30, competitorAggression: 40 } }));

    expect(disloyal.metrics.monthlyRevenue).toBeLessThan(loyal.metrics.monthlyRevenue);
    expect(disloyal.metrics.churn).toBeGreaterThan(loyal.metrics.churn);
  });

  it('introduces a revenue swing once demand volatility passes 50', () => {
    const steady = applyRules(input({ hidden: { supplierReliability: 70, employeeLoyalty: 70, demandVolatility: 50, competitorAggression: 40 } }));
    const volatile = applyRules(input({ hidden: { supplierReliability: 70, employeeLoyalty: 70, demandVolatility: 80, competitorAggression: 40 } }));
    expect(volatile.metrics.monthlyRevenue).not.toBe(steady.metrics.monthlyRevenue);
  });
});

describe('applyRules — flags', () => {
  it('reports the flag a decision sets', () => {
    expect(applyRules(input({ tags: ['layoffs'] })).newFlags).toEqual(['layoffs_done']);
    expect(applyRules(input({ tags: ['take_loan'] })).newFlags).toEqual(['took_loan']);
  });

  it('reports one flag per flag-setting tag', () => {
    expect(applyRules(input({ tags: ['take_loan', 'expand_branch', 'cut_costs'] })).newFlags).toEqual([
      'took_loan',
      'expanded',
    ]);
  });

  it('keeps draining reputation and adding churn while cut_quality is set', () => {
    const clean = applyRules(input({ flags: {} }));
    const scarred = applyRules(input({ flags: { cut_quality: true } }));
    expect(scarred.metrics.reputation).toBeLessThan(clean.metrics.reputation);
    expect(scarred.metrics.churn).toBeGreaterThan(clean.metrics.churn);
  });

  it('keeps draining morale and loyalty while layoffs_done is set', () => {
    const clean = applyRules(input({ flags: {} }));
    const scarred = applyRules(input({ flags: { layoffs_done: true } }));
    expect(scarred.metrics.morale).toBeLessThan(clean.metrics.morale);
    expect(scarred.hidden.employeeLoyalty).toBe(clean.hidden.employeeLoyalty - 3);
  });

  it('ignores a falsy flag', () => {
    expect(applyRules(input({ flags: { cut_quality: false } }))).toEqual(
      applyRules(input({ flags: {} }))
    );
  });
});

describe('applyRules — competitor behaviour', () => {
  it('describes a price war and costs market share', () => {
    const idle = applyRules(input());
    const warring = applyRules(input({ competitor: { competitorStrength: 50, competitorStrategy: 'price_war' } }));
    expect(warring.competitorAction).toMatch(/price war/i);
    expect(warring.metrics.marketShare).toBeLessThan(idle.metrics.marketShare);
    expect(warring.metrics.churn).toBeGreaterThan(idle.metrics.churn);
  });

  it('describes a premium brand push and costs reputation', () => {
    const idle = applyRules(input());
    const premium = applyRules(input({ competitor: { competitorStrength: 50, competitorStrategy: 'premium_brand' } }));
    expect(premium.competitorAction).toMatch(/premium brand/i);
    expect(premium.metrics.reputation).toBeLessThan(idle.metrics.reputation);
  });

  it('describes fast expansion and costs market share and morale', () => {
    const idle = applyRules(input());
    const expanding = applyRules(input({ competitor: { competitorStrength: 50, competitorStrategy: 'fast_expansion' } }));
    expect(expanding.competitorAction).toMatch(/new locations/i);
    expect(expanding.metrics.marketShare).toBeLessThan(idle.metrics.marketShare);
    expect(expanding.metrics.morale).toBeLessThan(idle.metrics.morale);
  });

  it('describes talent poaching and costs morale, loyalty and cash burn', () => {
    const idle = applyRules(input());
    const poaching = applyRules(input({ competitor: { competitorStrength: 50, competitorStrategy: 'poach_talent' } }));
    expect(poaching.competitorAction).toMatch(/poached/i);
    expect(poaching.metrics.morale).toBe(idle.metrics.morale - 4);
    expect(poaching.hidden.employeeLoyalty).toBe(idle.hidden.employeeLoyalty - 7);
    expect(poaching.metrics.burnRate).toBe(idle.metrics.burnRate + 25_000);
  });

  it('falls back to a neutral description for an unknown strategy', () => {
    expect(applyRules(input()).competitorAction).toBe('remained active in the market');
  });

  it('hurts more when the competitor is more aggressive', () => {
    const calm = applyRules(
      input({
        hidden: { supplierReliability: 70, employeeLoyalty: 70, demandVolatility: 30, competitorAggression: 0 },
        competitor: { competitorStrength: 50, competitorStrategy: 'price_war' },
      })
    );
    const fierce = applyRules(
      input({
        hidden: { supplierReliability: 70, employeeLoyalty: 70, demandVolatility: 30, competitorAggression: 100 },
        competitor: { competitorStrength: 50, competitorStrategy: 'price_war' },
      })
    );
    expect(fierce.metrics.marketShare).toBeLessThan(calm.metrics.marketShare);
  });
});

describe('applyRules — reported deltas', () => {
  it('reports the change between the incoming and outgoing metrics', () => {
    const original = input({ tags: ['take_loan', 'layoffs'] });
    const result = applyRules(original);

    expect(result.deltas.cash).toBe(result.metrics.cash - original.metrics.cash);
    expect(result.deltas.monthlyRevenue).toBe(
      Math.round(result.metrics.monthlyRevenue - original.metrics.monthlyRevenue)
    );
    expect(result.deltas.burnRate).toBe(
      Math.round(result.metrics.burnRate - original.metrics.burnRate)
    );
    expect(result.deltas.marketShare).toBeCloseTo(
      result.metrics.marketShare - original.metrics.marketShare,
      5
    );
  });

  it('reports a delta for every visible metric', () => {
    expect(Object.keys(applyRules(input({ tags: ['cut_costs'] })).deltas).sort()).toEqual(
      Object.keys(BASE_METRICS).sort()
    );
  });

  it('rounds money to whole units and percentages to one decimal', () => {
    const result = applyRules(input({ tags: ['improve_quality'] }));
    expect(Number.isInteger(result.metrics.cash)).toBe(true);
    expect(Number.isInteger(result.metrics.monthlyRevenue)).toBe(true);
    expect(Number.isInteger(result.metrics.burnRate)).toBe(true);
    for (const key of ['reputation', 'morale', 'churn', 'legalRisk', 'marketShare'] as const) {
      const scaled = result.metrics[key] * 10;
      expect(Math.abs(scaled - Math.round(scaled)), key).toBeLessThan(1e-6);
    }
  });
});

describe('computePerformanceScore', () => {
  const perfect: MetricsState = {
    cash: 10_000_000,
    monthlyRevenue: 0,
    burnRate: 0,
    reputation: 100,
    morale: 100,
    churn: 0,
    legalRisk: 0,
    marketShare: 100,
  };
  const disastrous: MetricsState = {
    cash: 0,
    monthlyRevenue: 0,
    burnRate: 0,
    reputation: 0,
    morale: 0,
    churn: 100,
    legalRisk: 100,
    marketShare: 0,
  };

  it('awards the full score for a flawless run', () => {
    expect(computePerformanceScore(perfect, 1_000_000)).toBe(100);
  });

  it('awards nothing for a total collapse', () => {
    expect(computePerformanceScore(disastrous, 1_000_000)).toBe(0);
  });

  it('stays inside 0..100 across a wide range of states', () => {
    for (const cash of [0, 100_000, 1_000_000, 50_000_000]) {
      for (const reputation of [0, 33, 100]) {
        for (const marketShare of [0, 25, 100]) {
          const score = computePerformanceScore(
            { ...perfect, cash, reputation, marketShare, morale: 50, churn: 50, legalRisk: 50 },
            1_000_000
          );
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('rewards a bigger cash pile', () => {
    const poor = computePerformanceScore({ ...perfect, cash: 100_000 }, 1_000_000);
    const rich = computePerformanceScore({ ...perfect, cash: 1_500_000 }, 1_000_000);
    expect(rich).toBeGreaterThan(poor);
  });

  it('caps the cash contribution so a huge balance cannot mask everything else', () => {
    const capped = computePerformanceScore({ ...disastrous, cash: 2_000_000 }, 1_000_000);
    const absurd = computePerformanceScore({ ...disastrous, cash: 900_000_000 }, 1_000_000);
    expect(capped).toBe(absurd);
    expect(absurd).toBeLessThan(100);
  });

  it('penalises legal risk and churn', () => {
    const clean = computePerformanceScore({ ...perfect, legalRisk: 0, churn: 0 }, 1_000_000);
    const risky = computePerformanceScore({ ...perfect, legalRisk: 100, churn: 100 }, 1_000_000);
    expect(risky).toBeLessThan(clean);
  });

  it('returns a whole number', () => {
    const score = computePerformanceScore({ ...perfect, reputation: 63, marketShare: 17 }, 777_777);
    expect(Number.isInteger(score)).toBe(true);
  });
});
