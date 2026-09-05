/**
 * Presentation helpers shared by the pages, the components and the exporters.
 *
 * Every number the player sees passes through here so that a cash figure reads
 * the same on the dashboard, in a comparison column and in a CSV cell.
 */

/**
 * Abbreviates an amount the way the MVP sidebar does: millions to one decimal,
 * thousands rounded, anything smaller in full. Negatives keep their sign.
 */
export function formatCompactAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '—';

  const sign = amount < 0 ? '-' : '';
  const size = Math.abs(amount);

  if (size >= 1_000_000) return `${sign}${(size / 1_000_000).toFixed(1)}M`;
  if (size >= 1_000) return `${sign}${Math.round(size / 1_000)}K`;
  return `${sign}${Math.round(size)}`;
}

/** The same abbreviation with the currency the simulation is denominated in. */
export function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return `${formatCompactAmount(amount)} EGP`;
}

/** A full-precision, grouped amount — used in exports, where nothing is elided. */
export function formatExactAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  return Math.round(amount).toLocaleString('en-US');
}

/** A percentage with at most one decimal, trailing `.0` removed. */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${trimTrailingZero(value.toFixed(decimals))}%`;
}

/** A 0–100 metric rendered as `62/100`. */
export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value)}/100`;
}

/**
 * A signed delta, for the "+4" / "−12" badges. Zero renders as `0` without a
 * sign so a no-change row does not read as an improvement.
 */
export function formatDelta(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';

  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return '0';

  const body = trimTrailingZero(Math.abs(rounded).toFixed(decimals));
  return rounded > 0 ? `+${body}` : `-${body}`;
}

/** A signed delta abbreviated like a cash figure (`+1.2M`, `-340K`). */
export function formatAmountDelta(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.round(value) === 0) return '0';
  return value > 0 ? `+${formatCompactAmount(value)}` : formatCompactAmount(value);
}

function trimTrailingZero(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** `12 Mar 2025` — the format the dashboard cards already use. */
export function formatDate(value: Date | string | number): string {
  const date = toDate(value);
  if (!date) return '—';

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** The same date with the time of day, for a run's timeline. */
export function formatDateTime(value: Date | string | number): string {
  const date = toDate(value);
  if (!date) return '—';

  return `${formatDate(date)}, ${date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** ISO-8601, for export columns that a spreadsheet should sort correctly. */
export function formatIsoDate(value: Date | string | number): string {
  const date = toDate(value);
  return date ? date.toISOString() : '';
}

function toDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * How long a run took, in the coarsest unit that still says something useful.
 * Used on the report and in the run history.
 */
export function formatDuration(fromValue: Date | string | number, toValue: Date | string | number): string {
  const from = toDate(fromValue);
  const to = toDate(toValue);
  if (!from || !to) return '—';

  const seconds = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  const days = Math.floor(seconds / 86_400);
  return days === 1 ? '1 day' : `${days} days`;
}

/** `negotiate_supplier` → `Negotiate supplier`, for tag chips and CSV headers. */
export function humanizeTag(tag: string): string {
  const spaced = tag.replace(/[_-]+/g, ' ').trim();
  if (spaced === '') return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `1` → `1st`. Turn numbers read better as ordinals in prose. */
export function ordinal(n: number): string {
  if (!Number.isFinite(n)) return '—';

  const whole = Math.trunc(n);
  const lastTwo = Math.abs(whole) % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${whole}th`;

  switch (Math.abs(whole) % 10) {
    case 1:
      return `${whole}st`;
    case 2:
      return `${whole}nd`;
    case 3:
      return `${whole}rd`;
    default:
      return `${whole}th`;
  }
}

/** `3` → `3 turns`, `1` → `1 turn`. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Shortens prose to a whole word, appending an ellipsis when it had to cut. */
export function truncateWords(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
