export interface StartingMetrics {
  cash: number;
  monthlyRevenue: number;
  burnRate: number;
  reputation: number;
  morale: number;
  churn: number;
  legalRisk: number;
  marketShare: number;
  supplierReliability: number;
  employeeLoyalty: number;
  demandVolatility: number;
  competitorAggression: number;
  competitorStrength: number;
}

type Size = 'Small' | 'Medium';
type Difficulty = 'Easy' | 'Medium' | 'Hard';
type Industry = 'Retail' | 'Restaurant' | 'SaaS' | 'Construction' | 'Healthcare';

const BASE: Record<Size, StartingMetrics> = {
  Small: {
    cash: 600_000,
    monthlyRevenue: 220_000,
    burnRate: 160_000,
    reputation: 68,
    morale: 72,
    churn: 18,
    legalRisk: 8,
    marketShare: 7,
    supplierReliability: 68,
    employeeLoyalty: 70,
    demandVolatility: 35,
    competitorAggression: 40,
    competitorStrength: 45,
  },
  Medium: {
    cash: 2_200_000,
    monthlyRevenue: 850_000,
    burnRate: 640_000,
    reputation: 70,
    morale: 70,
    churn: 15,
    legalRisk: 10,
    marketShare: 18,
    supplierReliability: 72,
    employeeLoyalty: 68,
    demandVolatility: 28,
    competitorAggression: 45,
    competitorStrength: 55,
  },
};

/** Industry modifiers applied on top of base metrics. */
const INDUSTRY_MOD: Record<Industry, Partial<StartingMetrics>> = {
  Retail: {
    demandVolatility: 10, // seasonal demand swings
    churn: 3,
    marketShare: -2,
    competitorAggression: 10,
  },
  Restaurant: {
    morale: -5,
    reputation: 5,
    burnRate: 20_000,
    supplierReliability: -10, // food supply chains are tricky
    churn: 5,
  },
  SaaS: {
    cash: 200_000, // usually VC-backed
    monthlyRevenue: -50_000, // still building revenue
    burnRate: 50_000, // higher burn
    legalRisk: -2,
    employeeLoyalty: 5,
    competitorAggression: 15,
  },
  Construction: {
    cash: -100_000, // capital-intensive
    legalRisk: 8,
    supplierReliability: -8,
    morale: -3,
    burnRate: 30_000,
  },
  Healthcare: {
    legalRisk: 10,
    reputation: 5,
    morale: 5,
    churn: -5, // patients are sticky
    employeeLoyalty: 5,
    competitorAggression: -10,
  },
};

/** Difficulty adjustments to starting position. */
const DIFF_MOD: Record<Difficulty, Partial<StartingMetrics>> = {
  Easy: {
    cash: 200_000,
    reputation: 5,
    morale: 5,
    churn: -5,
    legalRisk: -3,
    competitorAggression: -10,
    competitorStrength: -10,
  },
  Medium: {},
  Hard: {
    cash: -200_000,
    reputation: -10,
    morale: -10,
    churn: 10,
    legalRisk: 8,
    burnRate: 30_000,
    competitorAggression: 15,
    competitorStrength: 15,
    demandVolatility: 10,
    supplierReliability: -10,
  },
};

function applyMod(base: StartingMetrics, mod: Partial<StartingMetrics>): StartingMetrics {
  const result = { ...base };
  for (const [key, delta] of Object.entries(mod) as [keyof StartingMetrics, number][]) {
    result[key] = (result[key] as number) + delta;
  }
  return result;
}

export function getStartingMetrics(
  industry: Industry,
  difficulty: Difficulty,
  size: Size
): StartingMetrics {
  let metrics = { ...BASE[size] };
  metrics = applyMod(metrics, INDUSTRY_MOD[industry] ?? {});
  metrics = applyMod(metrics, DIFF_MOD[difficulty] ?? {});

  // Clamp percentages to valid ranges
  metrics.reputation = Math.min(95, Math.max(20, metrics.reputation));
  metrics.morale = Math.min(95, Math.max(20, metrics.morale));
  metrics.churn = Math.min(60, Math.max(5, metrics.churn));
  metrics.legalRisk = Math.min(60, Math.max(0, metrics.legalRisk));
  metrics.marketShare = Math.min(50, Math.max(3, metrics.marketShare));
  metrics.supplierReliability = Math.min(95, Math.max(20, metrics.supplierReliability));
  metrics.employeeLoyalty = Math.min(95, Math.max(20, metrics.employeeLoyalty));
  metrics.demandVolatility = Math.min(80, Math.max(10, metrics.demandVolatility));
  metrics.competitorAggression = Math.min(85, Math.max(20, metrics.competitorAggression));
  metrics.competitorStrength = Math.min(90, Math.max(20, metrics.competitorStrength));

  // Ensure cash is positive
  metrics.cash = Math.max(50_000, metrics.cash);
  metrics.burnRate = Math.max(50_000, metrics.burnRate);
  metrics.monthlyRevenue = Math.max(50_000, metrics.monthlyRevenue);

  return metrics;
}
