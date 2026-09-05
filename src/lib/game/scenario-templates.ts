import { z } from 'zod';

import { getStartingMetrics, type StartingMetrics } from './starting-metrics';
import { COMPANY_SIZES, DIFFICULTIES, INDUSTRIES, type CompanySize, type Difficulty, type Industry } from '@/types';

/**
 * Named starting configurations.
 *
 * `getStartingMetrics` already turns an industry, a difficulty and a size into
 * an opening position. A template is that triple plus a set of deltas on top,
 * so a lecturer can hand a class "the same shop, but with three months of
 * runway instead of six" without touching the difficulty curve.
 *
 * The built-in presets ship with the product; a user can also save their own.
 */

/** Which starting metrics a template is allowed to move. */
export const MODIFIABLE_METRICS = [
  'cash',
  'monthlyRevenue',
  'burnRate',
  'reputation',
  'morale',
  'churn',
  'legalRisk',
  'marketShare',
  'supplierReliability',
  'employeeLoyalty',
  'demandVolatility',
  'competitorAggression',
  'competitorStrength',
] as const;

export type ModifiableMetric = (typeof MODIFIABLE_METRICS)[number];

export type MetricModifiers = Partial<Record<ModifiableMetric, number>>;

/**
 * Bounds on a single modifier.
 *
 * Cash and the other currency figures move in whole units and can legitimately
 * be large; the 0–100 metrics cannot sensibly move by more than their range.
 * Without a bound a template could set an opening position the rules engine
 * would clamp anyway, which reads as a template that does not work.
 */
const CURRENCY_METRICS: ReadonlySet<ModifiableMetric> = new Set<ModifiableMetric>([
  'cash',
  'monthlyRevenue',
  'burnRate',
]);

export const MAX_CURRENCY_MODIFIER = 5_000_000;
export const MAX_SCALE_MODIFIER = 100;

export function modifierLimitFor(metric: ModifiableMetric): number {
  return CURRENCY_METRICS.has(metric) ? MAX_CURRENCY_MODIFIER : MAX_SCALE_MODIFIER;
}

