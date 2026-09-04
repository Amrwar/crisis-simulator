import { describe, expect, it } from 'vitest';

import {
  FinalReportSchema,
  InitialTurnSchema,
  NextTurnSchema,
  SuggestTagsSchema,
} from '@/lib/llm/schemas';
import { initialTurnFixture, nextTurnFixture, finalReportFixture } from '../helpers/fixtures';

describe('InitialTurnSchema', () => {
  it('accepts a well-formed opening scenario', () => {
    expect(InitialTurnSchema.safeParse(initialTurnFixture()).success).toBe(true);
  });

  it('rejects a decision tag the rules engine does not know', () => {
    const payload = initialTurnFixture();
    payload.turn.options[0].tags = ['sell_the_building'];
    const result = InitialTurnSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('Invalid decision tag');
    }
  });

  it('requires exactly four options', () => {
    const three = initialTurnFixture();
    three.turn.options = three.turn.options.slice(0, 3);
    expect(InitialTurnSchema.safeParse(three).success).toBe(false);

    const five = initialTurnFixture();
    five.turn.options = [...five.turn.options, { ...five.turn.options[0] }];
    expect(InitialTurnSchema.safeParse(five).success).toBe(false);
  });

  it('rejects option ids outside A to D', () => {
    const payload = initialTurnFixture();
    (payload.turn.options[0] as { id: string }).id = 'E';
    expect(InitialTurnSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a risk level outside low, medium and high', () => {
    const payload = initialTurnFixture();
    (payload.turn.options[1] as { risk: string }).risk = 'extreme';
    expect(InitialTurnSchema.safeParse(payload).success).toBe(false);
  });

  it('requires an option to carry between one and five tags', () => {
    const none = initialTurnFixture();
    none.turn.options[0].tags = [];
    expect(InitialTurnSchema.safeParse(none).success).toBe(false);

    const tooMany = initialTurnFixture();
    tooMany.turn.options[0].tags = [
      'cut_costs',
      'take_loan',
      'layoffs',
      'hire_staff',
      'raise_prices',
      'discount_prices',
    ];
    expect(InitialTurnSchema.safeParse(tooMany).success).toBe(false);
  });

  it('rejects a narrative that is too short to set a scene', () => {
    const payload = initialTurnFixture();
    payload.turn.narrative = 'Something happened.';
    expect(InitialTurnSchema.safeParse(payload).success).toBe(false);
  });

  it('requires at least two character messages', () => {
    const payload = initialTurnFixture();
    payload.turn.characterMessages = payload.turn.characterMessages.slice(0, 1);
    expect(InitialTurnSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a speaker outside the known cast', () => {
    const payload = initialTurnFixture();
    (payload.turn.characterMessages[0] as { from: string }).from = 'INTERN';
    expect(InitialTurnSchema.safeParse(payload).success).toBe(false);
  });

  it('treats the news item as optional and nullable', () => {
    const nulled = initialTurnFixture();
    nulled.turn.newsOrSocial = null;
    expect(InitialTurnSchema.safeParse(nulled).success).toBe(true);

    const omitted = initialTurnFixture();
    delete (omitted.turn as { newsOrSocial?: unknown }).newsOrSocial;
    expect(InitialTurnSchema.safeParse(omitted).success).toBe(true);
  });

  it('rejects an unknown competitor strategy', () => {
    const payload = initialTurnFixture();
    (payload.competitor as { strategy: string }).strategy = 'lobby_the_government';
    expect(InitialTurnSchema.safeParse(payload).success).toBe(false);
  });

  it('requires a company profile with a real starting situation', () => {
    const payload = initialTurnFixture();
    payload.companyProfile.startingSituation = 'A shop.';
    expect(InitialTurnSchema.safeParse(payload).success).toBe(false);
  });
});

describe('NextTurnSchema', () => {
  it('accepts a well-formed follow-up turn', () => {
    expect(NextTurnSchema.safeParse(nextTurnFixture()).success).toBe(true);
  });

  it('requires coaching feedback of substance', () => {
    const payload = nextTurnFixture();
    payload.coach.feedback = 'Good call.';
    expect(NextTurnSchema.safeParse(payload).success).toBe(false);
  });

  it('requires the lesson behind the feedback', () => {
    const payload = nextTurnFixture();
    payload.coach.whyItMatters = 'Money.';
    expect(NextTurnSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a turn number below one', () => {
    const payload = nextTurnFixture();
    payload.turn.turnNumber = 0;
    expect(NextTurnSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a fractional turn number', () => {
    const payload = nextTurnFixture();
    payload.turn.turnNumber = 2.5;
    expect(NextTurnSchema.safeParse(payload).success).toBe(false);
  });
});

describe('SuggestTagsSchema', () => {
  it('accepts one to five known tags', () => {
    expect(SuggestTagsSchema.safeParse({ tags: ['cut_costs'], notes: '' }).success).toBe(true);
    expect(
      SuggestTagsSchema.safeParse({
        tags: ['cut_costs', 'take_loan', 'layoffs', 'hire_staff', 'raise_prices'],
        notes: 'five is the limit',
      }).success
    ).toBe(true);
  });

  it('rejects an empty tag list', () => {
    expect(SuggestTagsSchema.safeParse({ tags: [], notes: '' }).success).toBe(false);
  });

  it('rejects more than five tags', () => {
    expect(
      SuggestTagsSchema.safeParse({
        tags: ['cut_costs', 'take_loan', 'layoffs', 'hire_staff', 'raise_prices', 'discount_prices'],
        notes: '',
      }).success
    ).toBe(false);
  });

  it('rejects an invented tag', () => {
    expect(SuggestTagsSchema.safeParse({ tags: ['sell_everything'], notes: '' }).success).toBe(false);
  });

  it('requires the notes field to be present', () => {
    expect(SuggestTagsSchema.safeParse({ tags: ['cut_costs'] }).success).toBe(false);
  });
});

describe('FinalReportSchema', () => {
  it('accepts a well-formed report', () => {
    expect(FinalReportSchema.safeParse(finalReportFixture()).success).toBe(true);
  });

  it('keeps the overall score inside 0..100', () => {
    for (const overallScore of [-1, 101]) {
      expect(FinalReportSchema.safeParse({ ...finalReportFixture(), overallScore }).success).toBe(
        false
      );
    }
    for (const overallScore of [0, 100]) {
      expect(FinalReportSchema.safeParse({ ...finalReportFixture(), overallScore }).success).toBe(
        true
      );
    }
  });

  it('requires whole-number scores', () => {
    expect(FinalReportSchema.safeParse({ ...finalReportFixture(), overallScore: 72.5 }).success).toBe(
      false
    );
  });

  it('requires every skill dimension', () => {
    const payload = finalReportFixture();
    delete (payload.skillScores as { ethics?: number }).ethics;
    expect(FinalReportSchema.safeParse(payload).success).toBe(false);
  });

  it('keeps skill scores inside 0..100', () => {
    const payload = finalReportFixture();
    payload.skillScores.finance = 140;
    expect(FinalReportSchema.safeParse(payload).success).toBe(false);
  });

  it('only allows the five endings the engine can produce', () => {
    for (const endingType of ['growth_win', 'survival', 'takeover', 'bankruptcy', 'scandal'] as const) {
      expect(
        FinalReportSchema.safeParse({ ...finalReportFixture(), endingType }).success,
        endingType
      ).toBe(true);
    }
    expect(
      FinalReportSchema.safeParse({ ...finalReportFixture(), endingType: 'acquisition' }).success
    ).toBe(false);
  });

  it('requires at least one strength, improvement and learning step', () => {
    for (const field of ['strengths', 'improvements', 'learningPath'] as const) {
      expect(FinalReportSchema.safeParse({ ...finalReportFixture(), [field]: [] }).success, field).toBe(
        false
      );
    }
  });

  it('rejects a summary too short to be useful', () => {
    expect(FinalReportSchema.safeParse({ ...finalReportFixture(), summary: 'You lost.' }).success).toBe(
      false
    );
  });
});
