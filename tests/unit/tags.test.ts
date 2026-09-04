import { describe, expect, it } from 'vitest';

import { ALLOWED_TAGS, extractTagsFromKeywords, filterValidTags } from '@/lib/game/tags';

describe('ALLOWED_TAGS', () => {
  it('contains no duplicates', () => {
    expect(new Set(ALLOWED_TAGS).size).toBe(ALLOWED_TAGS.length);
  });

  it('uses lower_snake_case throughout', () => {
    for (const tag of ALLOWED_TAGS) {
      expect(tag, tag).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it('pairs each opposing strategy so options can present a real tradeoff', () => {
    const pairs: Array<[string, string]> = [
      ['raise_prices', 'discount_prices'],
      ['increase_marketing', 'cut_marketing'],
      ['improve_quality', 'reduce_quality'],
      ['layoffs', 'hire_staff'],
      ['delay_payments', 'pay_on_time'],
      ['compliance_investment', 'ignore_compliance'],
      ['customer_refund', 'deny_refund'],
      ['expand_branch', 'pause_expansion'],
      ['upgrade_tech', 'ignore_tech_debt'],
      ['employee_training', 'ignore_training'],
      ['strengthen_security', 'ignore_security'],
    ];
    for (const [a, b] of pairs) {
      expect(ALLOWED_TAGS, a).toContain(a);
      expect(ALLOWED_TAGS, b).toContain(b);
    }
  });
});

describe('filterValidTags', () => {
  it('keeps known tags and drops everything else', () => {
    expect(filterValidTags(['cut_costs', 'fly_to_mars', 'take_loan', ''])).toEqual([
      'cut_costs',
      'take_loan',
    ]);
  });

  it('preserves the order it was given', () => {
    expect(filterValidTags(['take_loan', 'cut_costs'])).toEqual(['take_loan', 'cut_costs']);
    expect(filterValidTags(['cut_costs', 'take_loan'])).toEqual(['cut_costs', 'take_loan']);
  });

  it('returns an empty list when nothing is recognised', () => {
    expect(filterValidTags(['nonsense', 'CUT_COSTS', 'cut costs'])).toEqual([]);
  });

  it('accepts every allowed tag', () => {
    expect(filterValidTags([...ALLOWED_TAGS])).toEqual([...ALLOWED_TAGS]);
  });

  it('handles an empty input', () => {
    expect(filterValidTags([])).toEqual([]);
  });
});

describe('extractTagsFromKeywords', () => {
  it('finds a strategy described in plain prose', () => {
    expect(extractTagsFromKeywords('We will raise prices by 10% next quarter')).toContain(
      'raise_prices'
    );
  });

  it('ignores letter case', () => {
    expect(extractTagsFromKeywords('WE MUST INCREASE PRICE IMMEDIATELY')).toContain('raise_prices');
  });

  it('picks up more than one strategy from a single sentence', () => {
    const tags = extractTagsFromKeywords('Announce layoffs and start aggressive cost cutting now');
    expect(tags).toContain('layoffs');
    expect(tags).toContain('cut_costs');
  });

  it('returns nothing when the text describes no known strategy', () => {
    expect(extractTagsFromKeywords('The weather in Alexandria is pleasant today')).toEqual([]);
  });

  it('returns nothing for empty text', () => {
    expect(extractTagsFromKeywords('')).toEqual([]);
  });

  it('only ever emits tags the rules engine understands', () => {
    const corpus = [
      'take a loan from the bank and hire more staff',
      'we should negotiate supplier terms and pay on time',
      'invest in compliance and strengthen security',
      'we will expand and upgrade tech across the company',
      'offer a refund to the customer and improve quality',
      'delay payment to the landlord while we pause expansion',
      'run an ad campaign and start employee training',
    ];
    for (const text of corpus) {
      const extracted = extractTagsFromKeywords(text);
      expect(extracted.length, text).toBeGreaterThan(0);
      expect(filterValidTags(extracted), text).toEqual(extracted);
    }
  });

  it('distinguishes a supplier renegotiation from a supplier swap', () => {
    expect(extractTagsFromKeywords('negotiate supplier discounts')).toContain(
      'negotiate_supplier'
    );
    expect(extractTagsFromKeywords('we will switch supplier this month')).toContain(
      'switch_supplier'
    );
    expect(extractTagsFromKeywords('we will switch supplier this month')).not.toContain(
      'negotiate_supplier'
    );
  });
});
