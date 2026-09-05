import { describe, expect, it } from 'vitest';

import {
  contentDisposition,
  csvRow,
  escapeCsvField,
  objectsToCsv,
  safeFilename,
  toCsv,
} from '@/lib/export/csv';

describe('escapeCsvField', () => {
  it('leaves an ordinary value alone', () => {
    expect(escapeCsvField('Retail')).toBe('Retail');
  });

  it('quotes a value containing a comma', () => {
    expect(escapeCsvField('Cairo, Egypt')).toBe('"Cairo, Egypt"');
  });

  it('quotes and doubles an embedded quote', () => {
    expect(escapeCsvField('He said "no"')).toBe('"He said ""no"""');
  });

  it('quotes a value containing a newline', () => {
    expect(escapeCsvField('line one\nline two')).toBe('"line one\nline two"');
    expect(escapeCsvField('line one\r\nline two')).toBe('"line one\r\nline two"');
  });

  it('quotes a value with leading or trailing whitespace, which would be trimmed', () => {
    expect(escapeCsvField('  padded  ')).toBe('"  padded  "');
  });

  it('renders an empty value as an empty field', () => {
    expect(escapeCsvField('')).toBe('');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('renders a number without quoting it', () => {
    expect(escapeCsvField(1_200_000)).toBe('1200000');
    expect(escapeCsvField(-4.5)).toBe('-4.5');
    expect(escapeCsvField(0)).toBe('0');
  });

  it('renders a value that is not a real number as empty', () => {
    expect(escapeCsvField(Number.NaN)).toBe('');
    expect(escapeCsvField(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('renders a boolean in words', () => {
    expect(escapeCsvField(true)).toBe('true');
    expect(escapeCsvField(false)).toBe('false');
  });

  it('renders a date as ISO-8601, which a spreadsheet can sort', () => {
    expect(escapeCsvField(new Date('2025-03-12T10:00:00.000Z'))).toBe('2025-03-12T10:00:00.000Z');
  });
});

describe('csvRow', () => {
  it('joins fields with commas', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a,b,c');
  });

  it('does not let a field comma become a separator', () => {
    expect(csvRow(['a,b', 'c'])).toBe('"a,b",c');
  });

  it('joins an empty row to an empty string', () => {
    expect(csvRow([])).toBe('');
  });
});

describe('toCsv', () => {
  it('writes a header row followed by the body', () => {
    const csv = toCsv(['turn', 'cash'], [[1, 100], [2, 200]]);
    expect(csv).toBe('turn,cash\r\n1,100\r\n2,200\r\n');
  });

  it('separates rows with CRLF, which is what RFC 4180 and Excel expect', () => {
    expect(toCsv(['a'], [['b']])).toContain('\r\n');
  });

  it('ends the document with a row separator', () => {
    expect(toCsv(['a'], [['b']]).endsWith('\r\n')).toBe(true);
  });

  it('writes a header-only document when there are no rows', () => {
    expect(toCsv(['turn', 'cash'], [])).toBe('turn,cash\r\n');
  });

  it('survives a body value that would break a naive join', () => {
    const csv = toCsv(['note'], [['Told the CFO: "cut, or we close"']]);
    expect(csv).toBe('note\r\n"Told the CFO: ""cut, or we close"""\r\n');
  });

  it('keeps every row on its own line even when a field has a newline in it', () => {
    const csv = toCsv(['a', 'b'], [['one\ntwo', 'x'], ['y', 'z']]);
    expect(csv.split('\r\n').filter((line) => line !== '')).toHaveLength(3);
  });
});

describe('objectsToCsv', () => {
  it('takes the column order from the definition, not the object', () => {
    const csv = objectsToCsv(
      [
        { key: 'second', header: 'Second' },
        { key: 'first', header: 'First' },
      ],
      [{ first: 1, second: 2 }]
    );

    expect(csv).toBe('Second,First\r\n2,1\r\n');
  });

  it('writes one row per object', () => {
    const csv = objectsToCsv([{ key: 'n', header: 'N' }], [{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(csv.trimEnd().split('\r\n')).toHaveLength(4);
  });
});

describe('safeFilename', () => {
  it('appends the extension', () => {
    expect(safeFilename('report', 'csv')).toBe('report.csv');
  });

  it('replaces spaces with hyphens', () => {
    expect(safeFilename('Nile Home Goods', 'json')).toBe('Nile-Home-Goods.json');
  });

  it('strips the characters Windows rejects', () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j', 'csv')).toBe('a-b-c-d-e-f-g-h-i-j.csv');
  });

  it('collapses runs of hyphens', () => {
    expect(safeFilename('a   b', 'csv')).toBe('a-b.csv');
  });

  it('trims leading and trailing hyphens and dots', () => {
    expect(safeFilename('  ..name..  ', 'csv')).toBe('name.csv');
  });

  it('falls back rather than producing a file with no name', () => {
    expect(safeFilename('///', 'csv')).toBe('crisissim-export.csv');
    expect(safeFilename('', 'json')).toBe('crisissim-export.json');
  });

  it('caps the length', () => {
    const name = safeFilename('x'.repeat(500), 'csv');
    expect(name.length).toBeLessThanOrEqual(85);
  });
});

describe('contentDisposition', () => {
  it('marks the response as an attachment with the filename', () => {
    expect(contentDisposition('run.csv')).toContain('attachment; filename="run.csv"');
  });

  it('carries the encoded form as well, so a non-ASCII name survives', () => {
    const header = contentDisposition('تقرير.csv');

    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('تقرير.csv'));
  });

  it('keeps the plain filename ASCII, since the header itself must be', () => {
    const plain = /filename="([^"]*)"/.exec(contentDisposition('تقرير.csv'))?.[1] ?? '';
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7e]*$/.test(plain)).toBe(true);
  });

  it('does not let a quote in the name break out of the header', () => {
    expect(contentDisposition('a"b.csv')).toContain('filename="ab.csv"');
  });
});
