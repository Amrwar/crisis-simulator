import { describe, expect, it } from 'vitest';

import {
  LIST_CSV_COLUMNS,
  LIST_CSV_HEADERS,
  LIST_EXPORT_FORMAT_VERSION,
  MAX_LIST_EXPORT_ROWS,
  buildListCsvExport,
  buildListJsonExport,
  toListExportRow,
} from '@/lib/export/list-export';
import type { SimulationSearchResult } from '@/lib/simulations/results';

function result(overrides: Partial<SimulationSearchResult> = {}): SimulationSearchResult {
  return {
    id: 'run-1',
    industry: 'Retail',
    difficulty: 'Medium',
    companySize: 'Small',
    companyName: 'Nile Home Goods',
    status: 'ended',
    endingType: 'survival',
    performanceScore: 64,
    currentTurn: 10,
    maxTurns: 10,
    cash: 1_000_000,
    reputation: 60,
    marketShare: 20,
    hasNotes: false,
    tags: [],
    createdAt: '2025-03-01T09:00:00.000Z',
    endedAt: '2025-03-12T10:00:00.000Z',
    ...overrides,
  };
}

/** Splits a CSV document into rows of raw (still escaped) text. */
function lines(csv: string): string[] {
  return csv.split('\r\n').filter((line) => line !== '');
}

describe('toListExportRow', () => {
  it('flattens a search result into the export row', () => {
    expect(toListExportRow(result())).toEqual({
      id: 'run-1',
      company: 'Nile Home Goods',
      industry: 'Retail',
      difficulty: 'Medium',
      company_size: 'Small',
      status: 'ended',
      ending: 'survival',
      score: 64,
      turn: 10,
      max_turns: 10,
      cash: 1_000_000,
      reputation: 60,
      market_share: 20,
      labels: '',
      has_notes: false,
      created_at: '2025-03-01T09:00:00.000Z',
      ended_at: '2025-03-12T10:00:00.000Z',
    });
  });

  it('joins labels into one cell', () => {
    expect(toListExportRow(result({ tags: ['risky', 'cash-crunch'] })).labels).toBe(
      'risky cash-crunch'
    );
  });

  it('leaves the end date empty for a run still in progress', () => {
    const row = toListExportRow(result({ status: 'active', endingType: '', endedAt: null }));

    expect(row.ended_at).toBe('');
    expect(row.ending).toBe('');
  });

  it('carries the note marker through as a boolean', () => {
    expect(toListExportRow(result({ hasNotes: true })).has_notes).toBe(true);
  });
});

describe('buildListCsvExport', () => {
  it('writes the header row even when nothing matched', () => {
    const csv = buildListCsvExport([]);

    expect(lines(csv)).toEqual([LIST_CSV_HEADERS.join(',')]);
  });

  it('writes one row per run, in the order given', () => {
    const csv = buildListCsvExport([
      result({ id: 'a', companyName: 'Alpha' }),
      result({ id: 'b', companyName: 'Beta' }),
    ]);

    const rows = lines(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1].startsWith('a,Alpha,')).toBe(true);
    expect(rows[2].startsWith('b,Beta,')).toBe(true);
  });

  it('quotes a company name containing a comma so the columns do not shift', () => {
    const csv = buildListCsvExport([result({ companyName: 'Nile Goods, Cairo' })]);
    const row = lines(csv)[1];

    expect(row).toContain('"Nile Goods, Cairo"');
    // The quoted comma must not be read as a delimiter.
    expect(row.split(',')).toHaveLength(LIST_CSV_HEADERS.length + 1);
  });

  it('doubles a quote inside a company name', () => {
    const csv = buildListCsvExport([result({ companyName: 'The "Nile" Co' })]);

    expect(lines(csv)[1]).toContain('"The ""Nile"" Co"');
  });

  it('pins the column order', () => {
    expect(LIST_CSV_HEADERS).toEqual([
      'id',
      'company',
      'industry',
      'difficulty',
      'company_size',
      'status',
      'ending',
      'score',
      'turn',
      'max_turns',
      'cash',
      'reputation',
      'market_share',
      'labels',
      'has_notes',
      'created_at',
      'ended_at',
    ]);
  });

  it('keeps every column backed by a real row field', () => {
    const row = toListExportRow(result());

    for (const column of LIST_CSV_COLUMNS) {
      expect(Object.keys(row)).toContain(column.key);
    }
  });
});

describe('MAX_LIST_EXPORT_ROWS', () => {
  it('bounds a download to a whole positive number of rows', () => {
    expect(Number.isInteger(MAX_LIST_EXPORT_ROWS)).toBe(true);
    expect(MAX_LIST_EXPORT_ROWS).toBeGreaterThan(0);
  });
});

describe('buildListJsonExport', () => {
  const source = {
    results: [result()],
    filters: { status: 'ended', industry: 'Retail' },
    sort: { field: 'performanceScore', direction: 'desc' },
    total: 1,
    truncated: false,
  } as const;

  it('records the format version', () => {
    expect(buildListJsonExport({ ...source }).formatVersion).toBe(LIST_EXPORT_FORMAT_VERSION);
  });

  it('keeps the query that produced the cohort alongside the rows', () => {
    const payload = buildListJsonExport({ ...source });

    expect(payload.query).toEqual({
      filters: { status: 'ended', industry: 'Retail' },
      sort: { field: 'performanceScore', direction: 'desc' },
    });
  });

  it('reports how many matched and how many were written', () => {
    const payload = buildListJsonExport({
      ...source,
      results: [result({ id: 'a' }), result({ id: 'b' })],
      total: 40,
      truncated: true,
    });

    expect(payload.total).toBe(40);
    expect(payload.exported).toBe(2);
    expect(payload.truncated).toBe(true);
  });

  it('writes the runs as export rows rather than raw results', () => {
    const runs = buildListJsonExport({ ...source }).runs as Array<Record<string, unknown>>;

    expect(runs).toHaveLength(1);
    expect(runs[0].company).toBe('Nile Home Goods');
    // The projection's own field names must not leak into the file.
    expect(runs[0]).not.toHaveProperty('companyName');
    expect(runs[0]).not.toHaveProperty('performanceScore');
  });

  it('stamps an export time that parses', () => {
    const payload = buildListJsonExport({ ...source });

    expect(Number.isNaN(new Date(payload.exportedAt as string).getTime())).toBe(false);
  });

  it('describes an empty cohort without inventing rows', () => {
    const payload = buildListJsonExport({ ...source, results: [], total: 0 });

    expect(payload.runs).toEqual([]);
    expect(payload.exported).toBe(0);
  });
});
