import type { DecisionTag } from './tags';
import { clamp, turnRng } from './rng';

export interface MetricsState {
  cash: number;
  monthlyRevenue: number;
  burnRate: number;
  reputation: number;
  morale: number;
  churn: number;
  legalRisk: number;
  marketShare: number;
}

export interface HiddenState {
  supplierReliability: number;
  employeeLoyalty: number;
  demandVolatility: number;
  competitorAggression: number;
}

export interface CompetitorState {
  competitorStrength: number;
  competitorStrategy: string;
}

export interface RulesInput {
  metrics: MetricsState;
  hidden: HiddenState;
  competitor: CompetitorState;
  tags: DecisionTag[];
  difficulty: string;
  simSeed: number;
  turnNumber: number;
  flags: Record<string, unknown>;
}

export interface RulesOutput {
  metrics: MetricsState;
  hidden: HiddenState;
  deltas: Partial<MetricsState>;
  newFlags: string[];
  competitorAction: string;
}

/** Raw tag effect definitions. Values are additive to current state. */
interface TagEffect {
  cashAbsolute?: number;
  monthlyRevenuePct?: number;
  burnRatePct?: number;
  burnRateAbsolute?: number;
  reputation?: number;
  morale?: number;
  churn?: number;
  legalRisk?: number;
  marketShare?: number;
  supplierReliability?: number;
  employeeLoyalty?: number;
  demandVolatility?: number;
  competitorAggression?: number;
  setFlag?: string;
}

const TAG_EFFECTS: Record<string, TagEffect> = {
  raise_prices: {
    monthlyRevenuePct: 0.12,
    churn: 10,
    reputation: -4,
    marketShare: -3,
  },
  discount_prices: {
    monthlyRevenuePct: -0.07,
    churn: -8,
    marketShare: 5,
    reputation: 3,
  },
  negotiate_supplier: {
    burnRatePct: -0.07,
    supplierReliability: -6,
    cashAbsolute: -15_000,
    setFlag: 'negotiated_supplier',
  },
  switch_supplier: {
    burnRatePct: -0.10,
    supplierReliability: -20,
    morale: -3,
    cashAbsolute: -40_000,
    setFlag: 'switched_supplier',
  },
  take_loan: {
    cashAbsolute: 1_000_000,
    burnRateAbsolute: 55_000,
    legalRisk: 5,
    setFlag: 'took_loan',
  },
  cut_costs: {
    burnRatePct: -0.12,
    morale: -8,
    reputation: -3,
    supplierReliability: -4,
  },
  increase_marketing: {
    burnRateAbsolute: 80_000,
    marketShare: 4,
    reputation: 5,
    churn: -4,
  },
  cut_marketing: {
    burnRateAbsolute: -60_000,
    marketShare: -4,
    reputation: -5,
    churn: 5,
  },
  improve_quality: {
    burnRateAbsolute: 60_000,
    reputation: 9,
    churn: -7,
    marketShare: 3,
    morale: 4,
    setFlag: 'raised_quality',
  },
  reduce_quality: {
    burnRateAbsolute: -35_000,
    reputation: -11,
    churn: 9,
    marketShare: -4,
    setFlag: 'cut_quality',
  },
  layoffs: {
    burnRateAbsolute: -100_000,
    morale: -22,
    employeeLoyalty: -28,
    reputation: -8,
    legalRisk: 10,
    marketShare: -2,
    setFlag: 'layoffs_done',
  },
  hire_staff: {
    burnRateAbsolute: 85_000,
    morale: 10,
    employeeLoyalty: 10,
    reputation: 3,
    monthlyRevenuePct: 0.05,
  },
  delay_payments: {
    cashAbsolute: 120_000,
    supplierReliability: -18,
    legalRisk: 8,
    reputation: -6,
    setFlag: 'delayed_payments',
  },
  pay_on_time: {
    supplierReliability: 12,
    legalRisk: -4,
    reputation: 4,
  },
  compliance_investment: {
    burnRateAbsolute: 80_000,
    legalRisk: -22,
    reputation: 8,
    morale: 4,
    setFlag: 'compliance_done',
  },
  ignore_compliance: {
    legalRisk: 25,
    reputation: -10,
    morale: -5,
  },
  customer_refund: {
    cashAbsolute: -100_000,
    reputation: 11,
    churn: -9,
    marketShare: 2,
    setFlag: 'issued_refund',
  },
  deny_refund: {
    reputation: -13,
    churn: 11,
    legalRisk: 9,
    marketShare: -3,
  },
  expand_branch: {
    cashAbsolute: -600_000,
    burnRateAbsolute: 160_000,
    marketShare: 8,
    monthlyRevenuePct: 0.18,
    morale: 5,
    setFlag: 'expanded',
  },
  pause_expansion: {
    morale: -5,
    reputation: -3,
    cashAbsolute: 80_000,
  },
  upgrade_tech: {
    cashAbsolute: -200_000,
    burnRateAbsolute: 30_000,
    morale: 9,
    reputation: 5,
    churn: -5,
    monthlyRevenuePct: 0.07,
    setFlag: 'upgraded_tech',
  },
  ignore_tech_debt: {
    legalRisk: 5,
    morale: -8,
    reputation: -5,
    monthlyRevenuePct: -0.05,
  },
  employee_training: {
    burnRateAbsolute: 55_000,
    morale: 12,
    employeeLoyalty: 16,
    monthlyRevenuePct: 0.04,
    reputation: 3,
  },
  ignore_training: {
    morale: -7,
    employeeLoyalty: -9,
    monthlyRevenuePct: -0.03,
  },
  strengthen_security: {
    cashAbsolute: -150_000,
    legalRisk: -10,
    reputation: 5,
    morale: 4,
  },
  ignore_security: {
    legalRisk: 12,
    reputation: -7,
    morale: -4,
  },
};

