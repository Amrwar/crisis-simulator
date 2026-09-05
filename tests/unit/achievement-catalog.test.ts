import { describe, expect, it } from 'vitest';

import {
  CATEGORY_LABELS,
  achievementCatalog,
  achievementDefinition,
  buildProgress,
  type PlayerBests,
} from '@/lib/game/achievement-catalog';
import { ACHIEVEMENT_META, checkAchievements } from '@/lib/game/endings';
import type { MetricsState } from '@/lib/game/rules-engine';

const NO_BESTS: PlayerBests = {
  bestReputation: 0,
  bestMorale: 0,
  bestMarketShare: 0,
  longestRun: 0,
  mostNegotiationsInARun: 0,
};

describe('achievementCatalog', () => {
  it('covers every achievement the engine describes', () => {
    expect(achievementCatalog().map((a) => a.type).sort()).toEqual(
      Object.keys(ACHIEVEMENT_META).sort()
    );
  });

  it('covers every achievement the engine can actually unlock', () => {
    const metrics: MetricsState = {
      cash: 900_000,
      monthlyRevenue: 300_000,
      burnRate: 200_000,
      reputation: 95,
      morale: 95,
      churn: 20,
      legalRisk: 10,
      marketShare: 60,
    };
    const everything = checkAchievements(metrics, 10, 10, { was_in_crisis: true }, 1_000_000, [], 5);
    const known = new Set(achievementCatalog().map((a) => a.type));

    expect(everything.length).toBeGreaterThan(0);
    for (const type of everything) {
      expect(known.has(type), type).toBe(true);
    }
  });

  it('gives every achievement a criterion, a category and a known category label', () => {
    for (const achievement of achievementCatalog()) {
      expect(achievement.criteria.length, achievement.type).toBeGreaterThan(10);
      expect(CATEGORY_LABELS[achievement.category], achievement.type).toBeDefined();
    }
  });

  it('orders the catalogue easiest first, with a stable tie-break', () => {
    const orders = achievementCatalog().map((a) => a.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('gives a measurable achievement both a target and a unit', () => {
    for (const achievement of achievementCatalog()) {
      if (achievement.target === null) expect(achievement.unit, achievement.type).toBeNull();
      else expect(achievement.unit, achievement.type).not.toBeNull();
    }
  });

  it('finds one definition by type', () => {
    expect(achievementDefinition('brand_guardian')?.label).toBe('Brand Guardian');
  });

  it('returns nothing for a type the engine does not know', () => {
    expect(achievementDefinition('moon_landing')).toBeNull();
  });
});

describe('buildProgress — what the player holds', () => {
  it('reports everything locked for a player who has unlocked nothing', () => {
    const progress = buildProgress([], NO_BESTS);

    expect(progress.length).toBe(achievementCatalog().length);
    expect(progress.every((p) => p.unlocked === false)).toBe(true);
    expect(progress.every((p) => p.unlockedAt === null)).toBe(true);
  });

  it('marks an achievement the player holds', () => {
    const progress = buildProgress(
      [
        {
          type: 'brand_guardian',
          unlockedAt: new Date('2025-03-01T00:00:00.000Z'),
          simulationId: 'sim-1',
        },
      ],
      NO_BESTS
    );

    const guardian = progress.find((p) => p.type === 'brand_guardian');
    expect(guardian?.unlocked).toBe(true);
    expect(guardian?.unlockedAt).toBe('2025-03-01T00:00:00.000Z');
    expect(guardian?.simulationId).toBe('sim-1');
  });

  it('leaves the others locked', () => {
    const progress = buildProgress(
      [{ type: 'brand_guardian', unlockedAt: new Date(), simulationId: 'sim-1' }],
      NO_BESTS
    );

    expect(progress.filter((p) => p.unlocked)).toHaveLength(1);
  });

  it('counts repeat unlocks but reports the first one', () => {
    const progress = buildProgress(
      [
        {
          type: 'crisis_manager',
          unlockedAt: new Date('2025-05-01T00:00:00.000Z'),
          simulationId: 'later',
        },
        {
          type: 'crisis_manager',
          unlockedAt: new Date('2025-01-01T00:00:00.000Z'),
          simulationId: 'first',
        },
      ],
      NO_BESTS
    );

    const manager = progress.find((p) => p.type === 'crisis_manager');
    expect(manager?.timesUnlocked).toBe(2);
    expect(manager?.simulationId).toBe('first');
    expect(manager?.unlockedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('ignores an unlock for a type the catalogue does not know', () => {
    const progress = buildProgress(
      [{ type: 'moon_landing', unlockedAt: new Date(), simulationId: 'sim' }],
      NO_BESTS
    );

    expect(progress.some((p) => p.type === 'moon_landing')).toBe(false);
  });
});

describe('buildProgress — how close the player is', () => {
  it('measures reputation progress against the brand_guardian target', () => {
    const progress = buildProgress([], { ...NO_BESTS, bestReputation: 40 });
    const guardian = progress.find((p) => p.type === 'brand_guardian');

    expect(guardian?.best).toBe(40);
    expect(guardian?.fraction).toBeCloseTo(0.5, 5);
  });

  it('measures morale, market share, run length and negotiations too', () => {
    const progress = buildProgress([], {
      bestReputation: 0,
      bestMorale: 68,
      bestMarketShare: 20,
      longestRun: 5,
      mostNegotiationsInARun: 2,
    });

    const by = (type: string) => progress.find((p) => p.type === type);
    expect(by('people_first')?.fraction).toBeCloseTo(68 / 85, 5);
    expect(by('market_leader')?.fraction).toBeCloseTo(0.5, 5);
    expect(by('crisis_manager')?.fraction).toBeCloseTo(0.5, 5);
    expect(by('negotiator')?.fraction).toBeCloseTo(2 / 3, 5);
  });

  it('caps progress at the target rather than reporting more than a whole', () => {
    const progress = buildProgress([], { ...NO_BESTS, bestReputation: 100 });
    expect(progress.find((p) => p.type === 'brand_guardian')?.fraction).toBe(1);
  });

  it('never reports negative progress', () => {
    const progress = buildProgress([], { ...NO_BESTS, bestReputation: -10 });
    expect(progress.find((p) => p.type === 'brand_guardian')?.fraction).toBe(0);
  });

  it('reports no progress for an achievement with nothing to measure', () => {
    const turnaround = buildProgress([], NO_BESTS).find((p) => p.type === 'turnaround');

    expect(turnaround?.best).toBeNull();
    expect(turnaround?.fraction).toBeNull();
  });

  it('reports no progress for clean_books, which is pass or fail', () => {
    expect(buildProgress([], NO_BESTS).find((p) => p.type === 'clean_books')?.fraction).toBeNull();
  });
});
