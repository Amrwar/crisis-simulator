// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SimulationCard } from '@/components/dashboard/SimulationCard';
import type { SimulationSearchResult } from '@/lib/simulations/results';

afterEach(cleanup);

const BASE: SimulationSearchResult = {
  id: 'sim-1',
  industry: 'Retail',
  difficulty: 'Medium',
  companySize: 'Small',
  companyName: 'Nile Home Goods',
  status: 'active',
  endingType: '',
  performanceScore: 0,
  currentTurn: 4,
  maxTurns: 10,
  cash: 1_200_000,
  reputation: 62.4,
  marketShare: 24.4,
  hasNotes: false,
  tags: [],
  createdAt: '2025-03-12T10:00:00.000Z',
  endedAt: null,
};

const sim = (overrides: Partial<SimulationSearchResult> = {}): SimulationSearchResult => ({
  ...BASE,
  ...overrides,
});

function show(overrides: Partial<SimulationSearchResult> = {}) {
  return render(<SimulationCard sim={sim(overrides)} />).container;
}

describe('SimulationCard — an active run', () => {
  it('shows the company, industry and size', () => {
    show();

    expect(screen.getByText('Nile Home Goods')).toBeTruthy();
    expect(screen.getByText('Retail · Small')).toBeTruthy();
  });

  it('links to the play view', () => {
    const container = show({ status: 'active', id: 'sim-42' });
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/sim/sim-42');
  });

  it('marks itself as active', () => {
    const container = show({ status: 'active' });

    expect(container.querySelector('[data-status="active"]')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows the turn progress', () => {
    show({ currentTurn: 4, maxTurns: 10 });
    expect(screen.getByText('Turn 4/10')).toBeTruthy();
  });

  it('does not show an ending or a score', () => {
    const text = show({ status: 'active', endingType: '', performanceScore: 0 }).textContent ?? '';

    expect(text).not.toContain('/100');
    expect(screen.queryByText(/Growth Win/)).toBeNull();
  });

  it('falls back to the industry when the company was never named', () => {
    show({ companyName: '', industry: 'Healthcare' });
    expect(screen.getByRole('heading').textContent).toBe('Healthcare');
  });
});

describe('SimulationCard — a finished run', () => {
  const finished = {
    status: 'ended',
    endingType: 'growth_win',
    performanceScore: 84,
    endedAt: '2025-03-20T10:00:00.000Z',
  } as const;

  it('links to the report rather than the play view', () => {
    const container = show({ ...finished, id: 'sim-42' });
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/sim/sim-42/report');
  });

  it('marks itself as done', () => {
    const container = show(finished);

    expect(container.querySelector('[data-status="ended"]')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('names the ending', () => {
    show(finished);
    expect(screen.getByText('🏆 Growth Win')).toBeTruthy();
  });

  it('shows the score out of a hundred', () => {
    show(finished);

    expect(screen.getByText('84')).toBeTruthy();
    expect(screen.getByText('/100')).toBeTruthy();
  });

  it('omits the score when the run never recorded one', () => {
    const text = show({ ...finished, performanceScore: 0 }).textContent ?? '';
    expect(text).not.toContain('/100');
  });
});

describe('SimulationCard — metrics and annotations', () => {
  it('abbreviates the cash figure', () => {
    show({ cash: 1_200_000 });
    expect(screen.getByText('1.2M')).toBeTruthy();
  });

  it('rounds the reputation and the market share', () => {
    show({ reputation: 62.4, marketShare: 24.4 });

    expect(screen.getByText('62')).toBeTruthy();
    expect(screen.getByText('24%')).toBeTruthy();
  });

  it('shows the run labels', () => {
    show({ tags: ['practice', 'for-class'] });

    expect(screen.getByText('practice')).toBeTruthy();
    expect(screen.getByText('for-class')).toBeTruthy();
  });

  it('shows no label list when the run carries none', () => {
    const container = show({ tags: [] });
    expect(container.querySelector('ul')).toBeNull();
  });

  it('marks a run the owner has annotated, and only that one', () => {
    const annotated = show({ hasNotes: true });
    expect(annotated.textContent).toContain('📝');

    cleanup();

    const bare = show({ hasNotes: false });
    expect(bare.textContent).not.toContain('📝');
  });

  it('shows the date the run was started', () => {
    show({ createdAt: '2025-03-12T10:00:00.000Z' });
    expect(screen.getByText('12 Mar 2025')).toBeTruthy();
  });

  it('shows the difficulty', () => {
    show({ difficulty: 'Hard' });
    expect(screen.getByText('Hard')).toBeTruthy();
  });
});
