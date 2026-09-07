import { describe, expect, it } from 'vitest';

import {
  parseFlags,
  parseJsonArray,
  parseJsonObject,
  parseJsonOrNull,
  parseMetricDeltas,
  parseOptions,
  parseTags,
} from '@/lib/json';

/**
 * These columns hold JSON that a model generated, written months ago by a
 * version of the app that no longer exists. The whole point of the module is
 * that one malformed row costs that row and nothing else — so every case here
 * is a row that is wrong in some particular way, and the assertion is that the
 * caller still gets something it can render.
 */

describe('parseJsonObject', () => {
  it('reads a well-formed object', () => {
    expect(parseJsonObject('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('falls back on an empty column', () => {
    expect(parseJsonObject('', { fallback: true })).toEqual({ fallback: true });
  });

  it('falls back on text that is not JSON at all', () => {
    expect(parseJsonObject('{oh dear', { fallback: true })).toEqual({ fallback: true });
  });

  it('falls back on JSON that is not an object', () => {
    expect(parseJsonObject('[1,2]', { fallback: true })).toEqual({ fallback: true });
    expect(parseJsonObject('"text"', { fallback: true })).toEqual({ fallback: true });
    expect(parseJsonObject('7', { fallback: true })).toEqual({ fallback: true });
  });

  it('falls back on a literal null rather than returning it', () => {
    expect(parseJsonObject('null', { fallback: true })).toEqual({ fallback: true });
  });
});

describe('parseJsonArray', () => {
  const isString = (value: unknown) => typeof value === 'string';

  it('reads a well-formed array', () => {
    expect(parseJsonArray<string>('["a","b"]', isString)).toEqual(['a', 'b']);
  });

  it('is empty for an empty column', () => {
    expect(parseJsonArray('', isString)).toEqual([]);
  });

  it('is empty for text that is not JSON', () => {
    expect(parseJsonArray('[a,b', isString)).toEqual([]);
  });

  it('is empty for JSON that is not an array', () => {
    expect(parseJsonArray('{"a":1}', isString)).toEqual([]);
  });

  it('drops the entries that fail the check rather than the whole array', () => {
    expect(parseJsonArray<string>('["a",7,null,"b"]', isString)).toEqual(['a', 'b']);
  });
});

describe('parseJsonOrNull', () => {
  it('reads whatever was stored', () => {
    expect(parseJsonOrNull<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('gives null for a column that was never written', () => {
    expect(parseJsonOrNull('')).toBeNull();
  });

  it('gives null for text that is not JSON', () => {
    expect(parseJsonOrNull('not json')).toBeNull();
  });
});

describe('parseFlags', () => {
  it('reads the flag map', () => {
    expect(parseFlags('{"took_loan":true}')).toEqual({ took_loan: true });
  });

  it('gives an empty map for an unwritten or broken column', () => {
    expect(parseFlags('')).toEqual({});
    expect(parseFlags('{broken')).toEqual({});
  });
});

describe('parseTags', () => {
  it('reads the stored tags', () => {
    expect(parseTags('["cut_costs","layoffs"]')).toEqual(['cut_costs', 'layoffs']);
  });

  it('keeps only the strings', () => {
    expect(parseTags('["cut_costs",3,{"tag":"x"}]')).toEqual(['cut_costs']);
  });

  it('is empty for a broken column', () => {
    expect(parseTags('["cut_costs"')).toEqual([]);
  });
});

describe('parseMetricDeltas', () => {
  it('reads the numeric deltas', () => {
    expect(parseMetricDeltas('{"cash":-1000,"morale":4}')).toEqual({ cash: -1000, morale: 4 });
  });

  it('drops a non-numeric entry rather than rendering it', () => {
    expect(parseMetricDeltas('{"cash":-1000,"morale":"lots"}')).toEqual({ cash: -1000 });
  });

  it('drops a delta that is not finite', () => {
    // JSON cannot carry Infinity, but a null gets there and so does a string.
    expect(parseMetricDeltas('{"cash":null,"morale":4}')).toEqual({ morale: 4 });
  });

  it('is empty for a broken column', () => {
    expect(parseMetricDeltas('nonsense')).toEqual({});
  });
});

describe('parseOptions', () => {
  const stored = JSON.stringify([
    { id: 'A', text: 'Negotiate', risk: 'low', tags: ['negotiate_supplier'] },
    { id: 'B', text: 'Cut costs', risk: 'high', tags: ['cut_costs'] },
  ]);

  it('reads a well-formed option list', () => {
    expect(parseOptions(stored)).toEqual([
      { id: 'A', text: 'Negotiate', risk: 'low', tags: ['negotiate_supplier'] },
      { id: 'B', text: 'Cut costs', risk: 'high', tags: ['cut_costs'] },
    ]);
  });

  it('is empty for a column that is not JSON, rather than throwing', () => {
    expect(() => parseOptions('[{"id":"A"')).not.toThrow();
    expect(parseOptions('[{"id":"A"')).toEqual([]);
  });

  it('is empty for a column that was never written', () => {
    expect(parseOptions('')).toEqual([]);
  });

  it('is empty when the column holds an object instead of a list', () => {
    expect(parseOptions('{"id":"A","text":"Negotiate"}')).toEqual([]);
  });

  it('drops an option missing its id or its text', () => {
    const raw = JSON.stringify([
      { id: 'A', text: 'Negotiate' },
      { id: 'B' },
      { text: 'No id' },
      null,
      'A',
    ]);

    expect(parseOptions(raw).map((option) => option.id)).toEqual(['A']);
  });

  it('gives an option with no risk a middling one rather than undefined', () => {
    const [option] = parseOptions(JSON.stringify([{ id: 'A', text: 'Negotiate' }]));
    expect(option.risk).toBe('medium');
  });

  it('always hands back a tag array, whatever the column held', () => {
    const raw = JSON.stringify([
      { id: 'A', text: 'One', tags: 'cut_costs' },
      { id: 'B', text: 'Two' },
      { id: 'C', text: 'Three', tags: ['cut_costs', 7, null] },
    ]);

    expect(parseOptions(raw).map((option) => option.tags)).toEqual([[], [], ['cut_costs']]);
  });

  it('never returns a tag that is not a string, so a filter can be run over it', () => {
    const raw = JSON.stringify([{ id: 'A', text: 'One', tags: [1, {}, 'cut_costs'] }]);
    const [option] = parseOptions(raw);

    expect(option.tags.every((tag) => typeof tag === 'string')).toBe(true);
  });
});
