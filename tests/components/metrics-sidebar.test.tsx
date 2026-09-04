// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MetricsSidebar, type Metrics } from '@/components/sim/MetricsSidebar';

afterEach(cleanup);

const HEALTHY: Metrics = {
  cash: 1_200_000,
  monthlyRevenue: 300_000,
  burnRate: 200_000,
  reputation: 68,
  morale: 71,
  churn: 18,
  legalRisk: 12,
  marketShare: 24.4,
};

function show(metrics: Partial<Metrics> = {}, deltas?: Partial<Metrics>, startingCash = 1_000_000) {
  return render(
    <MetricsSidebar metrics={{ ...HEALTHY, ...metrics }} deltas={deltas} startingCash={startingCash} />
  ).container;
}

describe('MetricsSidebar — numbers on screen', () => {
  it('abbreviates millions and thousands', () => {
    const text = show().textContent ?? '';
    expect(text).toContain('1.2M');
    expect(text).toContain('300K EGP');
    expect(text).toContain('200K EGP');
  });

  it('spells out amounts below a thousand', () => {
    expect(show({ cash: 640 }).textContent).toContain('640');
  });

  it('shows the net monthly flow with a leading plus when the company is profitable', () => {
    expect(show({ monthlyRevenue: 500_000, burnRate: 200_000 }).textContent).toContain('+300K EGP');
  });

  it('shows a negative net monthly flow when the company is burning cash', () => {
    const text = show({ monthlyRevenue: 100_000, burnRate: 300_000 }).textContent ?? '';
    expect(text).toContain('-200000 EGP');
    expect(text).not.toContain('+-');
  });

  it('renders the bounded metrics out of 100', () => {
    const text = show().textContent ?? '';
    expect(text).toContain('68/100');
    expect(text).toContain('71/100');
    expect(text).toContain('12/100');
    expect(text).toContain('18%');
    expect(text).toContain('24.4%');
  });

  it('labels every metric it displays', () => {
    const text = show().textContent ?? '';
    for (const label of [
      'Cash (EGP)',
      'Revenue/mo',
      'Burn/mo',
      'Net/mo',
      'Reputation',
      'Employee Morale',
      'Customer Churn',
      'Legal Risk',
      'Market Share',
    ]) {
      expect(text, label).toContain(label);
    }
  });
});

describe('MetricsSidebar — change badges', () => {
  it('shows no badge when no change is supplied', () => {
    const plain = show().textContent;
    const changed = show({}, { reputation: 6 }).textContent;
    expect(changed).not.toBe(plain);
    expect(changed).toContain('+6');
    expect(plain).not.toContain('+6');
  });

  it('shows no badge for a change of zero', () => {
    expect(show({}, { reputation: 0, morale: 0, cash: 0, churn: 0 }).textContent).toBe(
      show().textContent
    );
  });

  it('marks a gain with a plus and a loss with a minus', () => {
    expect(show({}, { reputation: 6 }).textContent).toContain('+6');
    expect(show({}, { morale: -4 }).textContent).toContain('-4');
  });

  it('abbreviates large monetary changes', () => {
    expect(show({}, { cash: 250_000 }).textContent).toContain('+250K');
  });

  it('inverts churn and legal risk so that a rise reads as bad news', () => {
    // The raw delta is a rise of 6 points, which is a setback, so it is shown as -6.
    expect(show({}, { churn: 6 }).textContent).toContain('-6');
    expect(show({}, { legalRisk: 9 }).textContent).toContain('-9');
    expect(show({}, { churn: -6 }).textContent).toContain('+6');
  });
});

describe('MetricsSidebar — danger banners', () => {
  it('stays quiet while the company is healthy', () => {
    const text = show().textContent ?? '';
    expect(text).not.toContain('Critical: Cash nearly depleted');
    expect(text).not.toContain('High legal risk');
    expect(text).not.toContain('Morale critical');
  });

  it('warns once cash drops below a hundred thousand', () => {
    expect(show({ cash: 99_999 }).textContent).toContain('Critical: Cash nearly depleted');
    expect(show({ cash: 100_000 }).textContent).not.toContain('Critical: Cash nearly depleted');
  });

  it('warns once legal risk reaches seventy five', () => {
    expect(show({ legalRisk: 75 }).textContent).toContain('scandal imminent');
    expect(show({ legalRisk: 74 }).textContent).not.toContain('scandal imminent');
  });

  it('warns once morale falls below twenty five', () => {
    expect(show({ morale: 24 }).textContent).toContain('resignation wave risk');
    expect(show({ morale: 25 }).textContent).not.toContain('resignation wave risk');
  });

  it('can show several warnings at once', () => {
    const text = show({ cash: 10_000, legalRisk: 90, morale: 5 }).textContent ?? '';
    expect(text).toContain('Critical: Cash nearly depleted');
    expect(text).toContain('scandal imminent');
    expect(text).toContain('resignation wave risk');
  });
});
