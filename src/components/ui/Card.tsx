import type { ReactNode } from 'react';

/**
 * The panel every new page is built from. Wraps the `.glass-panel` component
 * class the MVP already defines, so a card added today matches a card added
 * before the design system existed.
 */

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Adds a hover treatment. Only for cards that are themselves a link. */
  interactive?: boolean;
}

export function Card({ children, className = '', interactive = false }: CardProps) {
  const hover = interactive
    ? 'hover:border-accent-blue/40 transition-all duration-150 group'
    : '';

  return <div className={`glass-panel p-5 ${hover} ${className}`.trim()}>{children}</div>;
}

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Rendered right-aligned on the same row as the title. */
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary leading-tight">{title}</h2>
        {subtitle !== undefined && subtitle !== '' && (
          <p className="text-sm text-text-secondary mt-1">{subtitle}</p>
        )}
      </div>
      {action !== undefined && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** The small uppercase label that introduces a group of cards. */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
      {children}
    </h2>
  );
}