const DIFFICULTY_MULT: Record<string, { neg: number; pos: number }> = {
  Easy: { neg: 0.65, pos: 1.25 },
  Medium: { neg: 1.0, pos: 1.0 },
  Hard: { neg: 1.45, pos: 0.85 },
};

/**
 * Apply difficulty multiplier to a delta value.
 * Negative impacts are amplified on Hard; positive on Easy.
 */
function applyDifficulty(value: number, difficulty: string): number {
  const mult = DIFFICULTY_MULT[difficulty] ?? DIFFICULTY_MULT.Medium;
  return value < 0 ? value * mult.neg : value * mult.pos;
}

/**
 * Main rules engine. Pure function, no side effects.
 * Returns the new state and deltas.
 */
export function applyRules(input: RulesInput): RulesOutput {
  const { metrics, hidden, competitor, tags, difficulty, simSeed, turnNumber, flags } = input;

  const rng = turnRng(simSeed, turnNumber);

  // Mutable working copies
  let m = { ...metrics };
  let h = { ...hidden };
  const newFlags: string[] = [];

  // ── 1. Natural monthly cash flow ──────────────────────────────
  const netCashFlow = m.monthlyRevenue - m.burnRate;
  m.cash = m.cash + netCashFlow;

  // ── 2. Apply tag effects ───────────────────────────────────────
  for (const tag of tags) {
    const effect = TAG_EFFECTS[tag];
    if (!effect) continue;

    // Cash (absolute)
    if (effect.cashAbsolute !== undefined) {
      const delta = applyDifficulty(effect.cashAbsolute, difficulty);
      m.cash += delta;
    }

    // Monthly revenue (%)
    if (effect.monthlyRevenuePct !== undefined) {
      const pct = applyDifficulty(effect.monthlyRevenuePct, difficulty);
      m.monthlyRevenue = m.monthlyRevenue * (1 + pct);
    }

    // Burn rate (%)
    if (effect.burnRatePct !== undefined) {
      const pct = applyDifficulty(effect.burnRatePct, difficulty);
      m.burnRate = m.burnRate * (1 + pct);
    }

    // Burn rate (absolute)
    if (effect.burnRateAbsolute !== undefined) {
      const delta = applyDifficulty(effect.burnRateAbsolute, difficulty);
      m.burnRate += delta;
    }

    // Reputation
    if (effect.reputation !== undefined) {
      m.reputation += applyDifficulty(effect.reputation, difficulty);
    }

    // Morale
    if (effect.morale !== undefined) {
      m.morale += applyDifficulty(effect.morale, difficulty);
    }

    // Churn
    if (effect.churn !== undefined) {
      m.churn += applyDifficulty(effect.churn, difficulty);
    }

    // Legal risk
    if (effect.legalRisk !== undefined) {
      m.legalRisk += applyDifficulty(effect.legalRisk, difficulty);
    }

    // Market share
    if (effect.marketShare !== undefined) {
      m.marketShare += applyDifficulty(effect.marketShare, difficulty);
    }

    // Hidden variables (no difficulty mult — they're structural)
    if (effect.supplierReliability !== undefined) h.supplierReliability += effect.supplierReliability;
    if (effect.employeeLoyalty !== undefined) h.employeeLoyalty += effect.employeeLoyalty;
    if (effect.demandVolatility !== undefined) h.demandVolatility += effect.demandVolatility;
    if (effect.competitorAggression !== undefined) h.competitorAggression += effect.competitorAggression;

    // Flags
    if (effect.setFlag) newFlags.push(effect.setFlag);
  }

  // ── 3. Hidden variable cross-effects ──────────────────────────

  // Low supplier reliability → higher burn (emergency sourcing) + reputation hit
  if (h.supplierReliability < 40) {
    const penalty = ((40 - h.supplierReliability) / 40) * 0.08;
    m.burnRate *= 1 + penalty * (difficulty === 'Hard' ? 1.3 : 1);
    m.reputation -= applyDifficulty(3, difficulty);
  }

  // Low employee loyalty → revenue dip (service quality decline)
  if (h.employeeLoyalty < 40) {
    const penalty = ((40 - h.employeeLoyalty) / 40) * 0.06;
    m.monthlyRevenue *= 1 - penalty;
    m.churn += applyDifficulty(4, difficulty);
  }

  // High demand volatility → random revenue swing
  if (h.demandVolatility > 50) {
    const swing = rng() > 0.5 ? 1 : -1;
    const magnitude = (h.demandVolatility / 100) * 0.08;
    m.monthlyRevenue *= 1 + swing * magnitude;
  }

  // If previously cut quality, reputation continues to drift down slowly
  if (flags['cut_quality']) {
    m.reputation -= applyDifficulty(2, difficulty);
    m.churn += applyDifficulty(2, difficulty);
  }

  // If layoffs done in previous turns → continued morale drain
  if (flags['layoffs_done']) {
    m.morale -= applyDifficulty(3, difficulty);
    h.employeeLoyalty -= 3;
  }

  // ── 4. Competitor effects ─────────────────────────────────────
  let competitorAction = '';
  const aggFactor = h.competitorAggression / 100;

  switch (competitor.competitorStrategy) {
    case 'price_war': {
      const impact = rng() * aggFactor;
      const mktLoss = applyDifficulty(-(2 + impact * 3), difficulty);
      m.marketShare += mktLoss;
      m.churn += applyDifficulty(2, difficulty);
      competitorAction = 'launched an aggressive price war, undercutting market prices';
      break;
    }
    case 'premium_brand': {
      const impact = rng() * aggFactor;
      const repLoss = applyDifficulty(-(1 + impact * 3), difficulty);
      m.reputation += repLoss;
      m.marketShare -= applyDifficulty(1, difficulty);
      competitorAction = 'ran premium brand campaigns that shifted customer perception';
      break;
    }
    case 'fast_expansion': {
      const mktLoss = applyDifficulty(-(2 + rng() * aggFactor * 3), difficulty);
      m.marketShare += mktLoss;
      m.morale -= applyDifficulty(2, difficulty);
      competitorAction = 'opened new locations rapidly, expanding their footprint';
      break;
    }
    case 'poach_talent': {
      m.morale -= applyDifficulty(4, difficulty);
      h.employeeLoyalty -= 7;
      m.burnRate += applyDifficulty(25_000, difficulty); // must counter with raises
      competitorAction = 'actively poached key talent with higher salary offers';
      break;
    }
    default:
      competitorAction = 'remained active in the market';
  }

  // ── 5. Seeded random variance (+/-3-5%) ───────────────────────
  const revenueVariance = (rng() - 0.5) * 0.06;
  m.monthlyRevenue *= 1 + revenueVariance;

  const reputationDrift = (rng() - 0.5) * 2;
  m.reputation += reputationDrift;

  // ── 6. Clamp all values ───────────────────────────────────────
  m.cash = Math.max(0, m.cash);
  m.monthlyRevenue = Math.max(10_000, m.monthlyRevenue);
  m.burnRate = Math.max(10_000, m.burnRate);
  m.reputation = clamp(m.reputation, 0, 100);
  m.morale = clamp(m.morale, 0, 100);
  m.churn = clamp(m.churn, 0, 100);
  m.legalRisk = clamp(m.legalRisk, 0, 100);
  m.marketShare = clamp(m.marketShare, 0, 100);
  h.supplierReliability = clamp(h.supplierReliability, 0, 100);
  h.employeeLoyalty = clamp(h.employeeLoyalty, 0, 100);
  h.demandVolatility = clamp(h.demandVolatility, 0, 100);
  h.competitorAggression = clamp(h.competitorAggression, 0, 100);

  // ── 7. Calculate deltas vs original ───────────────────────────
  const deltas: Partial<MetricsState> = {
    cash: Math.round(m.cash - metrics.cash),
    monthlyRevenue: Math.round(m.monthlyRevenue - metrics.monthlyRevenue),
    burnRate: Math.round(m.burnRate - metrics.burnRate),
    reputation: Math.round(m.reputation - metrics.reputation),
    morale: Math.round(m.morale - metrics.morale),
    churn: Math.round(m.churn - metrics.churn),
    legalRisk: Math.round(m.legalRisk - metrics.legalRisk),
    marketShare: Math.round((m.marketShare - metrics.marketShare) * 10) / 10,
  };

  // Round metric values for storage
  m.cash = Math.round(m.cash);
  m.monthlyRevenue = Math.round(m.monthlyRevenue);
  m.burnRate = Math.round(m.burnRate);
  m.reputation = Math.round(m.reputation * 10) / 10;
  m.morale = Math.round(m.morale * 10) / 10;
  m.churn = Math.round(m.churn * 10) / 10;
  m.legalRisk = Math.round(m.legalRisk * 10) / 10;
  m.marketShare = Math.round(m.marketShare * 10) / 10;

  return { metrics: m, hidden: h, deltas, newFlags, competitorAction };
}

/** Compute a simple performance score 0-100 based on final state. */
export function computePerformanceScore(metrics: MetricsState, startingCash: number): number {
  const cashScore = Math.min(100, (metrics.cash / startingCash) * 50);
  const reputationScore = metrics.reputation;
  const marketShareScore = Math.min(100, metrics.marketShare * 2);
  const moraleScore = metrics.morale;
  const riskScore = 100 - metrics.legalRisk;
  const churnScore = 100 - metrics.churn;

  return Math.round(
    cashScore * 0.25 +
    reputationScore * 0.2 +
    marketShareScore * 0.2 +
    moraleScore * 0.15 +
    riskScore * 0.1 +
    churnScore * 0.1
  );
}
