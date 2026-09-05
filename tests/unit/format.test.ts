import { describe, expect, it } from 'vitest';

import {
  formatAmountDelta,
  formatCompactAmount,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDelta,
  formatDuration,
  formatExactAmount,
  formatIsoDate,
  formatPercent,
  formatScore,
  humanizeTag,
  ordinal,
  pluralize,
  truncateWords,
} from '@/lib/format';

describe('formatCompactAmount', () => {
  it('abbreviates millions to one decimal', () => {
    expect(formatCompactAmount(1_240_000)).toBe('1.2M');
  });

  it('abbreviates thousands to a whole number', () => {
    expect(formatCompactAmount(342_400)).toBe('342K');
  });

  it('spells out anything below a thousand', () => {
    expect(formatCompactAmount(640)).toBe('640');
  });

  it('rounds a fractional small amount', () => {
    expect(formatCompactAmount(640.6)).toBe('641');
  });

  it('keeps the sign on a negative amount', () => {
    expect(formatCompactAmount(-1_500_000)).toBe('-1.5M');
    expect(formatCompactAmount(-2_500)).toBe('-3K');
  });

  it('renders zero as zero, not as an abbreviation', () => {
    expect(formatCompactAmount(0)).toBe('0');
  });

  it('switches units exactly at the thresholds', () => {
    expect(formatCompactAmount(999)).toBe('999');
    expect(formatCompactAmount(1_000)).toBe('1K');
    expect(formatCompactAmount(999_999)).toBe('1000K');
    expect(formatCompactAmount(1_000_000)).toBe('1.0M');
  });

  it('shows a dash for a value that is not a number', () => {
    expect(formatCompactAmount(Number.NaN)).toBe('—');
    expect(formatCompactAmount(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatCurrency', () => {
  it('appends the currency the simulation is denominated in', () => {
    expect(formatCurrency(1_200_000)).toBe('1.2M EGP');
  });

  it('still shows a dash for a value that is not a number', () => {
    expect(formatCurrency(Number.NaN)).toBe('—');
  });
});

describe('formatExactAmount', () => {
  it('groups thousands and elides nothing', () => {
    expect(formatExactAmount(1_234_567)).toBe('1,234,567');
  });

  it('rounds to whole units', () => {
    expect(formatExactAmount(1234.7)).toBe('1,235');
  });

  it('returns an empty cell for a value that is not a number', () => {
    expect(formatExactAmount(Number.NaN)).toBe('');
  });
});

describe('formatPercent', () => {
  it('keeps one decimal by default', () => {
    expect(formatPercent(24.42)).toBe('24.4%');
  });

  it('drops a trailing zero decimal', () => {
    expect(formatPercent(20)).toBe('20%');
  });

  it('honours a requested precision', () => {
    expect(formatPercent(24.4567, 2)).toBe('24.46%');
  });

  it('keeps the sign on a negative percentage', () => {
    expect(formatPercent(-3.5)).toBe('-3.5%');
  });
});

describe('formatScore', () => {
  it('renders a metric out of one hundred', () => {
    expect(formatScore(62.4)).toBe('62/100');
  });
});

describe('formatDelta', () => {
  it('prefixes a rise with a plus', () => {
    expect(formatDelta(4)).toBe('+4');
  });

  it('prefixes a fall with a minus', () => {
    expect(formatDelta(-12)).toBe('-12');
  });

  it('renders no change without a sign', () => {
    expect(formatDelta(0)).toBe('0');
  });

  it('treats a change that rounds away as no change', () => {
    expect(formatDelta(0.4)).toBe('0');
  });

  it('keeps requested decimals', () => {
    expect(formatDelta(1.25, 1)).toBe('+1.3');
  });
});

describe('formatAmountDelta', () => {
  it('abbreviates and signs a rise', () => {
    expect(formatAmountDelta(1_200_000)).toBe('+1.2M');
  });

  it('abbreviates and signs a fall', () => {
    expect(formatAmountDelta(-340_000)).toBe('-340K');
  });

  it('renders no change without a sign', () => {
    expect(formatAmountDelta(0)).toBe('0');
    expect(formatAmountDelta(0.2)).toBe('0');
  });
});

describe('date formatting', () => {
  const moment = new Date('2025-03-12T14:05:00.000Z');

  it('renders a short day-month-year date', () => {
    expect(formatDate(moment)).toBe('12 Mar 2025');
  });

  it('accepts an ISO string as readily as a Date', () => {
    expect(formatDate('2025-03-12T14:05:00.000Z')).toBe('12 Mar 2025');
  });

  it('shows a dash for an unparseable date', () => {
    expect(formatDate('not a date')).toBe('—');
    expect(formatDateTime('not a date')).toBe('—');
  });

  it('adds the time of day for a timeline entry', () => {
    expect(formatDateTime(moment)).toContain('12 Mar 2025, ');
    expect(formatDateTime(moment)).toMatch(/\d{2}:\d{2}$/);
  });

  it('renders ISO-8601 for an export column', () => {
    expect(formatIsoDate(moment)).toBe('2025-03-12T14:05:00.000Z');
  });

  it('returns an empty export cell for an unparseable date', () => {
    expect(formatIsoDate('nonsense')).toBe('');
  });
});

describe('formatDuration', () => {
  const start = new Date('2025-03-12T10:00:00.000Z');
  const after = (ms: number) => new Date(start.getTime() + ms);

  it('reports seconds under a minute', () => {
    expect(formatDuration(start, after(45_000))).toBe('45s');
  });

  it('reports whole minutes under an hour', () => {
    expect(formatDuration(start, after(9 * 60_000))).toBe('9m');
  });

  it('reports a bare hour count when the minutes are zero', () => {
    expect(formatDuration(start, after(2 * 3_600_000))).toBe('2h');
  });

  it('reports hours and minutes together', () => {
    expect(formatDuration(start, after(2 * 3_600_000 + 30 * 60_000))).toBe('2h 30m');
  });

  it('reports days beyond twenty-four hours', () => {
    expect(formatDuration(start, after(86_400_000))).toBe('1 day');
    expect(formatDuration(start, after(3 * 86_400_000))).toBe('3 days');
  });

  it('never reports a negative span', () => {
    expect(formatDuration(after(60_000), start)).toBe('0s');
  });

  it('shows a dash when either end is unparseable', () => {
    expect(formatDuration('nope', start)).toBe('—');
  });
});

describe('humanizeTag', () => {
  it('turns a snake-case tag into a sentence-cased phrase', () => {
    expect(humanizeTag('negotiate_supplier')).toBe('Negotiate supplier');
  });

  it('handles hyphens too', () => {
    expect(humanizeTag('cut-costs')).toBe('Cut costs');
  });

  it('leaves an already-readable word alone apart from the capital', () => {
    expect(humanizeTag('layoffs')).toBe('Layoffs');
  });

  it('returns nothing for an empty tag', () => {
    expect(humanizeTag('')).toBe('');
    expect(humanizeTag('__')).toBe('');
  });
});

describe('ordinal', () => {
  it('handles the irregular ones', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
  });

  it('handles the teens, which are all "th"', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  it('handles the twenties, which repeat the pattern', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
  });

  it('handles a hundred and its teens', () => {
    expect(ordinal(100)).toBe('100th');
    expect(ordinal(111)).toBe('111th');
    expect(ordinal(121)).toBe('121st');
  });
});

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'turn')).toBe('1 turn');
  });

  it('uses the plural for anything else', () => {
    expect(pluralize(0, 'turn')).toBe('0 turns');
    expect(pluralize(4, 'turn')).toBe('4 turns');
  });

  it('accepts an irregular plural', () => {
    expect(pluralize(2, 'company', 'companies')).toBe('2 companies');
  });
});

describe('truncateWords', () => {
  const sentence = 'The supplier held the shipment at customs for eleven days';

  it('leaves text that already fits alone', () => {
    expect(truncateWords('short', 20)).toBe('short');
  });

  it('cuts on a word boundary and marks the cut', () => {
    const cut = truncateWords(sentence, 20);

    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(21);
    expect(sentence.startsWith(cut.slice(0, -1))).toBe(true);
  });

  it('cuts mid-word rather than losing most of the budget', () => {
    expect(truncateWords('supercalifragilistic word', 12)).toBe('supercalifra…');
  });
});
