import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The three things a data-backed panel can be showing instead of data:
 * still loading, nothing to show, or a failure. Each page used to spell these
 * out inline, which is how they drifted apart.
 */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="text-center py-20 text-text-muted" role="status">
      {label}
    </div>
  );
}

/** An inline spinner for a button or a row that is refreshing in place. */
export function Spinner({ label = 'Working' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-text-muted text-sm" role="status">
      <span
        aria-hidden="true"
        className="inline-block w-3 h-3 rounded-full border-2 border-bg-border border-t-accent-blue animate-spin"
      />
      {label}
    </span>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-text-primary mb-2">{title}</h3>
      {description !== undefined && description !== '' && (
        <p className="text-text-secondary mb-6 max-w-md mx-auto">{description}</p>
      )}
      {action && (
        <Link href={action.href} className="btn-primary px-6 py-3 rounded-xl inline-block">
          {action.label}
        </Link>
      )}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      className="glass-panel p-6 border-accent-red/40 text-center"
      role="alert"
    >
      <div className="text-3xl mb-2" aria-hidden="true">
        ⚠️
      </div>
      <p className="text-accent-red font-medium mb-1">Something went wrong</p>
      <p className="text-text-secondary text-sm mb-4">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-ghost text-sm">
          Try again
        </button>
      )}
    </div>
  );
}

/** A short banner for a message that does not replace the whole panel. */
export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'danger';
  children: ReactNode;
}) {
  const classes = {
    info: 'text-accent-blue bg-blue-950/30 border-accent-blue/30',
    success: 'text-accent-green bg-green-950/30 border-accent-green/30',
    danger: 'text-accent-red bg-red-950/30 border-accent-red/30',
  }[tone];

  return (
    <div className={`text-sm rounded-md px-3 py-2 border ${classes}`} role="status">
      {children}
    </div>
  );
}
