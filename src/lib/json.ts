/**
 * Reading the JSON-in-a-text-column fields.
 *
 * Simulations and turns store several structures as JSON strings, because the
 * production datasource is PostgreSQL through Prisma and these are read whole
 * or not at all. `JSON.parse` throws on anything malformed, so a single bad
 * row could take down a whole listing. These helpers turn that into a missing
 * value, which every caller can render as "none" instead.
 */

/** Parses an object column, falling back to the supplied default. */
export function parseJsonObject<T extends object>(raw: string, fallback: T): T {
  if (raw === '') return fallback;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Parses an array column, keeping only the entries that pass `isValid`.
 *
 * Filtering rather than rejecting means one unexpected entry costs that entry,
 * not the whole array.
 */
export function parseJsonArray<T>(raw: string, isValid: (value: unknown) => boolean): T[] {
  if (raw === '') return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValid) as T[];
  } catch {
    return [];
  }
}

/** Parses a column that may legitimately be empty, giving null when it is. */
export function parseJsonOrNull<T>(raw: string): T | null {
  if (raw === '') return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** The `{ "flag": true }` map a simulation stores. */
export function parseFlags(raw: string): Record<string, unknown> {
  return parseJsonObject<Record<string, unknown>>(raw, {});
}

/** The decision tags a turn stores. */
export function parseTags(raw: string): string[] {
  return parseJsonArray<string>(raw, (value) => typeof value === 'string');
}

/** The metric deltas a turn stores, keeping only numeric entries. */
export function parseMetricDeltas(raw: string): Record<string, number> {
  const parsed = parseJsonObject<Record<string, unknown>>(raw, {});
  const deltas: Record<string, number> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'number' && Number.isFinite(value)) deltas[key] = value;
  }

  return deltas;
}

/** The decision options a turn stores. */
export interface StoredOption {
  id: string;
  text: string;
  risk: string;
  tags: string[];
}

export function parseOptions(raw: string): StoredOption[] {
  return parseJsonArray<StoredOption>(
    raw,
    (value) =>
      value !== null &&
      typeof value === 'object' &&
      typeof (value as StoredOption).id === 'string' &&
      typeof (value as StoredOption).text === 'string'
  ).map((option) => ({
    ...option,
    risk: typeof option.risk === 'string' ? option.risk : 'medium',
    tags: Array.isArray(option.tags) ? option.tags.filter((t) => typeof t === 'string') : [],
  }));
}