export const MetricModifiersSchema = z
  .record(z.string(), z.number())
  .superRefine((modifiers, ctx) => {
    for (const [key, value] of Object.entries(modifiers)) {
      if (!(MODIFIABLE_METRICS as readonly string[]).includes(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${key} is not a startable metric` });
        continue;
      }

      if (!Number.isFinite(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${key} must be a real number` });
        continue;
      }

      const limit = modifierLimitFor(key as ModifiableMetric);
      if (Math.abs(value) > limit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} may move by at most ${limit}`,
        });
      }
    }
  })
  .transform((modifiers) => modifiers as MetricModifiers);

export const MAX_TEMPLATE_NAME_LENGTH = 60;
export const MAX_TEMPLATE_DESCRIPTION_LENGTH = 280;

export const TemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'A template needs a name')
    .max(MAX_TEMPLATE_NAME_LENGTH, `Names are limited to ${MAX_TEMPLATE_NAME_LENGTH} characters`),
  description: z
    .string()
    .trim()
    .max(
      MAX_TEMPLATE_DESCRIPTION_LENGTH,
      `Descriptions are limited to ${MAX_TEMPLATE_DESCRIPTION_LENGTH} characters`
    )
    .default(''),
  industry: z.enum(INDUSTRIES),
  difficulty: z.enum(DIFFICULTIES),
  companySize: z.enum(COMPANY_SIZES),
  metricModifiers: MetricModifiersSchema.default({}),
});

export type TemplateInput = z.infer<typeof TemplateSchema>;

/** A template the product ships with. Not stored, and not editable. */
export interface BuiltInTemplate extends TemplateInput {
  /** Stable identifier, distinct from any stored template's cuid. */
  key: string;
  emoji: string;
}

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  {
    key: 'builtin:cash-crunch',
    emoji: '⏳',
    name: 'Cash Crunch',
    description:
      'The same shop, with roughly three months of runway instead of six. Every decision is a financing decision.',
    industry: 'Retail',
    difficulty: 'Medium',
    companySize: 'Small',
    metricModifiers: { cash: -350_000 },
  },
  {
    key: 'builtin:reputation-repair',
    emoji: '🩹',
    name: 'Reputation Repair',
    description:
      'You inherit a business the public has stopped trusting. The money is fine; the brand is not.',
    industry: 'Restaurant',
    difficulty: 'Medium',
    companySize: 'Small',
    metricModifiers: { reputation: -30, churn: 20, cash: 200_000 },
  },
  {
    key: 'builtin:hostile-market',
    emoji: '⚔️',
    name: 'Hostile Market',
    description:
      'A well-funded rival has decided to take your customers. Comfortable position, aggressive competitor.',
    industry: 'SaaS',
    difficulty: 'Hard',
    companySize: 'Medium',
    metricModifiers: { competitorAggression: 30, competitorStrength: 25, marketShare: -5 },
  },
  {
    key: 'builtin:compliance-storm',
    emoji: '⚖️',
    name: 'Compliance Storm',
    description:
      'The regulator is already looking at you. One more misstep and the legal risk becomes the whole game.',
    industry: 'Healthcare',
    difficulty: 'Hard',
    companySize: 'Medium',
    metricModifiers: { legalRisk: 35, reputation: -10 },
  },
  {
    key: 'builtin:steady-hand',
    emoji: '🌱',
    name: 'Steady Hand',
    description:
      'A healthy business on an easy setting. The gentlest way to learn what each decision actually does.',
    industry: 'Retail',
    difficulty: 'Easy',
    companySize: 'Small',
    metricModifiers: { cash: 250_000, morale: 10 },
  },
  {
    key: 'builtin:overextended',
    emoji: '🏗️',
    name: 'Overextended',
    description:
      'Growth outran the cash. Revenue looks good, the burn rate looks worse, and the suppliers are unhappy.',
    industry: 'Construction',
    difficulty: 'Hard',
    companySize: 'Medium',
    metricModifiers: { burnRate: 200_000, supplierReliability: -25, monthlyRevenue: 150_000 },
  },
];

export function builtInTemplate(key: string): BuiltInTemplate | null {
  return BUILT_IN_TEMPLATES.find((template) => template.key === key) ?? null;
}

export function isBuiltInKey(key: string): boolean {
  return key.startsWith('builtin:');
}

/**
 * Applies a template's modifiers to the opening position its triple produces.
 *
 * The same clamps `getStartingMetrics` applies are re-applied afterwards, so a
 * template cannot open a run outside the ranges the rules engine assumes — a
 * reputation of 130 would simply be clamped on the first turn, which would read
 * as the template silently not working.
 */
export function applyTemplate(
  industry: Industry,
  difficulty: Difficulty,
  companySize: CompanySize,
  modifiers: MetricModifiers
): StartingMetrics {
  const base = getStartingMetrics(industry, difficulty, companySize);
  const result: StartingMetrics = { ...base };

  for (const metric of MODIFIABLE_METRICS) {
    const delta = modifiers[metric];
    if (typeof delta === 'number' && Number.isFinite(delta)) {
      result[metric] = result[metric] + delta;
    }
  }

  return clampStartingMetrics(result);
}

/** The ranges `getStartingMetrics` guarantees, re-applied after a modifier. */
export function clampStartingMetrics(metrics: StartingMetrics): StartingMetrics {
  return {
    ...metrics,
    reputation: clamp(metrics.reputation, 20, 95),
    morale: clamp(metrics.morale, 20, 95),
    churn: clamp(metrics.churn, 5, 60),
    legalRisk: clamp(metrics.legalRisk, 0, 60),
    marketShare: clamp(metrics.marketShare, 3, 50),
    supplierReliability: clamp(metrics.supplierReliability, 20, 95),
    employeeLoyalty: clamp(metrics.employeeLoyalty, 20, 95),
    demandVolatility: clamp(metrics.demandVolatility, 10, 80),
    competitorAggression: clamp(metrics.competitorAggression, 20, 85),
    competitorStrength: clamp(metrics.competitorStrength, 20, 90),
    cash: Math.max(50_000, metrics.cash),
    burnRate: Math.max(50_000, metrics.burnRate),
    monthlyRevenue: Math.max(50_000, metrics.monthlyRevenue),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The most templates one user may keep, beyond the built-ins. */
export const MAX_TEMPLATES_PER_USER = 30;

/** A template the user saved, as the API returns it. */
export interface StoredTemplate {
  id: string;
  name: string;
  description: string;
  industry: string;
  difficulty: string;
  companySize: string;
  metricModifiers: MetricModifiers;
  usageCount: number;
  createdAt: string;
}

/** The whole payload `GET /api/templates` answers with. */
export interface TemplatesPayload {
  builtIn: BuiltInTemplate[];
  mine: StoredTemplate[];
}

/** A one-line summary of what a template changes, for a card. */
export function describeModifiers(modifiers: MetricModifiers): string {
  const parts = MODIFIABLE_METRICS.filter((metric) => typeof modifiers[metric] === 'number').map(
    (metric) => {
      const delta = modifiers[metric] as number;
      const sign = delta > 0 ? '+' : '';
      const shown = CURRENCY_METRICS.has(metric)
        ? `${sign}${Math.round(delta / 1000)}K`
        : `${sign}${Math.round(delta)}`;
      return `${metric} ${shown}`;
    }
  );

  return parts.length === 0 ? 'Standard opening position' : parts.join(', ');
}
