import { describe, expect, it } from 'vitest';

import {
  SearchQuerySchema,
  activeFilterCount,
  appliedFilters,
  buildOrderBy,
  buildWhere,
  dateWindow,
  type SearchQuery,
} from '@/lib/simulations/filters';

const query = (overrides: Partial<SearchQuery> = {}): SearchQuery => ({
  sort: 'createdAt',
  direction: 'desc',
  ...overrides,
});

describe('SearchQuerySchema', () => {
  it('accepts an empty query and defaults the sort', () => {
    const parsed = SearchQuerySchema.safeParse({});

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sort).toBe('createdAt');
      expect(parsed.data.direction).toBe('desc');
    }
  });

  it('accepts every supported facet', () => {
    const parsed = SearchQuerySchema.safeParse({
      q: 'nile',
      industry: 'Retail',
      difficulty: 'Hard',
      status: 'ended',
      ending: 'growth_win',
      from: '2025-01-01',
      to: '2025-12-31',
      tag: 'practice',
      sort: 'performanceScore',
      direction: 'asc',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects a facet outside its vocabulary', () => {
    expect(SearchQuerySchema.safeParse({ industry: 'Aerospace' }).success).toBe(false);
    expect(SearchQuerySchema.safeParse({ status: 'paused' }).success).toBe(false);
    expect(SearchQuerySchema.safeParse({ ending: 'alien_invasion' }).success).toBe(false);
  });

  it('rejects a sort field it cannot order by', () => {
    expect(SearchQuerySchema.safeParse({ sort: 'seed' }).success).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(SearchQuerySchema.safeParse({ from: '01/01/2025' }).success).toBe(false);
    expect(SearchQuerySchema.safeParse({ from: 'yesterday' }).success).toBe(false);
  });

  it('rejects a search string past the limit', () => {
    expect(SearchQuerySchema.safeParse({ q: 'x'.repeat(500) }).success).toBe(false);
  });
});

describe('buildWhere', () => {
  it('always scopes to the caller', () => {
    expect(buildWhere(query(), 'user-1').userId).toBe('user-1');
  });

  it('cannot be widened past the caller by a query parameter', () => {
    // Even a query that names another user id ends up scoped to the session's.
    const where = buildWhere(query({ q: 'user-2' }), 'user-1');
    expect(where.userId).toBe('user-1');
  });

  it('adds nothing beyond the owner for an empty query', () => {
    expect(buildWhere(query(), 'user-1')).toEqual({ userId: 'user-1' });
  });

  it('narrows on each facet', () => {
    const where = buildWhere(
      query({ industry: 'SaaS', difficulty: 'Hard', status: 'ended', ending: 'growth_win' }),
      'user-1'
    );

    expect(where.industry).toBe('SaaS');
    expect(where.difficulty).toBe('Hard');
    expect(where.status).toBe('ended');
    expect(where.endingType).toBe('growth_win');
  });

  it('searches across the company, the competitor and the situation', () => {
    const where = buildWhere(query({ q: 'nile' }), 'user-1');

    expect(where.OR).toEqual([
      { companyName: { contains: 'nile' } },
      { competitorName: { contains: 'nile' } },
      { startingSituation: { contains: 'nile' } },
    ]);
  });

  it('ignores a search of only whitespace', () => {
    expect(buildWhere(query({ q: '   ' }), 'user-1').OR).toBeUndefined();
  });

  it('trims the search before matching', () => {
    const where = buildWhere(query({ q: '  nile  ' }), 'user-1');
    expect(where.OR?.[0]).toEqual({ companyName: { contains: 'nile' } });
  });

  it('narrows to runs carrying a label', () => {
    expect(buildWhere(query({ tag: 'practice' }), 'user-1').tags).toEqual({
      some: { label: 'practice' },
    });
  });

  it('applies a date window', () => {
    const where = buildWhere(query({ from: '2025-03-01', to: '2025-03-31' }), 'user-1');

    expect(where.createdAt?.gte?.toISOString()).toBe('2025-03-01T00:00:00.000Z');
    expect(where.createdAt?.lte?.toISOString()).toBe('2025-03-31T23:59:59.999Z');
  });
});

describe('dateWindow', () => {
  it('produces nothing when neither end is given', () => {
    expect(dateWindow(undefined, undefined)).toBeNull();
  });

  it('produces an open-ended window from one side', () => {
    expect(dateWindow('2025-03-01', undefined)).toEqual({
      gte: new Date('2025-03-01T00:00:00.000Z'),
    });
    expect(dateWindow(undefined, '2025-03-31')).toEqual({
      lte: new Date('2025-03-31T23:59:59.999Z'),
    });
  });

  it('includes the whole of the closing day', () => {
    const window = dateWindow('2025-03-12', '2025-03-12');
    expect(window?.lte?.toISOString()).toBe('2025-03-12T23:59:59.999Z');
  });

  it('produces nothing for an inverted range rather than an empty result', () => {
    expect(dateWindow('2025-12-31', '2025-01-01')).toBeNull();
  });

  it('produces nothing for an unparseable date', () => {
    expect(dateWindow('2025-13-45', undefined)).toBeNull();
  });
});

describe('buildOrderBy', () => {
  it('orders by creation date alone when that is the sort', () => {
    expect(buildOrderBy(query({ sort: 'createdAt', direction: 'desc' }))).toEqual([
      { createdAt: 'desc' },
    ]);
  });

  it('honours the direction', () => {
    expect(buildOrderBy(query({ sort: 'createdAt', direction: 'asc' }))).toEqual([
      { createdAt: 'asc' },
    ]);
  });

  it('adds a stable tie-break to every other sort', () => {
    expect(buildOrderBy(query({ sort: 'performanceScore', direction: 'desc' }))).toEqual([
      { performanceScore: 'desc' },
      { createdAt: 'desc' },
    ]);
  });

  it('tie-breaks a name sort too, so paging cannot drop a row', () => {
    expect(buildOrderBy(query({ sort: 'companyName', direction: 'asc' }))).toEqual([
      { companyName: 'asc' },
      { createdAt: 'desc' },
    ]);
  });
});

describe('activeFilterCount', () => {
  it('counts nothing for an unfiltered query', () => {
    expect(activeFilterCount(query())).toBe(0);
  });

  it('does not count the sort as a filter', () => {
    expect(activeFilterCount(query({ sort: 'performanceScore', direction: 'asc' }))).toBe(0);
  });

  it('counts each facet that narrows the list', () => {
    expect(activeFilterCount(query({ industry: 'SaaS', status: 'ended' }))).toBe(2);
  });

  it('does not count a search of only whitespace', () => {
    expect(activeFilterCount(query({ q: '   ' }))).toBe(0);
  });
});

describe('appliedFilters', () => {
  it('echoes nothing for an unfiltered query', () => {
    expect(appliedFilters(query())).toEqual({});
  });

  it('echoes each applied facet', () => {
    expect(appliedFilters(query({ industry: 'SaaS', tag: 'practice' }))).toEqual({
      industry: 'SaaS',
      tag: 'practice',
    });
  });

  it('echoes the trimmed search, not the raw one', () => {
    expect(appliedFilters(query({ q: '  nile  ' }))).toEqual({ q: 'nile' });
  });
});
