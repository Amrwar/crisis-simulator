import { z } from 'zod';

import { COMPANY_SIZES, DIFFICULTIES, INDUSTRIES } from '@/types';

/**
 * The account settings a player can change, and the rules around them.
 *
 * Kept out of the route so the validation is testable without a request, and
 * so the "empty string means no preference" convention is stated in one place
 * rather than assumed at each end.
 */

export const MIN_PASSWORD_LENGTH = 6;
export const MAX_DISPLAY_NAME_LENGTH = 60;

/**
 * A preference is either one of the supported values or the empty string,
 * which means "no preference" and lets the new-simulation form fall back to
 * its own default. `null` and `undefined` from a client are read the same way.
 */
const preference = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal('')])
    .nullish()
    .transform((value) => value ?? '');

export const UpdateProfileSchema = z.object({
  // A name is optional; sending an empty one clears it back to anonymous.
  name: z
    .string()
    .max(MAX_DISPLAY_NAME_LENGTH, `Display names are limited to ${MAX_DISPLAY_NAME_LENGTH} characters`)
    .nullish()
    .transform((value) => (value ?? '').trim()),
  preferredIndustry: preference(INDUSTRIES),
  preferredDifficulty: preference(DIFFICULTIES),
  preferredCompanySize: preference(COMPANY_SIZES),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/**
 * Changing a password requires the current one.
 *
 * The session alone is not enough: a session can be an unattended browser, and
 * a password change locks the real owner out. The confirmation field is
 * checked here rather than only in the form so the API cannot be used to set a
 * password the user mistyped.
 */
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Your current password is required'),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string().min(1, 'Please repeat the new password'),
  })
  .refine((body) => body.newPassword === body.confirmPassword, {
    message: 'The new passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((body) => body.newPassword !== body.currentPassword, {
    message: 'The new password must be different from the current one',
    path: ['newPassword'],
  });

/**
 * Deleting an account destroys every run with it, so it asks for the password
 * and for the word typed out. A misclick should not be able to do this.
 */
export const DELETE_CONFIRMATION = 'DELETE';

export const DeleteAccountSchema = z.object({
  password: z.string().min(1, 'Your password is required'),
  confirm: z.literal(DELETE_CONFIRMATION, {
    errorMap: () => ({ message: `Type ${DELETE_CONFIRMATION} to confirm` }),
  }),
});

/** The whole payload `GET /api/profile` answers with. */
export interface ProfilePayload {
  id: string;
  email: string;
  name: string;
  preferredIndustry: string;
  preferredDifficulty: string;
  preferredCompanySize: string;
  createdAt: string;
  /** Counts shown beside the delete button, so the cost is visible. */
  stats: { simulations: number; completedRuns: number; achievements: number; templates: number };
}

/** The preferences the new-simulation form reads, with its own fallbacks. */
export interface SimulationDefaults {
  industry: string;
  difficulty: string;
  companySize: string;
}

export const FORM_FALLBACKS: SimulationDefaults = {
  industry: 'Retail',
  difficulty: 'Medium',
  companySize: 'Small',
};

/** Resolves stored preferences into a complete set of form defaults. */
export function resolveDefaults(preferences: Partial<SimulationDefaults>): SimulationDefaults {
  return {
    industry: preferences.industry || FORM_FALLBACKS.industry,
    difficulty: preferences.difficulty || FORM_FALLBACKS.difficulty,
    companySize: preferences.companySize || FORM_FALLBACKS.companySize,
  };
}
