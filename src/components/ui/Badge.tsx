import type { ReactNode } from 'react';

/**
 * The small coloured chips used for statuses, endings, difficulties and tags.
 *
 * The tone names — rather than raw colour classes at each call site — keep the
 * meaning attached to the colour: an "ended" run and a "bankruptcy" ending are
 * different facts and should not accidentally share a red by coincidence.
 */

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'text-text-secondary bg-bg-secondary border-bg-border',
  info: 'text-accent-blue bg-blue-950/40 border-accent-blue/40',
  success: 'text-accent-green bg-green-950/40 border-accent-green/40',
  warning: 'text-accent-orange bg-orange-950/40 border-accent-orange/40',
  danger: 'text-accent-red bg-red-950/40 border-accent-red/40',
  accent: 'text-accent-purple bg-purple-950/40 border-accent-purple/40',
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  title?: string;
}

export function Badge({ children, tone = 'neutral', className = '', title }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium ${TONE_CLASSES[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

/** Difficulty reads as a rising temperature, so it gets its own mapping. */
export function difficultyTone(difficulty: string): BadgeTone {
  switch (difficulty) {
    case 'Easy':
      return 'success';
    case 'Medium':
      return 'info';
    case 'Hard':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** How good an ending was, as a tone. */
export function endingTone(endingType: string): BadgeTone {
  switch (endingType) {
    case 'growth_win':
      return 'success';
    case 'survival':
      return 'info';
    case 'takeover':
      return 'warning';
    case 'bankruptcy':
    case 'scandal':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Short human labels for the five endings, with the emoji the MVP uses. */
export const ENDING_LABELS: Record<string, string> = {
  growth_win: '🏆 Growth Win',
  survival: '🛡️ Survival',
  takeover: '🔄 Takeover',
  bankruptcy: '💸 Bankruptcy',
  scandal: '⚠️ Scandal',
};

export function endingLabel(endingType: string): string {
  return ENDING_LABELS[endingType] ?? endingType ?? '';
}

/** The industry glyphs the dashboard cards already show. */
export const INDUSTRY_ICONS: Record<string, string> = {
  Retail: '🛍️',
  Restaurant: '🍽️',
  SaaS: '💻',
  Construction: '🏗️',
  Healthcare: '🏥',
};

export function industryIcon(industry: string): string {
  return INDUSTRY_ICONS[industry] ?? '🏢';
}

/** A monospace chip for a decision tag. */
export function TagChip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="tag-badge" title={title}>
      {children}
    </span>
  );
}
