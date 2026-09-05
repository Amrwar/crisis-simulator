import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_TEMPLATES,
  MAX_CURRENCY_MODIFIER,
  MAX_SCALE_MODIFIER,
  MODIFIABLE_METRICS,
  MetricModifiersSchema,
  TemplateSchema,
  applyTemplate,
  builtInTemplate,
  clampStartingMetrics,
  describeModifiers,
  isBuiltInKey,
  modifierLimitFor,
} from '@/lib/game/scenario-templates';
import { getStartingMetrics } from '@/lib/game/starting-metrics';

describe('BUILT_IN_TEMPLATES', () => {
  it('ships several presets', () => {
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it('gives each a unique key that marks it as built in', () => {
    const keys = BUILT_IN_TEMPLATES.map((t) => t.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every(isBuiltInKey)).toBe(true);
  });

  it('gives each a name, a description and an emoji', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      expect(template.name.length, template.key).toBeGreaterThan(2);
      expect(template.description.length, template.key).toBeGreaterThan(20);
      expect(template.emoji.length, template.key).toBeGreaterThan(0);
    }
  });

  it('defines each one with a setup the API would accept', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const parsed = TemplateSchema.safeParse(template);
      expect(parsed.success, `${template.key}: ${JSON.stringify(parsed)}`).toBe(true);
    }
  });

  it('finds one by key', () => {
    expect(builtInTemplate('builtin:cash-crunch')?.name).toBe('Cash Crunch');
  });

  it('returns nothing for a key it does not ship', () => {
    expect(builtInTemplate('builtin:nonexistent')).toBeNull();
    expect(builtInTemplate('some-cuid')).toBeNull();
  });

  it('does not mistake a stored template id for a built-in key', () => {
    expect(isBuiltInKey('clx123abc')).toBe(false);
  });
});

describe('applyTemplate', () => {
  it('leaves the base position alone when there are no modifiers', () => {
    expect(applyTemplate('Retail', 'Medium', 'Small', {})).toEqual(
      getStartingMetrics('Retail', 'Medium', 'Small')
    );
  });

  it('adds a modifier to the base position', () => {
    const base = getStartingMetrics('Retail', 'Medium', 'Small');
    const modified = applyTemplate('Retail', 'Medium', 'Small', { cash: -350_000 });

    expect(modified.cash).toBe(base.cash - 350_000);
  });

  it('applies several modifiers at once', () => {
    const base = getStartingMetrics('Restaurant', 'Medium', 'Small');
    const modified = applyTemplate('Restaurant', 'Medium', 'Small', {
      reputation: -30,
      churn: 20,
    });

    expect(modified.reputation).toBe(Math.max(20, base.reputation - 30));
    expect(modified.churn).toBe(Math.min(60, base.churn + 20));
  });

  it('leaves the metrics a template did not name unchanged', () => {
    const base = getStartingMetrics('SaaS', 'Hard', 'Medium');
    const modified = applyTemplate('SaaS', 'Hard', 'Medium', { cash: 100_000 });

    expect(modified.reputation).toBe(base.reputation);
    expect(modified.marketShare).toBe(base.marketShare);
  });

  it('re-clamps a modifier that would open outside the engine range', () => {
    const modified = applyTemplate('Retail', 'Medium', 'Small', { reputation: 500 });
    expect(modified.reputation).toBe(95);
  });

  it('re-clamps a modifier that would open below the engine floor', () => {
    const modified = applyTemplate('Retail', 'Medium', 'Small', { morale: -500 });
    expect(modified.morale).toBe(20);
  });

  it('never opens a run with no cash', () => {
    const modified = applyTemplate('Retail', 'Medium', 'Small', { cash: -5_000_000 });
    expect(modified.cash).toBe(50_000);
  });

  it('ignores a modifier for something that is not a startable metric', () => {
    const base = getStartingMetrics('Retail', 'Medium', 'Small');
    const modified = applyTemplate('Retail', 'Medium', 'Small', {
      notAMetric: 100,
    } as Record<string, number>);

    expect(modified).toEqual(base);
  });

  it('ignores a modifier that is not a real number', () => {
    const base = getStartingMetrics('Retail', 'Medium', 'Small');
    const modified = applyTemplate('Retail', 'Medium', 'Small', {
      cash: Number.NaN,
    } as Record<string, number>);

    expect(modified.cash).toBe(base.cash);
  });

  it('produces a position every built-in template can actually open', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const metrics = applyTemplate(
        template.industry,
        template.difficulty,
        template.companySize,
        template.metricModifiers
      );

      expect(metrics.cash, template.key).toBeGreaterThan(0);
      expect(metrics.reputation, template.key).toBeGreaterThanOrEqual(20);
      expect(metrics.reputation, template.key).toBeLessThanOrEqual(95);
      expect(metrics.churn, template.key).toBeLessThanOrEqual(60);
    }
  });
});

