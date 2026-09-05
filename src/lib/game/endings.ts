import type { MetricsState } from './rules-engine';

export type EndingType = 'growth_win' | 'survival' | 'takeover' | 'bankruptcy' | 'scandal';

export interface EndingResult {
  ended: boolean;
  endingType: EndingType | null;
  reason: string;
}

/**
 * Check if the game has reached an ending condition.
 * Early endings: bankruptcy, scandal.
 * Turn-10 endings: growth_win, survival, takeover.
 */
export function checkEnding(
  metrics: MetricsState,
  turnNumber: number,
  maxTurns: number,
  flags: Record<string, unknown>,
  startingCash: number
): EndingResult {
  const isFinalTurn = turnNumber >= maxTurns;

  // ── EARLY: Bankruptcy ─────────────────────────────────────────
  if (metrics.cash <= 0) {
    return {
      ended: true,
      endingType: 'bankruptcy',
      reason: 'The company ran out of cash and could no longer operate.',
    };
  }

  // ── EARLY: Scandal ────────────────────────────────────────────
  if (metrics.legalRisk >= 88 && metrics.reputation <= 22) {
    return {
      ended: true,
      endingType: 'scandal',
      reason:
        'Mounting legal violations and a destroyed reputation triggered a public scandal that ended operations.',
    };
  }

  // ── EARLY: Investor Takeover (severe underperformance after turn 6) ──
  if (
    turnNumber >= 6 &&
    metrics.cash < startingCash * 0.15 &&
    metrics.reputation < 30 &&
    metrics.marketShare < 5
  ) {
    return {
      ended: true,
      endingType: 'takeover',
      reason:
        'Investor confidence collapsed. The board has voted for an immediate management change.',
    };
  }

  // ── END-OF-GAME endings (turn 10 completed) ───────────────────
  if (isFinalTurn) {
    // Growth Win
    if (metrics.marketShare >= 35 && metrics.cash >= startingCash * 1.5) {
      return {
        ended: true,
        endingType: 'growth_win',
        reason:
          'Outstanding performance! The company achieved strong market share and healthy cash reserves.',
      };
    }

    // Takeover (poor performance at end)
    if (metrics.cash < startingCash * 0.2 && metrics.reputation < 40) {
      return {
        ended: true,
        endingType: 'takeover',
        reason: 'Poor financial and reputational performance led investors to replace management.',
      };
    }

    // Bankruptcy at end
    if (metrics.cash < startingCash * 0.1 && metrics.churn > 60) {
      return {
        ended: true,
        endingType: 'bankruptcy',
        reason: 'High customer attrition and near-zero cash reserves forced the company to close.',
      };
    }

    // Scandal at end
    if (metrics.legalRisk >= 75) {
      return {
        ended: true,
        endingType: 'scandal',
        reason:
          'Accumulated legal risks materialized into serious regulatory action, ending operations.',
      };
    }

    // Survival (completed all turns but not a big winner)
    return {
      ended: true,
      endingType: 'survival',
      reason:
        'The company survived all 10 turns. A resilient performance, with room for further growth.',
    };
  }

  return { ended: false, endingType: null, reason: '' };
}

/** Achievement checking — returns list of newly unlocked achievement types. */
export function checkAchievements(
  metrics: MetricsState,
  turnNumber: number,
  maxTurns: number,
  flags: Record<string, unknown>,
  startingCash: number,
  existingAchievements: string[],
  negotiationCount: number
): string[] {
  const unlocked: string[] = [];

  const alreadyHas = (type: string) => existingAchievements.includes(type);

  // Crisis Manager: survive all 10 turns
  if (turnNumber >= maxTurns && metrics.cash > 0 && !alreadyHas('crisis_manager')) {
    unlocked.push('crisis_manager');
  }

  // Negotiator: win 3+ negotiations (tracked via tag counts, passed as negotiationCount)
  if (negotiationCount >= 3 && !alreadyHas('negotiator')) {
    unlocked.push('negotiator');
  }

  // Turnaround: recover from cash below 20% of starting
  if (
    flags['was_in_crisis'] &&
    metrics.cash > startingCash * 0.5 &&
    !alreadyHas('turnaround')
  ) {
    unlocked.push('turnaround');
  }

  // Brand Guardian: keep reputation >= 80
  if (metrics.reputation >= 80 && turnNumber >= 5 && !alreadyHas('brand_guardian')) {
    unlocked.push('brand_guardian');
  }

  // Market Leader: take a commanding share of the market
  if (metrics.marketShare >= 40 && !alreadyHas('market_leader')) {
    unlocked.push('market_leader');
  }

  // People First: a workforce still with you past the halfway mark
  if (metrics.morale >= 85 && turnNumber >= 5 && !alreadyHas('people_first')) {
    unlocked.push('people_first');
  }

  // Clean Books: reach the end having never borrowed
  if (turnNumber >= maxTurns && !flags['took_loan'] && !alreadyHas('clean_books')) {
    unlocked.push('clean_books');
  }

  return unlocked;
}

export const ACHIEVEMENT_META: Record<string, { label: string; description: string; emoji: string }> = {
  crisis_manager: {
    label: 'Crisis Manager',
    description: 'Survived all 10 turns without going bankrupt.',
    emoji: '🛡️',
  },
  negotiator: {
    label: 'Master Negotiator',
    description: 'Successfully negotiated with suppliers 3 or more times.',
    emoji: '🤝',
  },
  turnaround: {
    label: 'Turnaround Artist',
    description: 'Recovered from near-bankruptcy to financial stability.',
    emoji: '📈',
  },
  brand_guardian: {
    label: 'Brand Guardian',
    description: 'Maintained reputation above 80 through at least 5 turns.',
    emoji: '⭐',
  },
  market_leader: {
    label: 'Market Leader',
    description: 'Took a 40% share of the market.',
    emoji: '📊',
  },
  people_first: {
    label: 'People First',
    description: 'Held employee morale above 85 past the halfway mark.',
    emoji: '💙',
  },
  clean_books: {
    label: 'Clean Books',
    description: 'Reached the final turn without ever taking a loan.',
    emoji: '📒',
  },
};

export const ENDING_META: Record<
  EndingType,
  { label: string; color: string; description: string }
> = {
  growth_win: {
    label: 'Growth Champion',
    color: 'text-accent-green',
    description:
      'Exceptional leadership. You built a thriving business with strong market position.',
  },
  survival: {
    label: 'Survivor',
    color: 'text-accent-blue',
    description:
      'Solid management under pressure. The business endured all challenges and remains viable.',
  },
  takeover: {
    label: 'Investor Takeover',
    color: 'text-accent-orange',
    description:
      'The board lost confidence and replaced management. A hard lesson in stakeholder management.',
  },
  bankruptcy: {
    label: 'Bankruptcy',
    color: 'text-accent-red',
    description:
      'The company ran out of resources. Critical decisions led to unsustainable cash depletion.',
  },
  scandal: {
    label: 'Corporate Scandal',
    color: 'text-accent-red',
    description:
      'Legal and reputational failures destroyed the business. Ethics and compliance are non-negotiable.',
  },
};
