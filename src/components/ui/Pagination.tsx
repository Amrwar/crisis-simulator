'use client';

import { pageWindow } from '@/lib/pagination';
import type { Page } from '@/types';

/**
 * The pager every list page shares. Renders the elided page window the
 * pagination helper computes, so the control keeps a stable width whether the
 * list has four pages or four hundred.
 */

interface PaginationProps {
  page: Pick<Page<unknown>, 'page' | 'pageCount' | 'hasPrevious' | 'hasNext' | 'total'>;
  onPageChange: (page: number) => void;
  /** What the rows are, for the "showing n of m" line. */
  itemLabel?: string;
}

export function Pagination({ page, onPageChange, itemLabel = 'results' }: PaginationProps) {
  if (page.pageCount <= 1) {
    return (
      <p className="text-xs text-text-muted text-center py-3">
        {page.total} {itemLabel}
      </p>
    );
  }

  const window = pageWindow(page.page, page.pageCount);

  return (
    <nav className="flex items-center justify-between gap-4 py-4" aria-label="Pagination">
      <p className="text-xs text-text-muted">
        Page {page.page} of {page.pageCount} · {page.total} {itemLabel}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn-ghost text-xs py-1 px-2"
          disabled={!page.hasPrevious}
          onClick={() => onPageChange(page.page - 1)}
        >
          Previous
        </button>

        {window.map((entry, index) =>
          entry === null ? (
            <span key={`gap-${index}`} className="px-2 text-text-muted text-xs" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-current={entry === page.page ? 'page' : undefined}
              className={
                entry === page.page
                  ? 'bg-accent-blue text-white text-xs font-semibold py-1 px-2.5 rounded-lg'
                  : 'btn-ghost text-xs py-1 px-2.5'
              }
              onClick={() => onPageChange(entry)}
            >
              {entry}
            </button>
          )
        )}

        <button
          type="button"
          className="btn-ghost text-xs py-1 px-2"
          disabled={!page.hasNext}
          onClick={() => onPageChange(page.page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
