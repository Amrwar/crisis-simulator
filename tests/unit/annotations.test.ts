import { describe, expect, it } from 'vitest';

import {
  LabelSchema,
  MAX_LABELS_PER_RUN,
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  NoteSchema,
  isUsableLabel,
  normalizeLabel,
  normalizeLabels,
  normalizeNote,
} from '@/lib/annotations';

describe('normalizeLabel', () => {
  it('lower-cases', () => {
    expect(normalizeLabel('Practice')).toBe('practice');
    expect(normalizeLabel('PRACTICE')).toBe('practice');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLabel('  practice  ')).toBe('practice');
  });

  it('turns inner whitespace into single hyphens', () => {
    expect(normalizeLabel('for class')).toBe('for-class');
    expect(normalizeLabel('for   class')).toBe('for-class');
  });

  it('collapses runs of hyphens', () => {
    expect(normalizeLabel('a---b')).toBe('a-b');
  });

  it('strips leading and trailing hyphens', () => {
    expect(normalizeLabel('-practice-')).toBe('practice');
  });

  it('drops punctuation and symbols', () => {
    expect(normalizeLabel('risky!@#strategy')).toBe('riskystrategy');
  });

  it('keeps digits', () => {
    expect(normalizeLabel('attempt 2')).toBe('attempt-2');
  });

  it('maps every casing of one label to the same value', () => {
    const forms = ['Practice', 'practice ', ' PRACTICE', 'pRaCtIcE'];
    expect(new Set(forms.map(normalizeLabel)).size).toBe(1);
  });

  it('caps the length', () => {
    expect(normalizeLabel('x'.repeat(200))).toHaveLength(MAX_LABEL_LENGTH);
  });

  it('produces nothing from a label with nothing usable in it', () => {
    expect(normalizeLabel('!!!')).toBe('');
    expect(normalizeLabel('   ')).toBe('');
    expect(normalizeLabel('')).toBe('');
  });
});

describe('isUsableLabel', () => {
  it('accepts a label with a letter or a digit', () => {
    expect(isUsableLabel('practice')).toBe(true);
    expect(isUsableLabel('2')).toBe(true);
  });

  it('rejects a label that normalises away to nothing', () => {
    expect(isUsableLabel('---')).toBe(false);
    expect(isUsableLabel('  ')).toBe(false);
  });
});

describe('normalizeLabels', () => {
  it('normalises each label', () => {
    expect(normalizeLabels(['Practice', 'For Class'])).toEqual(['practice', 'for-class']);
  });

  it('drops duplicates that differ only in form', () => {
    expect(normalizeLabels(['practice', 'Practice', ' PRACTICE '])).toEqual(['practice']);
  });

  it('keeps the order they were given in', () => {
    expect(normalizeLabels(['zebra', 'apple'])).toEqual(['zebra', 'apple']);
  });

  it('drops labels that normalise away', () => {
    expect(normalizeLabels(['practice', '!!!', ''])).toEqual(['practice']);
  });

  it('stops at the per-run limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => `label-${i}`);
    expect(normalizeLabels(many)).toHaveLength(MAX_LABELS_PER_RUN);
  });

  it('returns nothing for an empty list', () => {
    expect(normalizeLabels([])).toEqual([]);
  });
});

describe('normalizeNote', () => {
  it('trims the note', () => {
    expect(normalizeNote('  wrote this  ')).toBe('wrote this');
  });

  it('keeps the newlines and punctuation the player wrote', () => {
    expect(normalizeNote('First line.\nSecond, line!')).toBe('First line.\nSecond, line!');
  });

  it('caps the length', () => {
    expect(normalizeNote('x'.repeat(5_000))).toHaveLength(MAX_NOTE_LENGTH);
  });

  it('turns a whitespace-only note into an empty one, which clears it', () => {
    expect(normalizeNote('   \n  ')).toBe('');
  });
});

describe('NoteSchema', () => {
  it('accepts an ordinary note', () => {
    expect(NoteSchema.safeParse({ note: 'Cut earlier next time' }).success).toBe(true);
  });

  it('accepts an empty note, which is how a note is cleared', () => {
    expect(NoteSchema.safeParse({ note: '' }).success).toBe(true);
  });

  it('rejects a note past the limit', () => {
    expect(NoteSchema.safeParse({ note: 'x'.repeat(MAX_NOTE_LENGTH + 1) }).success).toBe(false);
  });

  it('rejects a body with no note at all', () => {
    expect(NoteSchema.safeParse({}).success).toBe(false);
    expect(NoteSchema.safeParse({ note: 42 }).success).toBe(false);
  });
});

describe('LabelSchema', () => {
  it('accepts a label that normalises to something', () => {
    expect(LabelSchema.safeParse({ label: 'For Class' }).success).toBe(true);
  });

  it('rejects an empty label', () => {
    expect(LabelSchema.safeParse({ label: '' }).success).toBe(false);
  });

  it('rejects a label made entirely of characters that are stripped', () => {
    expect(LabelSchema.safeParse({ label: '!!!' }).success).toBe(false);
  });

  it('rejects a label far past the limit rather than silently truncating', () => {
    expect(LabelSchema.safeParse({ label: 'x'.repeat(200) }).success).toBe(false);
  });
});
