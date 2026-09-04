// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Timeline } from '@/components/sim/Timeline';

afterEach(cleanup);

interface TurnEntry {
  turnNumber: number;
  title: string;
  optionId?: string;
  freeText?: string;
  tags?: string[];
  metricDeltas?: Record<string, number>;
  decidedAt?: string | null;
}

const DECIDED = '2026-01-01T00:00:00.000Z';

function turn(overrides: Partial<TurnEntry> = {}): TurnEntry {
  return {
    turnNumber: 1,
    title: 'Customs Delay',
    optionId: 'A',
    tags: ['negotiate_supplier'],
    metricDeltas: { cash: -120_000, reputation: 3 },
    decidedAt: DECIDED,
    ...overrides,
  };
}

function show(turns: TurnEntry[], currentTurn = turns.length + 1) {
  return render(<Timeline turns={turns} currentTurn={currentTurn} />).container;
}

describe('Timeline — empty state', () => {
  it('invites the player to make a decision when nothing has been decided', () => {
    show([]);
    expect(screen.getByText('Your decision history will appear here')).toBeTruthy();
    expect(screen.queryByText('Turn History')).toBeNull();
  });

  it('ignores turns that are still awaiting a decision', () => {
    show([turn({ decidedAt: null })]);
    expect(screen.getByText('Your decision history will appear here')).toBeTruthy();
  });

  it('switches to the history heading as soon as one turn is decided', () => {
    show([turn()]);
    expect(screen.getByText('Turn History')).toBeTruthy();
    expect(screen.queryByText('Your decision history will appear here')).toBeNull();
  });
});

describe('Timeline — history entries', () => {
  it('lists the most recent decision first', () => {
    const text =
      show([
        turn({ turnNumber: 1, title: 'First Crisis' }),
        turn({ turnNumber: 2, title: 'Second Crisis' }),
        turn({ turnNumber: 3, title: 'Third Crisis' }),
      ]).textContent ?? '';

    expect(text.indexOf('T3: Third Crisis')).toBeLessThan(text.indexOf('T2: Second Crisis'));
    expect(text.indexOf('T2: Second Crisis')).toBeLessThan(text.indexOf('T1: First Crisis'));
  });

  it('leaves undecided turns out of the list', () => {
    const text =
      show([turn({ turnNumber: 1 }), turn({ turnNumber: 2, title: 'Pending', decidedAt: null })])
        .textContent ?? '';
    expect(text).not.toContain('Pending');
  });

  it('names the chosen option when the player picked one', () => {
    expect(show([turn({ optionId: 'C' })]).textContent).toContain('Option C');
  });

  it('quotes short free text in full', () => {
    const text = show([turn({ optionId: undefined, freeText: 'Renegotiate with the supplier' })])
      .textContent;
    expect(text).toContain('Renegotiate with the supplier');
    expect(text).not.toContain('…');
  });

  it('truncates long free text at sixty characters', () => {
    const long = 'x'.repeat(120);
    const text = show([turn({ optionId: undefined, freeText: long })]).textContent ?? '';
    expect(text).toContain(`${'x'.repeat(60)}…`);
    expect(text).not.toContain('x'.repeat(61));
  });

  it('shows the decision tags with readable spacing', () => {
    expect(show([turn({ tags: ['negotiate_supplier'] })]).textContent).toContain(
      'negotiate supplier'
    );
  });

  it('shows at most three tags and counts the rest', () => {
    const text =
      show([
        turn({ tags: ['cut_costs', 'take_loan', 'layoffs', 'hire_staff', 'raise_prices'] }),
      ]).textContent ?? '';

    expect(text).toContain('cut costs');
    expect(text).toContain('take loan');
    expect(text).toContain('layoffs');
    expect(text).not.toContain('hire staff');
    expect(text).toContain('+2');
  });
});

describe('Timeline — metric changes', () => {
  it('abbreviates monetary changes and keeps their sign', () => {
    const text = show([turn({ metricDeltas: { cash: -120_000 } })]).textContent ?? '';
    expect(text).toContain('Cash: -120K EGP');

    expect(show([turn({ metricDeltas: { cash: 2_500_000 } })]).textContent).toContain(
      'Cash: +2.5M EGP'
    );
  });

  it('shows small monetary changes without abbreviating', () => {
    expect(show([turn({ metricDeltas: { cash: -450 } })]).textContent).toContain('Cash: -450 EGP');
  });

  it('shows point changes for the percentage metrics', () => {
    const text =
      show([turn({ metricDeltas: { reputation: 6, morale: -3, marketShare: 1.25 } })])
        .textContent ?? '';
    expect(text).toContain('Rep: +6');
    expect(text).toContain('Morale: -3');
    expect(text).toContain('Mkt%: +1.3');
  });

  it('omits metrics that did not move', () => {
    const text = show([turn({ metricDeltas: { cash: 0, reputation: 5 } })]).textContent ?? '';
    expect(text).toContain('Rep: +5');
    expect(text).not.toContain('Cash:');
  });

  it('shows at most four changed metrics', () => {
    const text =
      show([
        turn({
          metricDeltas: {
            cash: 1000,
            reputation: 1,
            morale: 2,
            churn: 3,
            legalRisk: 4,
            marketShare: 5,
          },
        }),
      ]).textContent ?? '';

    const shown = ['Cash:', 'Rep:', 'Morale:', 'Churn:', 'Legal:', 'Mkt%:'].filter((label) =>
      text.includes(label)
    );
    expect(shown).toHaveLength(4);
  });

  it('copes with a turn that reports no changes at all', () => {
    expect(show([turn({ metricDeltas: undefined })]).textContent).toContain('T1: Customs Delay');
  });
});
