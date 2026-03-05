import { z } from 'zod';
import { ALLOWED_TAGS } from '../game/tags';

// ─── Shared ───────────────────────────────────────────────────────────────────

const tagSchema = z.string().refine(
  (v) => (ALLOWED_TAGS as readonly string[]).includes(v),
  { message: 'Invalid decision tag' }
);

const characterMessageSchema = z.object({
  from: z.enum(['CFO', 'HR', 'OPS', 'MARKETING', 'INVESTOR']),
  message: z.string().min(10),
});

const newsOrSocialSchema = z.object({
  type: z.enum(['news', 'social']),
  text: z.string().min(10),
});

const optionSchema = z.object({
  id: z.enum(['A', 'B', 'C', 'D']),
  text: z.string().min(10),
  risk: z.enum(['low', 'medium', 'high']),
  tags: z.array(tagSchema).min(1).max(5),
});

const turnSchema = z.object({
  turnNumber: z.number().int().min(1),
  title: z.string().min(5),
  narrative: z.string().min(80),
  characterMessages: z.array(characterMessageSchema).min(2).max(5),
  newsOrSocial: newsOrSocialSchema.nullable().optional(),
  options: z.array(optionSchema).length(4),
});

// ─── Schema: generate_initial_turn ───────────────────────────────────────────

export const InitialTurnSchema = z.object({
  companyProfile: z.object({
    name: z.string().min(2),
    industry: z.string(),
    size: z.string(),
    location: z.string(),
    startingSituation: z.string().min(30),
  }),
  competitor: z.object({
    name: z.string().min(2),
    strategy: z.enum(['price_war', 'premium_brand', 'fast_expansion', 'poach_talent']),
  }),
  turn: turnSchema,
});

export type InitialTurnResponse = z.infer<typeof InitialTurnSchema>;

// ─── Schema: generate_next_turn ──────────────────────────────────────────────

export const NextTurnSchema = z.object({
  turn: turnSchema,
  coach: z.object({
    feedback: z.string().min(30),
    whyItMatters: z.string().min(20),
  }),
});

export type NextTurnResponse = z.infer<typeof NextTurnSchema>;

// ─── Schema: suggest_tags (free-text) ────────────────────────────────────────

export const SuggestTagsSchema = z.object({
  tags: z.array(tagSchema).min(1).max(5),
  notes: z.string(),
});

export type SuggestTagsResponse = z.infer<typeof SuggestTagsSchema>;

// ─── Schema: final_report ────────────────────────────────────────────────────

export const FinalReportSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  skillScores: z.object({
    finance: z.number().int().min(0).max(100),
    leadership: z.number().int().min(0).max(100),
    risk: z.number().int().min(0).max(100),
    communication: z.number().int().min(0).max(100),
    ethics: z.number().int().min(0).max(100),
  }),
  endingType: z.enum(['growth_win', 'survival', 'takeover', 'bankruptcy', 'scandal']),
  strengths: z.array(z.string()).min(1).max(5),
  improvements: z.array(z.string()).min(1).max(5),
  learningPath: z.array(z.string()).min(1).max(6),
  summary: z.string().min(80),
});

export type FinalReportResponse = z.infer<typeof FinalReportSchema>;
