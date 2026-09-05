import { z } from 'zod';

/**
 * The player's own annotations on a run: a note on the run, a note on a turn,
 * and short labels for grouping runs together.
 *
 * Labels need normalising before they are stored. `Practice`, `practice ` and
 * `PRACTICE` are one label as far as anybody filtering is concerned, and
 * storing all three would make the filter list useless and the uniqueness
 * constraint meaningless.
 */

export const MAX_NOTE_LENGTH = 2_000;
export const MAX_LABEL_LENGTH = 24;
export const MAX_LABELS_PER_RUN = 12;

/**
 * Canonical form of a label: lower-cased, inner whitespace collapsed to single
 * hyphens, and stripped of anything that is not a letter, digit or hyphen.
 */
export function normalizeLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LABEL_LENGTH);
}

/** True when a raw label survives normalisation with something left. */
export function isUsableLabel(raw: string): boolean {
  return normalizeLabel(raw) !== '';
}

/**
 * Normalises a list of labels, dropping empties and duplicates while keeping
 * the order they were given in.
 */
export function normalizeLabels(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const candidate of raw) {
    const label = normalizeLabel(candidate);
    if (label === '' || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= MAX_LABELS_PER_RUN) break;
  }

  return out;
}

/**
 * Notes are trimmed but otherwise kept as written: the newlines and the
 * punctuation are the player's.
 */
export function normalizeNote(raw: string): string {
  return raw.trim().slice(0, MAX_NOTE_LENGTH);
}

export const NoteSchema = z.object({
  note: z.string().max(MAX_NOTE_LENGTH, `Notes are limited to ${MAX_NOTE_LENGTH} characters`),
});

export const LabelSchema = z.object({
  label: z
    .string()
    .min(1, 'A label needs at least one character')
    .max(MAX_LABEL_LENGTH * 2, `Labels are limited to ${MAX_LABEL_LENGTH} characters`)
    .refine(isUsableLabel, 'A label needs at least one letter or digit'),
});
