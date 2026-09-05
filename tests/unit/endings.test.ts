import { describe, expect, it } from 'vitest';

import {
  ACHIEVEMENT_META,
  ENDING_META,
  checkAchievements,
  checkEnding,
  type EndingType,
} from '@/lib/game/endings';
import type { MetricsState } from '@/lib/game/rules-engine';

const STARTING_CASH = 1_000_000;
const MAX_TURNS = 10;

/** A comfortably mid-game, comfortably alive company. */
function metrics(overrides: Partial<MetricsState> = {}): MetricsState {
  return {
    cash: 900_000,
    monthlyRevenue: 300_000,
    burnRate: 200_000,
    reputation: 60,
    morale: 60,
    churn: 20,
    legalRisk: 10,
    marketShare: 20,
    ...overrides,
  };
}

function ending(m: Partial<MetricsState>, turn: number, flags: Record<string, unknown> = {}) {
  return checkEnding(metrics(m), turn, MAX_TURNS, flags, STARTING_CASH);
}

describe('checkEnding — game still running', () => {
  it('does not end a healthy mid-game turn', () => {
    const result = ending({}, 3);
    expect(result).toEqual({ ended: false, endingType: null, reason: '' });
  });

  it('does not end on the turn before the last one', () => {
    expect(ending({}, MAX_TURNS - 1).ended).toBe(false);
  });
});

describe('checkEnding — bankruptcy', () => {
  it('ends immediately when cash is exhausted', () => {
    const result = ending({ cash: 0 }, 2);
    expect(result.ended).toBe(true);
    expect(result.endingType).toBe('bankruptcy');
    expect(result.reason).toMatch(/cash/i);
  });

  it('treats zero as the boundary — one pound is still solvent', () => {
    expect(ending({ cash: 0 }, 2).endingType).toBe('bankruptcy');
    expect(ending({ cash: 1 }, 2).ended).toBe(false);
  });

  it('takes precedence over every other ending, including on the final turn', () => {
    const result = ending(
      { cash: 0, legalRisk: 100, reputation: 0, marketShare: 90 },
      MAX_TURNS
    );
    expect(result.endingType).toBe('bankruptcy');
  });
});

describe('checkEnding — scandal', () => {
  it('fires when legal risk is extreme and reputation is destroyed', () => {
    const result = ending({ legalRisk: 88, reputation: 22 }, 4);
    expect(result.ended).toBe(true);
    expect(result.endingType).toBe('scandal');
  });

  it('needs both conditions — high legal risk alone is survivable', () => {
    expect(ending({ legalRisk: 95, reputation: 23 }, 4).ended).toBe(false);
  });

  it('needs both conditions — a ruined reputation alone is survivable', () => {
    expect(ending({ legalRisk: 87, reputation: 5 }, 4).ended).toBe(false);
  });

  it('uses inclusive thresholds at exactly 88 and 22', () => {
    expect(ending({ legalRisk: 88, reputation: 22 }, 4).endingType).toBe('scandal');
    expect(ending({ legalRisk: 87.9, reputation: 22 }, 4).ended).toBe(false);
    expect(ending({ legalRisk: 88, reputation: 22.1 }, 4).ended).toBe(false);
  });
});

describe('checkEnding — early investor takeover', () => {
  const collapsing = { cash: 100_000, reputation: 25, marketShare: 4 };

  it('fires from turn 6 once the company is failing on every front', () => {
    const result = ending(collapsing, 6);
    expect(result.ended).toBe(true);
    expect(result.endingType).toBe('takeover');
    expect(result.reason).toMatch(/board/i);
  });

  it('is not available before turn 6', () => {
    expect(ending(collapsing, 5).ended).toBe(false);
  });

  it('requires cash below 15% of the starting balance', () => {
    expect(ending({ ...collapsing, cash: 150_000 }, 7).ended).toBe(false);
  });

  it('requires reputation below 30', () => {
    expect(ending({ ...collapsing, reputation: 30 }, 7).ended).toBe(false);
  });

  it('requires market share below 5', () => {
    expect(ending({ ...collapsing, marketShare: 5 }, 7).ended).toBe(false);
  });
});

