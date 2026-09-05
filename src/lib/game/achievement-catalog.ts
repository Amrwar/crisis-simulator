import { ACHIEVEMENT_META } from './endings';

/**
 * The browsable achievement catalogue.
 *
 * `ACHIEVEMENT_META` gives each achievement a label and a sentence, which is
 * enough to show one that has been unlocked. An achievements *page* needs more:
 * what the criterion actually is, and how close the player is to it. This adds
 * both, and — importantly — derives the list from the engine's own metadata, so
 * an achievement added to `checkAchievements` cannot be silently missing here.
 */

export type AchievementCategory = 'survival' | 'growth' | 'people' | 'discipline';

export interface AchievementDefinition {
  type: string;
  label: string;
  description: string;
  emoji: string;
  category: AchievementCategory;
  /** The criterion in the player's own terms. */
  criteria: string;
  /**
   * How a player's best-so-far is measured against the criterion, when it is
   * measurable at all. Some achievements are pass/fail per run and have none.
   */
  target: number | null;
  /** Unit for `target`, used to render "62 / 80". */
  unit: 'score' | 'percent' | 'count' | 'turns' | null;
  /** Ordering on the page: easier first. */
  order: number;
}

/** Everything the catalogue knows, beyond the label the engine already had. */
const EXTRA: Record<
  string,
  Omit<AchievementDefinition, 'type' | 'label' | 'description' | 'emoji'>
> = {
  crisis_manager: {
    category: 'survival',
    criteria: 'Reach turn 10 with cash still above zero.',
    target: 10,
    unit: 'turns',
    order: 1,
  },
  negotiator: {
    category: 'discipline',
    criteria: 'Negotiate with a supplier on three separate turns in one run.',
    target: 3,
    unit: 'count',
    order: 2,
  },
  brand_guardian: {
    category: 'growth',
    criteria: 'Hold reputation at 80 or above, on turn 5 or later.',
    target: 80,
    unit: 'score',
    order: 3,
  },
  people_first: {
    category: 'people',
    criteria: 'Hold employee morale at 85 or above, on turn 5 or later.',
    target: 85,
    unit: 'score',
    order: 4,
  },
  market_leader: {
    category: 'growth',
    criteria: 'Take a 40% share of the market at any point in a run.',
    target: 40,
    unit: 'percent',
    order: 5,
  },
  clean_books: {
    category: 'discipline',
    criteria: 'Reach turn 10 without ever taking a loan.',
    target: null,
    unit: null,
    order: 6,
  },
  turnaround: {
    category: 'survival',
    criteria:
      'Fall below 20% of your opening cash, then recover past 50% of it in the same run.',
    target: null,
    unit: null,
    order: 7,
  },
};

const FALLBACK: Omit<AchievementDefinition, 'type' | 'label' | 'description' | 'emoji'> = {
  category: 'survival',
  criteria: 'Unlocked through play.',
  target: null,
  unit: null,
  order: 99,
};

/**
 * Every achievement, easiest first.
 *
 * Built from `ACHIEVEMENT_META` rather than from a list kept here, so adding
 * one to the engine adds it to the page too — with a placeholder criterion if
 * nobody wrote one, which is visible rather than silent.
 */
export function achievementCatalog(): AchievementDefinition[] {
  return Object.entries(ACHIEVEMENT_META)
    .map(([type, meta]) => ({
      type,
      label: meta.label,
      description: meta.description,
      emoji: meta.emoji,
      ...(EXTRA[type] ?? FALLBACK),
    }))
    .sort((a, b) => a.order - b.order || a.type.localeCompare(b.type));
}

/** One achievement's definition, or null if the engine does not know it. */
export function achievementDefinition(type: string): AchievementDefinition | null {
  return achievementCatalog().find((a) => a.type === type) ?? null;
}

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  survival: 'Survival',
  growth: 'Growth',
  people: 'People',
  discipline: 'Discipline',
};

export interface AchievementProgress {
  type: string;
  unlocked: boolean;
  /** When it was first unlocked, ISO-8601. */
  unlockedAt: string | null;
  /** The run it was first unlocked in. */
  simulationId: string | null;
  /** How many times it has been unlocked across all runs. */
  timesUnlocked: number;
  /** Best value the player has reached against the target, when measurable. */
  best: number | null;
  /** 0–1 share of the target reached. Null when there is nothing to measure. */
  fraction: number | null;
}

/** The whole payload `GET /api/achievements` answers with. */
export interface AchievementsPayload {
  catalog: AchievementDefinition[];
  progress: AchievementProgress[];
  unlockedCount: number;
  totalCount: number;
  bests: PlayerBests;
}

/** What a player has reached, per measurable achievement. */
export interface PlayerBests {
  bestReputation: number;
  bestMorale: number;
  bestMarketShare: number;
  longestRun: number;
  mostNegotiationsInARun: number;
}

/**
 * Combines the catalogue with what a player has unlocked and how far they have
 * got on the ones they have not.
 *
 * Progress is capped at the target, so a player who reached 92 reputation on an
 * achievement asking for 80 shows a full bar rather than 115%.
 */
export function buildProgress(
  unlocks: ReadonlyArray<{ type: string; unlockedAt: Date | string; simulationId: string }>,
  bests: PlayerBests
): AchievementProgress[] {
  const byType = new Map<string, Array<{ unlockedAt: Date | string; simulationId: string }>>();

  for (const unlock of unlocks) {
    const bucket = byType.get(unlock.type);
    if (bucket) bucket.push(unlock);
    else byType.set(unlock.type, [{ unlockedAt: unlock.unlockedAt, simulationId: unlock.simulationId }]);
  }

  return achievementCatalog().map((definition) => {
    const held = (byType.get(definition.type) ?? []).sort(
      (a, b) => timeOf(a.unlockedAt) - timeOf(b.unlockedAt)
    );
    const first = held[0];
    const best = bestFor(definition.type, bests);

    return {
      type: definition.type,
      unlocked: held.length > 0,
      unlockedAt: first ? new Date(first.unlockedAt).toISOString() : null,
      simulationId: first?.simulationId ?? null,
      timesUnlocked: held.length,
      best,
      fraction:
        definition.target === null || definition.target === 0 || best === null
          ? null
          : Math.min(1, Math.max(0, best / definition.target)),
    };
  });
}

function bestFor(type: string, bests: PlayerBests): number | null {
  switch (type) {
    case 'brand_guardian':
      return bests.bestReputation;
    case 'people_first':
      return bests.bestMorale;
    case 'market_leader':
      return bests.bestMarketShare;
    case 'crisis_manager':
      return bests.longestRun;
    case 'negotiator':
      return bests.mostNegotiationsInARun;
    default:
      return null;
  }
}

function timeOf(value: Date | string): number {
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
