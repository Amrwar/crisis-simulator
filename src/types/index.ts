/**
 * Shared types for the CrisisSim HTTP surface.
 *
 * Every route added after the original MVP answers with the same envelope, so
 * a caller can branch on one boolean instead of guessing from the status code
 * whether the body holds a payload or an error. The four MVP routes
 * (`/api/auth/*`, `/api/simulations`, `/api/simulations/[id]`,
 * `/api/simulations/[id]/turn`) predate the envelope and still answer with
 * bare objects; they are left alone so existing clients keep working.
 */

/** A successful response: the payload always lives under `data`. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** A failed response: `error` is a short human-readable reason. */
export interface ApiFailure {
  success: false;
  error: string;
  /** Field-level detail, present on validation failures. */
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Narrows an envelope to its success arm. */
export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.success === true;
}

// ─── Domain vocabulary ───────────────────────────────────────────────────────

export const INDUSTRIES = ['Retail', 'Restaurant', 'SaaS', 'Construction', 'Healthcare'] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const COMPANY_SIZES = ['Small', 'Medium'] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export const SIMULATION_STATUSES = ['active', 'ended'] as const;
export type SimulationStatus = (typeof SIMULATION_STATUSES)[number];

export const ENDING_TYPES = [
  'growth_win',
  'survival',
  'takeover',
  'bankruptcy',
  'scandal',
] as const;
export type EndingTypeName = (typeof ENDING_TYPES)[number];

/** Runtime membership checks, used by zod refinements and by the UI. */
export function isIndustry(value: string): value is Industry {
  return (INDUSTRIES as readonly string[]).includes(value);
}

export function isDifficulty(value: string): value is Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(value);
}

export function isCompanySize(value: string): value is CompanySize {
  return (COMPANY_SIZES as readonly string[]).includes(value);
}

export function isEndingType(value: string): value is EndingTypeName {
  return (ENDING_TYPES as readonly string[]).includes(value);
}

// ─── Paging ──────────────────────────────────────────────────────────────────

/** The shape every paginated list route returns inside `data`. */
export interface Page<T> {
  items: T[];
  /** Rows matching the filter, ignoring the page window. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

/** The eight metrics a player can see, in the order the UI presents them. */
export const VISIBLE_METRIC_KEYS = [
  'cash',
  'monthlyRevenue',
  'burnRate',
  'reputation',
  'morale',
  'churn',
  'legalRisk',
  'marketShare',
] as const;

export type VisibleMetricKey = (typeof VISIBLE_METRIC_KEYS)[number];

/**
 * Metrics where a larger number is a worse position. Charts and comparisons
 * flip the colour of a rise on these so "green" always means "better".
 */
export const LOWER_IS_BETTER: ReadonlySet<VisibleMetricKey> = new Set<VisibleMetricKey>([
  'burnRate',
  'churn',
  'legalRisk',
]);

export function isLowerBetter(key: VisibleMetricKey): boolean {
  return LOWER_IS_BETTER.has(key);
}

/** Display labels and units for each visible metric. */
export const METRIC_META: Record<
  VisibleMetricKey,
  { label: string; short: string; unit: 'currency' | 'percent' | 'score' }
> = {
  cash: { label: 'Cash', short: 'Cash', unit: 'currency' },
  monthlyRevenue: { label: 'Monthly revenue', short: 'Revenue', unit: 'currency' },
  burnRate: { label: 'Monthly burn', short: 'Burn', unit: 'currency' },
  reputation: { label: 'Reputation', short: 'Repute', unit: 'score' },
  morale: { label: 'Employee morale', short: 'Morale', unit: 'score' },
  churn: { label: 'Customer churn', short: 'Churn', unit: 'percent' },
  legalRisk: { label: 'Legal risk', short: 'Legal', unit: 'score' },
  marketShare: { label: 'Market share', short: 'Market', unit: 'percent' },
};