describe('checkEnding — end of the final turn', () => {
  it('awards the growth win for strong share and a grown cash pile', () => {
    const result = ending({ marketShare: 35, cash: 1_500_000 }, MAX_TURNS);
    expect(result.endingType).toBe('growth_win');
    expect(result.ended).toBe(true);
  });

  it('withholds the growth win just below the market share threshold', () => {
    expect(ending({ marketShare: 34.9, cash: 1_500_000 }, MAX_TURNS).endingType).toBe('survival');
  });

  it('withholds the growth win just below the cash threshold', () => {
    expect(ending({ marketShare: 40, cash: 1_499_999 }, MAX_TURNS).endingType).toBe('survival');
  });

  it('hands the company to investors after a weak financial and brand finish', () => {
    expect(ending({ cash: 150_000, reputation: 39 }, MAX_TURNS).endingType).toBe('takeover');
  });

  it('declares bankruptcy when near-zero cash meets runaway churn', () => {
    // Reputation stays at 40 so the takeover branch does not claim this first.
    expect(ending({ cash: 90_000, reputation: 45, churn: 61 }, MAX_TURNS).endingType).toBe(
      'bankruptcy'
    );
  });

  it('declares a scandal for accumulated legal risk at the finish line', () => {
    expect(ending({ legalRisk: 75 }, MAX_TURNS).endingType).toBe('scandal');
  });

  it('falls back to survival for an unremarkable but intact company', () => {
    const result = ending({}, MAX_TURNS);
    expect(result.endingType).toBe('survival');
    expect(result.ended).toBe(true);
  });

  it('also applies past the final turn', () => {
    expect(ending({}, MAX_TURNS + 1).endingType).toBe('survival');
  });

  it('always reports a non-empty reason when the game ends', () => {
    const finishes = [
      ending({ marketShare: 40, cash: 2_000_000 }, MAX_TURNS),
      ending({ cash: 100_000, reputation: 10 }, MAX_TURNS),
      ending({ cash: 50_000, reputation: 50, churn: 80 }, MAX_TURNS),
      ending({ legalRisk: 80 }, MAX_TURNS),
      ending({}, MAX_TURNS),
    ];
    for (const finish of finishes) {
      expect(finish.ended).toBe(true);
      expect(finish.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('checkAchievements', () => {
  const nothing: string[] = [];

  it('unlocks nothing for an ordinary early turn', () => {
    expect(checkAchievements(metrics(), 2, MAX_TURNS, {}, STARTING_CASH, nothing, 0)).toEqual([]);
  });

  it('unlocks crisis_manager for reaching the final turn solvent', () => {
    expect(
      checkAchievements(metrics(), MAX_TURNS, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).toContain('crisis_manager');
  });

  it('withholds crisis_manager from a company that ran out of cash', () => {
    expect(
      checkAchievements(metrics({ cash: 0 }), MAX_TURNS, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).not.toContain('crisis_manager');
  });

  it('unlocks negotiator on the third negotiation and not before', () => {
    expect(checkAchievements(metrics(), 4, MAX_TURNS, {}, STARTING_CASH, nothing, 2)).not.toContain(
      'negotiator'
    );
    expect(checkAchievements(metrics(), 4, MAX_TURNS, {}, STARTING_CASH, nothing, 3)).toContain(
      'negotiator'
    );
  });

  it('unlocks turnaround only after a real recovery', () => {
    const recovered = metrics({ cash: 600_000 });
    expect(
      checkAchievements(recovered, 8, MAX_TURNS, { was_in_crisis: true }, STARTING_CASH, nothing, 0)
    ).toContain('turnaround');
    expect(checkAchievements(recovered, 8, MAX_TURNS, {}, STARTING_CASH, nothing, 0)).not.toContain(
      'turnaround'
    );
    expect(
      checkAchievements(
        metrics({ cash: 400_000 }),
        8,
        MAX_TURNS,
        { was_in_crisis: true },
        STARTING_CASH,
        nothing,
        0
      )
    ).not.toContain('turnaround');
  });

  it('unlocks brand_guardian for a sustained high reputation', () => {
    expect(
      checkAchievements(metrics({ reputation: 80 }), 5, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).toContain('brand_guardian');
    expect(
      checkAchievements(metrics({ reputation: 80 }), 4, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).not.toContain('brand_guardian');
    expect(
      checkAchievements(metrics({ reputation: 79 }), 6, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).not.toContain('brand_guardian');
  });

  it('unlocks market_leader at a commanding share and not below it', () => {
    expect(
      checkAchievements(metrics({ marketShare: 40 }), 3, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).toContain('market_leader');
    expect(
      checkAchievements(metrics({ marketShare: 39 }), 3, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).not.toContain('market_leader');
  });

  it('unlocks people_first for sustained morale, not an early spike', () => {
    expect(
      checkAchievements(metrics({ morale: 85 }), 5, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).toContain('people_first');
    expect(
      checkAchievements(metrics({ morale: 85 }), 4, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).not.toContain('people_first');
    expect(
      checkAchievements(metrics({ morale: 84 }), 8, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).not.toContain('people_first');
  });

  it('unlocks clean_books only for a full run that never borrowed', () => {
    expect(
      checkAchievements(metrics(), MAX_TURNS, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).toContain('clean_books');
    expect(
      checkAchievements(
        metrics(),
        MAX_TURNS,
        MAX_TURNS,
        { took_loan: true },
        STARTING_CASH,
        nothing,
        0
      )
    ).not.toContain('clean_books');
    expect(
      checkAchievements(metrics(), MAX_TURNS - 1, MAX_TURNS, {}, STARTING_CASH, nothing, 0)
    ).not.toContain('clean_books');
  });

  it('never re-awards an achievement the player already holds', () => {
    const already = [
      'crisis_manager',
      'negotiator',
      'turnaround',
      'brand_guardian',
      'market_leader',
      'people_first',
      'clean_books',
    ];
    expect(
      checkAchievements(
        metrics({ reputation: 95, morale: 95, marketShare: 60 }),
        MAX_TURNS,
        MAX_TURNS,
        { was_in_crisis: true },
        STARTING_CASH,
        already,
        9
      )
    ).toEqual([]);
  });

  it('can unlock several achievements in the same turn', () => {
    const unlocked = checkAchievements(
      metrics({ reputation: 95, morale: 95, marketShare: 60, cash: 900_000 }),
      MAX_TURNS,
      MAX_TURNS,
      { was_in_crisis: true },
      STARTING_CASH,
      nothing,
      5
    );
    expect(unlocked.sort()).toEqual(
      [
        'brand_guardian',
        'clean_books',
        'crisis_manager',
        'market_leader',
        'negotiator',
        'people_first',
        'turnaround',
      ].sort()
    );
  });
});

describe('presentation metadata', () => {
  it('describes every ending the engine can produce', () => {
    const endings: EndingType[] = [
      'growth_win',
      'survival',
      'takeover',
      'bankruptcy',
      'scandal',
    ];
    expect(Object.keys(ENDING_META).sort()).toEqual([...endings].sort());
    for (const type of endings) {
      expect(ENDING_META[type].label.length, type).toBeGreaterThan(0);
      expect(ENDING_META[type].description.length, type).toBeGreaterThan(20);
      expect(ENDING_META[type].color, type).toMatch(/^text-/);
    }
  });

  it('describes every achievement the engine can unlock', () => {
    const everyAchievement = checkAchievements(
      metrics({ reputation: 95, morale: 95, marketShare: 60 }),
      MAX_TURNS,
      MAX_TURNS,
      { was_in_crisis: true },
      STARTING_CASH,
      [],
      5
    );
    expect(everyAchievement.length).toBe(7);
    for (const type of everyAchievement) {
      expect(ACHIEVEMENT_META[type], type).toBeDefined();
      expect(ACHIEVEMENT_META[type].label.length, type).toBeGreaterThan(0);
      expect(ACHIEVEMENT_META[type].description.length, type).toBeGreaterThan(10);
    }
  });
});