describe('clampStartingMetrics', () => {
  it('is a no-op on a position already inside the ranges', () => {
    const base = getStartingMetrics('Healthcare', 'Easy', 'Medium');
    expect(clampStartingMetrics(base)).toEqual(base);
  });

  it('pulls every out-of-range metric back inside', () => {
    const wild = { ...getStartingMetrics('Retail', 'Medium', 'Small'), legalRisk: 900, churn: -50 };
    const clamped = clampStartingMetrics(wild);

    expect(clamped.legalRisk).toBe(60);
    expect(clamped.churn).toBe(5);
  });
});

describe('MetricModifiersSchema', () => {
  it('accepts an empty set of modifiers', () => {
    expect(MetricModifiersSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a modifier on every startable metric', () => {
    for (const metric of MODIFIABLE_METRICS) {
      expect(MetricModifiersSchema.safeParse({ [metric]: 1 }).success, metric).toBe(true);
    }
  });

  it('rejects a metric that cannot be started with', () => {
    expect(MetricModifiersSchema.safeParse({ cheatMode: 1 }).success).toBe(false);
  });

  it('allows a currency metric to move much further than a scaled one', () => {
    expect(modifierLimitFor('cash')).toBe(MAX_CURRENCY_MODIFIER);
    expect(modifierLimitFor('reputation')).toBe(MAX_SCALE_MODIFIER);
  });

  it('rejects a modifier past its metric limit', () => {
    expect(MetricModifiersSchema.safeParse({ reputation: 500 }).success).toBe(false);
    expect(MetricModifiersSchema.safeParse({ cash: 90_000_000 }).success).toBe(false);
  });

  it('accepts a modifier exactly on the limit', () => {
    expect(MetricModifiersSchema.safeParse({ reputation: MAX_SCALE_MODIFIER }).success).toBe(true);
  });

  it('rejects a value that is not a number', () => {
    expect(MetricModifiersSchema.safeParse({ cash: 'lots' }).success).toBe(false);
  });
});

describe('TemplateSchema', () => {
  const valid = {
    name: 'Week 3',
    industry: 'Retail',
    difficulty: 'Medium',
    companySize: 'Small',
  };

  it('accepts a minimal template', () => {
    const parsed = TemplateSchema.safeParse(valid);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.description).toBe('');
      expect(parsed.data.metricModifiers).toEqual({});
    }
  });

  it('trims the name', () => {
    const parsed = TemplateSchema.safeParse({ ...valid, name: '  Week 3  ' });
    expect(parsed.success && parsed.data.name).toBe('Week 3');
  });

  it('rejects a name that is too short', () => {
    expect(TemplateSchema.safeParse({ ...valid, name: 'a' }).success).toBe(false);
  });

  it('rejects a name past the limit', () => {
    expect(TemplateSchema.safeParse({ ...valid, name: 'x'.repeat(200) }).success).toBe(false);
  });

  it('rejects a setup outside the supported vocabularies', () => {
    expect(TemplateSchema.safeParse({ ...valid, industry: 'Aerospace' }).success).toBe(false);
    expect(TemplateSchema.safeParse({ ...valid, difficulty: 'Nightmare' }).success).toBe(false);
    expect(TemplateSchema.safeParse({ ...valid, companySize: 'Huge' }).success).toBe(false);
  });
});

describe('describeModifiers', () => {
  it('says so when a template changes nothing', () => {
    expect(describeModifiers({})).toBe('Standard opening position');
  });

  it('abbreviates a currency modifier and signs it', () => {
    expect(describeModifiers({ cash: -350_000 })).toBe('cash -350K');
    expect(describeModifiers({ cash: 250_000 })).toBe('cash +250K');
  });

  it('leaves a scaled modifier unabbreviated', () => {
    expect(describeModifiers({ reputation: -30 })).toBe('reputation -30');
  });

  it('lists several modifiers in the canonical metric order', () => {
    expect(describeModifiers({ morale: 5, cash: 1_000 })).toBe('cash +1K, morale +5');
  });
});
