import { describe, expect, it } from 'vitest';

import { getStartingMetrics } from '@/lib/game/starting-metrics';

const INDUSTRIES = ['Retail', 'Restaurant', 'SaaS', 'Construction', 'Healthcare'] as const;
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
const SIZES = ['Small', 'Medium'] as const;

describe('getStartingMetrics', () => {
  it('is deterministic — the same setup always yields the same numbers', () => {
    expect(getStartingMetrics('Retail', 'Medium', 'Small')).toEqual(
      getStartingMetrics('Retail', 'Medium', 'Small')
    );
  });

  it('returns an independent object each call', () => {
    const first = getStartingMetrics('SaaS', 'Easy', 'Medium');
    first.cash = -1;
    expect(getStartingMetrics('SaaS', 'Easy', 'Medium').cash).toBeGreaterThan(0);
  });

  it('starts a Medium company with more cash and revenue than a Small one', () => {
    const small = getStartingMetrics('Retail', 'Medium', 'Small');
    const medium = getStartingMetrics('Retail', 'Medium', 'Medium');
    expect(medium.cash).toBeGreaterThan(small.cash);
    expect(medium.monthlyRevenue).toBeGreaterThan(small.monthlyRevenue);
    expect(medium.marketShare).toBeGreaterThan(small.marketShare);
  });

  it('applies the industry modifier on top of the size baseline', () => {
    const retail = getStartingMetrics('Retail', 'Medium', 'Medium');
    const healthcare = getStartingMetrics('Healthcare', 'Medium', 'Medium');

    // Retail is volatile and contested; Healthcare is sticky and regulated.
    expect(retail.demandVolatility).toBeGreaterThan(healthcare.demandVolatility);
    expect(retail.competitorAggression).toBeGreaterThan(healthcare.competitorAggression);
    expect(healthcare.legalRisk).toBeGreaterThan(retail.legalRisk);
    expect(healthcare.churn).toBeLessThan(retail.churn);
  });

  it('gives Restaurant a weaker supply chain than SaaS', () => {
    expect(getStartingMetrics('Restaurant', 'Medium', 'Medium').supplierReliability).toBeLessThan(
      getStartingMetrics('SaaS', 'Medium', 'Medium').supplierReliability
    );
  });

  it('makes Hard strictly harsher than Easy for the same company', () => {
    const easy = getStartingMetrics('Retail', 'Easy', 'Medium');
    const medium = getStartingMetrics('Retail', 'Medium', 'Medium');
    const hard = getStartingMetrics('Retail', 'Hard', 'Medium');

    expect(easy.cash).toBeGreaterThan(medium.cash);
    expect(hard.cash).toBeLessThan(medium.cash);

    expect(easy.reputation).toBeGreaterThan(hard.reputation);
    expect(easy.morale).toBeGreaterThan(hard.morale);
    expect(easy.churn).toBeLessThan(hard.churn);
    expect(easy.legalRisk).toBeLessThan(hard.legalRisk);
    expect(easy.competitorStrength).toBeLessThan(hard.competitorStrength);
  });

  it('leaves Medium difficulty as the unmodified baseline', () => {
    const medium = getStartingMetrics('SaaS', 'Medium', 'Small');
    const easy = getStartingMetrics('SaaS', 'Easy', 'Small');
    expect(medium.cash).toBe(easy.cash - 200_000);
  });

  it('clamps every percentage metric into its documented band', () => {
    for (const industry of INDUSTRIES) {
      for (const difficulty of DIFFICULTIES) {
        for (const size of SIZES) {
          const m = getStartingMetrics(industry, difficulty, size);
          const label = `${industry}/${difficulty}/${size}`;

          expect(m.reputation, label).toBeGreaterThanOrEqual(20);
          expect(m.reputation, label).toBeLessThanOrEqual(95);
          expect(m.morale, label).toBeGreaterThanOrEqual(20);
          expect(m.morale, label).toBeLessThanOrEqual(95);
          expect(m.churn, label).toBeGreaterThanOrEqual(5);
          expect(m.churn, label).toBeLessThanOrEqual(60);
          expect(m.legalRisk, label).toBeGreaterThanOrEqual(0);
          expect(m.legalRisk, label).toBeLessThanOrEqual(60);
          expect(m.marketShare, label).toBeGreaterThanOrEqual(3);
          expect(m.marketShare, label).toBeLessThanOrEqual(50);
          expect(m.supplierReliability, label).toBeGreaterThanOrEqual(20);
          expect(m.supplierReliability, label).toBeLessThanOrEqual(95);
          expect(m.employeeLoyalty, label).toBeGreaterThanOrEqual(20);
          expect(m.employeeLoyalty, label).toBeLessThanOrEqual(95);
          expect(m.demandVolatility, label).toBeGreaterThanOrEqual(10);
          expect(m.demandVolatility, label).toBeLessThanOrEqual(80);
          expect(m.competitorAggression, label).toBeGreaterThanOrEqual(20);
          expect(m.competitorAggression, label).toBeLessThanOrEqual(85);
          expect(m.competitorStrength, label).toBeGreaterThanOrEqual(20);
          expect(m.competitorStrength, label).toBeLessThanOrEqual(90);
        }
      }
    }
  });

  it('never starts a company below the monetary floors', () => {
    for (const industry of INDUSTRIES) {
      for (const difficulty of DIFFICULTIES) {
        for (const size of SIZES) {
          const m = getStartingMetrics(industry, difficulty, size);
          const label = `${industry}/${difficulty}/${size}`;
          expect(m.cash, label).toBeGreaterThanOrEqual(50_000);
          expect(m.burnRate, label).toBeGreaterThanOrEqual(50_000);
          expect(m.monthlyRevenue, label).toBeGreaterThanOrEqual(50_000);
        }
      }
    }
  });

  it('exposes every field the simulation record needs', () => {
    expect(Object.keys(getStartingMetrics('Retail', 'Medium', 'Small')).sort()).toEqual(
      [
        'burnRate',
        'cash',
        'churn',
        'competitorAggression',
        'competitorStrength',
        'demandVolatility',
        'employeeLoyalty',
        'legalRisk',
        'marketShare',
        'monthlyRevenue',
        'morale',
        'reputation',
        'supplierReliability',
      ].sort()
    );
  });
});
