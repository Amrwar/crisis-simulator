import { z } from 'zod';
import {
  InitialTurnSchema,
  NextTurnSchema,
  SuggestTagsSchema,
  FinalReportSchema,
  type InitialTurnResponse,
  type NextTurnResponse,
  type SuggestTagsResponse,
  type FinalReportResponse,
} from './schemas';
import { ALLOWED_TAGS } from '../game/tags';

// ─── LLM System Prompt ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Game Master for CrisisSim, a realistic business crisis simulation designed for Egyptian university students. Your role is to generate immersive, educational business scenarios set in Egypt and the MENA region.

CRITICAL RULES:
1. You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON.
2. Your response must strictly match the schema provided in the user message.
3. All content must be set in Egypt/MENA context: use EGP (Egyptian Pounds), reference Cairo/Alexandria/Egyptian cities, local business culture, Egyptian regulations (GAFI, CBE, etc.), social media platforms popular in Egypt (Facebook, TikTok), and realistic MENA supply chain challenges.
4. Make events feel realistic: mention Egyptian inflation, import costs, bureaucracy, local labor market, Ramadan seasonality, and Egyptian consumer behavior.
5. Character messages must feel personal, reference specific numbers from the game state, and have distinct personalities.
6. The narrative should be dramatic, stakes should feel real, and decisions should have clear tradeoffs.
7. Never mention specific real company names. Use fictional Egyptian/MENA company names.
8. All monetary values referenced in narrative should be in EGP.`;

// ─── Low-level LLM caller ────────────────────────────────────────────────────

async function rawLLMCall(userPrompt: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER || 'anthropic';

  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    });

    return response.choices[0]?.message?.content ?? '{}';
  }

  // Default: Anthropic
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const response = await client.messages.create({
    model,
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const block = response.content[0];
  if (block.type !== 'text') return '{}';
  return block.text;
}

/** Try to extract JSON from a string (handles markdown fences). */
function extractJSON(raw: string): unknown {
  // Strip markdown fences if present
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return JSON.parse(cleaned);
}

/** Call LLM and validate response against a Zod schema. Retries once on failure. */
async function callLLMWithSchema<T>(
  userPrompt: string,
  schema: z.ZodType<T>
): Promise<T> {
  // First attempt
  try {
    const raw = await rawLLMCall(userPrompt);
    const parsed = extractJSON(raw);
    const validated = schema.safeParse(parsed);
    if (validated.success) return validated.data;

    console.warn('[LLM] Schema validation failed (attempt 1):', validated.error.format());
  } catch (e) {
    console.warn('[LLM] Parse error (attempt 1):', e);
  }

  // Retry with correction prompt
  const correctionPrompt = `${userPrompt}

IMPORTANT: Your previous response did not match the required JSON schema.
Return ONLY valid JSON that exactly matches the schema.
No markdown, no explanations, just the JSON object.`;

  try {
    const raw2 = await rawLLMCall(correctionPrompt);
    const parsed2 = extractJSON(raw2);
    const validated2 = schema.safeParse(parsed2);
    if (validated2.success) return validated2.data;

    const err = validated2.error.format();
    console.error('[LLM] Schema validation failed (attempt 2):', err);
    throw new Error(`LLM response failed Zod validation after retry: ${JSON.stringify(err)}`);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Zod')) throw e;
    throw new Error(`LLM call failed after retry: ${e}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GenerateInitialTurnInput {
  industry: string;
  difficulty: string;
  companySize: string;
  metrics: {
    cash: number;
    monthlyRevenue: number;
    burnRate: number;
    reputation: number;
    morale: number;
    churn: number;
    legalRisk: number;
    marketShare: number;
  };
}

