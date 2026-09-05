'use client';

import type { ReactNode } from 'react';

/**
 * The row of dropdowns above a filtered list. Shared by the leaderboard and
 * the dashboard so the two read the same way and clear the same way.
 */

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: readonly FilterOption[];
  onChange: (value: string) => void;
  /** The label for the "no filter" entry. */
  anyLabel?: string;
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  anyLabel = 'Any',
}: FilterSelectProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-field py-1.5 text-sm min-w-[9rem]"
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface FilterBarProps {
  children: ReactNode;
  /** Shown only when at least one filter is set. */
  onClear?: () => void;
  activeCount?: number;
}

export function FilterBar({ children, onClear, activeCount = 0 }: FilterBarProps) {
  return (
    <div className="glass-panel p-4 mb-6 flex flex-wrap items-end gap-3">
      {children}
      {onClear && activeCount > 0 && (
        <button type="button" onClick={onClear} className="btn-ghost text-xs py-1.5 px-3">
          Clear {activeCount === 1 ? 'filter' : `${activeCount} filters`}
        </button>
      )}
    </div>
  );
}

/** A free-text box that reads like the selects beside it. */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted flex-1 min-w-[12rem]">
      {label}
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="input-field py-1.5 text-sm"
      />
    </label>
  );
}
