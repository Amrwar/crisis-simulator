import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPage,
  clampPageRequest,
  pageCountFor,
  pageWindow,
  paginateArray,
  resolvePageRequest,
  toSkipTake,
} from '@/lib/pagination';

describe('resolvePageRequest', () => {
  it('reads a well-formed query string', () => {
    expect(resolvePageRequest('3', '25')).toEqual({ page: 3, pageSize: 25 });
  });

  it('accepts numbers as well as strings', () => {
    expect(resolvePageRequest(2, 10)).toEqual({ page: 2, pageSize: 10 });
  });

  it('falls back to the first page and the default size when nothing was sent', () => {
    expect(resolvePageRequest(undefined, undefined)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('honours a caller-supplied default page size', () => {
    expect(resolvePageRequest(null, null, 40).pageSize).toBe(40);
  });

  it('treats unparseable values as absent rather than failing the request', () => {
    expect(resolvePageRequest('banana', 'lots')).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('treats an empty string as absent', () => {
    expect(resolvePageRequest('', '   ')).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('clamps a page below one up to one', () => {
    expect(resolvePageRequest('0', '10').page).toBe(1);
    expect(resolvePageRequest('-7', '10').page).toBe(1);
  });

  it('clamps an over-large page size to the maximum', () => {
    expect(resolvePageRequest('1', '5000').pageSize).toBe(MAX_PAGE_SIZE);
  });

  it('clamps a page size below one up to one', () => {
    expect(resolvePageRequest('1', '0').pageSize).toBe(1);
  });

  it('truncates a fractional page rather than rounding it', () => {
    expect(resolvePageRequest('2.9', '10.8')).toEqual({ page: 2, pageSize: 10 });
  });

  it('rejects a non-finite page size', () => {
    expect(resolvePageRequest('Infinity', 'NaN')).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });
});

describe('toSkipTake', () => {
  it('skips nothing on the first page', () => {
    expect(toSkipTake({ page: 1, pageSize: 12 })).toEqual({ skip: 0, take: 12 });
  });

  it('skips a whole window per page thereafter', () => {
    expect(toSkipTake({ page: 4, pageSize: 12 })).toEqual({ skip: 36, take: 12 });
  });
});

describe('pageCountFor', () => {
  it('reports one page when there is nothing to show', () => {
    expect(pageCountFor(0, 10)).toBe(1);
  });

  it('reports a whole page for a partial final window', () => {
    expect(pageCountFor(21, 10)).toBe(3);
  });

  it('reports exactly the divisor when the rows divide evenly', () => {
    expect(pageCountFor(30, 10)).toBe(3);
  });

  it('never divides by a page size of zero', () => {
    expect(pageCountFor(30, 0)).toBe(1);
  });
});

describe('buildPage', () => {
  it('reports the neighbours of a middle page', () => {
    const page = buildPage(['a', 'b'], 10, { page: 2, pageSize: 2 });

    expect(page).toEqual({
      items: ['a', 'b'],
      total: 10,
      page: 2,
      pageSize: 2,
      pageCount: 5,
      hasPrevious: true,
      hasNext: true,
    });
  });

  it('has no previous page on the first page', () => {
    expect(buildPage([1], 3, { page: 1, pageSize: 1 }).hasPrevious).toBe(false);
  });

  it('has no next page on the last page', () => {
    expect(buildPage([3], 3, { page: 3, pageSize: 1 }).hasNext).toBe(false);
  });

  it('clamps a page beyond the end back to the last real page', () => {
    const page = buildPage([], 5, { page: 99, pageSize: 2 });

    expect(page.page).toBe(3);
    expect(page.pageCount).toBe(3);
    expect(page.hasNext).toBe(false);
  });

  it('describes an empty result as a single empty page', () => {
    const page = buildPage([], 0, { page: 1, pageSize: 10 });

    expect(page.pageCount).toBe(1);
    expect(page.hasPrevious).toBe(false);
    expect(page.hasNext).toBe(false);
  });
});

describe('paginateArray', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7];

  it('returns the first window', () => {
    expect(paginateArray(rows, { page: 1, pageSize: 3 }).items).toEqual([1, 2, 3]);
  });

  it('returns a middle window', () => {
    expect(paginateArray(rows, { page: 2, pageSize: 3 }).items).toEqual([4, 5, 6]);
  });

  it('returns the short final window', () => {
    expect(paginateArray(rows, { page: 3, pageSize: 3 }).items).toEqual([7]);
  });

  it('counts every row, not just the ones on this page', () => {
    expect(paginateArray(rows, { page: 1, pageSize: 3 }).total).toBe(7);
  });

  it('returns the last page when asked for one past the end', () => {
    const page = paginateArray(rows, { page: 12, pageSize: 3 });

    expect(page.page).toBe(3);
    expect(page.items).toEqual([7]);
  });

  it('does not mutate the array it was given', () => {
    const original = [...rows];
    paginateArray(rows, { page: 2, pageSize: 3 });
    expect(rows).toEqual(original);
  });
});

describe('clampPageRequest', () => {
  it('leaves a page that exists alone', () => {
    expect(clampPageRequest({ page: 2, pageSize: 10 }, 35)).toEqual({ page: 2, pageSize: 10 });
  });

  it('pulls a page past the end back to the last real one', () => {
    expect(clampPageRequest({ page: 99, pageSize: 10 }, 35).page).toBe(4);
  });

  it('lands on the first page when there is nothing to show', () => {
    expect(clampPageRequest({ page: 99, pageSize: 10 }, 0).page).toBe(1);
  });

  it('raises a page below one', () => {
    expect(clampPageRequest({ page: -4, pageSize: 10 }, 35).page).toBe(1);
  });

  it('keeps the page size it was handed', () => {
    expect(clampPageRequest({ page: 99, pageSize: 7 }, 35).pageSize).toBe(7);
  });

  it('produces a window that actually holds rows', () => {
    const clamped = clampPageRequest({ page: 99, pageSize: 10 }, 35);
    const { skip } = toSkipTake(clamped);

    expect(skip).toBeLessThan(35);
  });

  it('agrees with the page buildPage reports for the same request', () => {
    const request = { page: 99, pageSize: 10 };

    expect(clampPageRequest(request, 35).page).toBe(buildPage([], 35, request).page);
  });
});

describe('pageWindow', () => {
  it('offers a single page when that is all there is', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });

  it('lists every page when they all fit', () => {
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  });

  it('elides the middle when the current page is near the start', () => {
    expect(pageWindow(2, 10)).toEqual([1, 2, 3, null, 10]);
  });

  it('elides both sides when the current page is in the middle', () => {
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
  });

  it('elides the middle when the current page is near the end', () => {
    expect(pageWindow(10, 10)).toEqual([1, null, 9, 10]);
  });

  it('always includes the first and the last page', () => {
    const window = pageWindow(50, 100);
    expect(window[0]).toBe(1);
    expect(window[window.length - 1]).toBe(100);
  });

  it('widens with a larger radius', () => {
    expect(pageWindow(6, 12, 2)).toEqual([1, null, 4, 5, 6, 7, 8, null, 12]);
  });

  it('shows the page itself rather than an ellipsis standing for one page', () => {
    expect(pageWindow(4, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('clamps a current page outside the range', () => {
    expect(pageWindow(99, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(-3, 4)).toEqual([1, 2, 3, 4]);
  });

  it('never repeats a page number', () => {
    const window = pageWindow(3, 5).filter((p): p is number => p !== null);
    expect(new Set(window).size).toBe(window.length);
  });
});