export async function generateInitialTurn(
  input: GenerateInitialTurnInput
): Promise<InitialTurnResponse> {
  const prompt = `Generate the opening scenario for a CrisisSim business simulation.

Company Setup:
- Industry: ${input.industry}
- Difficulty: ${input.difficulty}
- Company Size: ${input.companySize}
- Starting Cash: ${input.metrics.cash.toLocaleString()} EGP
- Monthly Revenue: ${input.metrics.monthlyRevenue.toLocaleString()} EGP
- Monthly Burn Rate: ${input.metrics.burnRate.toLocaleString()} EGP
- Reputation: ${input.metrics.reputation}/100
- Morale: ${input.metrics.morale}/100
- Customer Churn: ${input.metrics.churn}/100
- Legal Risk: ${input.metrics.legalRisk}/100
- Market Share: ${input.metrics.marketShare}/100

Allowed decision tags (use ONLY these in options.tags arrays): ${ALLOWED_TAGS.join(', ')}

Return this exact JSON structure:
{
  "companyProfile": {
    "name": "Egyptian ${input.industry} company name",
    "industry": "${input.industry}",
    "size": "${input.companySize}",
    "location": "Egyptian city",
    "startingSituation": "2-3 sentence description of the company's current situation and the crisis they face"
  },
  "competitor": {
    "name": "competitor company name (Egyptian/MENA style)",
    "strategy": "one of: price_war|premium_brand|fast_expansion|poach_talent"
  },
  "turn": {
    "turnNumber": 1,
    "title": "Crisis title (3-6 words)",
    "narrative": "6-10 sentences describing the opening crisis. Be specific about numbers, people, and Egyptian business context.",
    "characterMessages": [
      {"from": "CFO", "message": "1-3 sentences referencing specific financial numbers"},
      {"from": "HR", "message": "1-3 sentences about staff situation"},
      {"from": "OPS", "message": "1-3 sentences about operations"},
      {"from": "MARKETING", "message": "1-3 sentences about brand/market"},
      {"from": "INVESTOR", "message": "1-3 sentences with expectations/pressure"}
    ],
    "newsOrSocial": {"type": "news or social", "text": "realistic Egyptian news headline or social media post"},
    "options": [
      {"id": "A", "text": "Decisive option description", "risk": "low", "tags": ["tag1"]},
      {"id": "B", "text": "Decisive option description", "risk": "medium", "tags": ["tag2", "tag3"]},
      {"id": "C", "text": "Decisive option description", "risk": "high", "tags": ["tag4"]},
      {"id": "D", "text": "Decisive option description", "risk": "medium", "tags": ["tag5"]}
    ]
  }
}`;

  return callLLMWithSchema(prompt, InitialTurnSchema);
}

export interface GenerateNextTurnInput {
  turnNumber: number;
  companyName: string;
  industry: string;
  difficulty: string;
  metrics: {
    cash: number;
    monthlyRevenue: number;
    burnRate: number;
    reputation: number;
    morale: number;
    churn: number;
    legalRisk: number;
    marketShare: number;
  };
  competitor: { name: string; strategy: string; strength: number; action?: string };
  lastDecision: string;
  lastTags: string[];
  competitorAction: string;
  flags: string[];
  history: Array<{ turn: number; title: string; decision: string; coachNote: string }>;
}

export async function generateNextTurn(
  input: GenerateNextTurnInput
): Promise<NextTurnResponse> {
  const flagsDesc = input.flags.length > 0 ? input.flags.join(', ') : 'none';
  const historyText = input.history
    .slice(-3)
    .map((h) => `Turn ${h.turn}: "${h.title}" — Decision: ${h.decision}`)
    .join('\n');

  const prompt = `Generate the next turn (Turn ${input.turnNumber}) for CrisisSim.

Company: ${input.companyName} (${input.industry}, ${input.difficulty} difficulty)

CURRENT METRICS (after last turn):
- Cash: ${input.metrics.cash.toLocaleString()} EGP
- Monthly Revenue: ${input.metrics.monthlyRevenue.toLocaleString()} EGP
- Burn Rate: ${input.metrics.burnRate.toLocaleString()} EGP
- Net Monthly: ${(input.metrics.monthlyRevenue - input.metrics.burnRate).toLocaleString()} EGP
- Reputation: ${input.metrics.reputation}/100
- Employee Morale: ${input.metrics.morale}/100
- Customer Churn: ${input.metrics.churn}/100
- Legal Risk: ${input.metrics.legalRisk}/100
- Market Share: ${input.metrics.marketShare}/100

LAST DECISION (Turn ${input.turnNumber - 1}): ${input.lastDecision}
DECISION TAGS APPLIED: ${input.lastTags.join(', ')}
ACTIVE FLAGS: ${flagsDesc}

COMPETITOR (${input.competitor.name}): ${input.competitor.action ?? input.competitorAction}
TURN HISTORY:
${historyText}

Allowed decision tags (ONLY use these in options.tags): ${ALLOWED_TAGS.join(', ')}

Generate a new crisis/event that:
1. References consequences of the last decision
2. Reflects the current metric levels (e.g., if morale is low, mention it)
3. Is influenced by the competitor's action
4. Creates meaningful new pressure and tradeoffs
5. Includes coach feedback on the LAST decision

Return this exact JSON:
{
  "turn": {
    "turnNumber": ${input.turnNumber},
    "title": "Event title (3-6 words)",
    "narrative": "6-10 sentences. Reference past decisions and current numbers.",
    "characterMessages": [
      {"from": "CFO", "message": "specific financial concern"},
      {"from": "HR", "message": "morale/staffing update"},
      {"from": "OPS", "message": "operations concern"},
      {"from": "MARKETING", "message": "brand/market update"},
      {"from": "INVESTOR", "message": "pressure/expectation"}
    ],
    "newsOrSocial": {"type": "news or social", "text": "Egyptian news or social media reaction"},
    "options": [
      {"id": "A", "text": "option A", "risk": "low", "tags": ["tag"]},
      {"id": "B", "text": "option B", "risk": "medium", "tags": ["tag1", "tag2"]},
      {"id": "C", "text": "option C", "risk": "high", "tags": ["tag"]},
      {"id": "D", "text": "option D", "risk": "medium", "tags": ["tag"]}
    ]
  },
  "coach": {
    "feedback": "2-4 sentences analyzing the LAST decision (${input.lastDecision}), its tags (${input.lastTags.join(', ')}), and the tradeoffs made.",
    "whyItMatters": "1-2 sentences on the business lesson."
  }
}`;

  return callLLMWithSchema(prompt, NextTurnSchema);
}

export interface SuggestTagsInput {
  freeText: string;
}

export async function suggestTags(input: SuggestTagsInput): Promise<SuggestTagsResponse> {
  const prompt = `A student submitted this business decision: "${input.freeText}"

Identify which business strategy tags best describe this decision.
ONLY use tags from this list: ${ALLOWED_TAGS.join(', ')}

Return JSON:
{
  "tags": ["tag1", "tag2"],
  "notes": "brief justification"
}`;

  return callLLMWithSchema(prompt, SuggestTagsSchema);
}

export interface GenerateFinalReportInput {
  companyName: string;
  industry: string;
  difficulty: string;
  companySize: string;
  endingType: string;
  finalMetrics: {
    cash: number;
    monthlyRevenue: number;
    burnRate: number;
    reputation: number;
    morale: number;
    churn: number;
    legalRisk: number;
    marketShare: number;
  };
  startingCash: number;
  turnsCompleted: number;
  flags: string[];
  decisionHistory: Array<{ turn: number; decision: string; tags: string[] }>;
  performanceScore: number;
}

export async function generateFinalReport(
  input: GenerateFinalReportInput
): Promise<FinalReportResponse> {
  const decisionsText = input.decisionHistory
    .map((d) => `Turn ${d.turn}: ${d.decision} [${d.tags.join(', ')}]`)
    .join('\n');

  const prompt = `Generate the final performance report for a CrisisSim session.

Company: ${input.companyName} (${input.industry}, ${input.companySize}, ${input.difficulty})
Ending: ${input.endingType}
Turns Completed: ${input.turnsCompleted}/10
Performance Score: ${input.performanceScore}/100
Active Flags: ${input.flags.join(', ') || 'none'}

STARTING CASH: ${input.startingCash.toLocaleString()} EGP

FINAL METRICS:
- Cash: ${input.finalMetrics.cash.toLocaleString()} EGP (${Math.round((input.finalMetrics.cash / input.startingCash) * 100)}% of start)
- Revenue: ${input.finalMetrics.monthlyRevenue.toLocaleString()} EGP/month
- Burn Rate: ${input.finalMetrics.burnRate.toLocaleString()} EGP/month
- Reputation: ${input.finalMetrics.reputation}/100
- Morale: ${input.finalMetrics.morale}/100
- Churn: ${input.finalMetrics.churn}/100
- Legal Risk: ${input.finalMetrics.legalRisk}/100
- Market Share: ${input.finalMetrics.marketShare}/100

DECISION HISTORY:
${decisionsText}

Provide an honest, educational assessment. Be specific about what worked and what didn't.

Return this exact JSON:
{
  "overallScore": ${input.performanceScore},
  "skillScores": {
    "finance": 0-100,
    "leadership": 0-100,
    "risk": 0-100,
    "communication": 0-100,
    "ethics": 0-100
  },
  "endingType": "${input.endingType}",
  "strengths": ["up to 5 specific strengths demonstrated"],
  "improvements": ["up to 5 specific areas for improvement"],
  "learningPath": ["up to 6 recommended learning steps/resources"],
  "summary": "4-6 sentences summarizing the student's performance, key decisions, and main lesson."
}`;

  return callLLMWithSchema(prompt, FinalReportSchema);
}
