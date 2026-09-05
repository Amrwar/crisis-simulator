import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { createCookieJar, useCookieJar, type CookieJar } from './cookie-jar';

/**
 * Empties every table, child rows first. The suite runs file-by-file against a
 * single SQLite file, so each test starts from a known-empty database.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.achievement.deleteMany();
  await prisma.runTag.deleteMany();
  await prisma.turn.deleteMany();
  await prisma.scenarioTemplate.deleteMany();
  await prisma.simulation.deleteMany();
  await prisma.user.deleteMany();
}

export interface SignedInUser {
  id: string;
  email: string;
  jar: CookieJar;
}

/** Creates a user row and a cookie jar already holding that user's session. */
export async function signIn(email: string, name?: string): Promise<SignedInUser> {
  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash('password123', 4), name: name ?? null },
  });

  const jar = useCookieJar(createCookieJar());
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name ?? undefined;
  await session.save();

  return { id: user.id, email: user.email, jar };
}

/** Drops any session, so the next request looks like an anonymous visitor. */
export function signOut(): void {
  useCookieJar(createCookieJar());
}

export interface SimulationSeed {
  cash?: number;
  monthlyRevenue?: number;
  burnRate?: number;
  reputation?: number;
  morale?: number;
  churn?: number;
  legalRisk?: number;
  marketShare?: number;
  supplierReliability?: number;
  employeeLoyalty?: number;
  demandVolatility?: number;
  competitorAggression?: number;
  competitorStrategy?: string;
  difficulty?: string;
  currentTurn?: number;
  maxTurns?: number;
  status?: string;
  flags?: Record<string, unknown>;
  seed?: number;
}

const DEFAULT_OPTIONS = [
  { id: 'A', text: 'Renegotiate the supplier contract', risk: 'low', tags: ['negotiate_supplier'] },
  { id: 'B', text: 'Take a bridging loan', risk: 'high', tags: ['take_loan'] },
  { id: 'C', text: 'Cut costs across the board', risk: 'medium', tags: ['cut_costs'] },
];

/**
 * Seeds a simulation together with the undecided turn the player is looking at,
 * which is the state every `POST /api/simulations/[id]/turn` request assumes.
 */
export async function seedSimulation(userId: string, overrides: SimulationSeed = {}) {
  const currentTurn = overrides.currentTurn ?? 1;
  const cash = overrides.cash ?? 1_000_000;

  const simulation = await prisma.simulation.create({
    data: {
      userId,
      industry: 'Retail',
      difficulty: overrides.difficulty ?? 'Medium',
      companySize: 'Small',
      companyName: 'Nile Home Goods',
      competitorName: 'Delta Living',
      competitorStrategy: overrides.competitorStrategy ?? 'price_war',
      competitorStrength: 50,
      cash,
      monthlyRevenue: overrides.monthlyRevenue ?? 300_000,
      burnRate: overrides.burnRate ?? 200_000,
      reputation: overrides.reputation ?? 60,
      morale: overrides.morale ?? 60,
      churn: overrides.churn ?? 20,
      legalRisk: overrides.legalRisk ?? 10,
      marketShare: overrides.marketShare ?? 20,
      supplierReliability: overrides.supplierReliability ?? 70,
      employeeLoyalty: overrides.employeeLoyalty ?? 70,
      demandVolatility: overrides.demandVolatility ?? 30,
      competitorAggression: overrides.competitorAggression ?? 40,
      flags: JSON.stringify(overrides.flags ?? {}),
      currentTurn,
      maxTurns: overrides.maxTurns ?? 10,
      status: overrides.status ?? 'active',
      seed: overrides.seed ?? 987_654,
    },
  });

  // Turns 1..currentTurn-1 are already decided; the current turn is not.
  for (let turnNumber = 1; turnNumber <= currentTurn; turnNumber++) {
    const decided = turnNumber < currentTurn;
    await prisma.turn.create({
      data: {
        simulationId: simulation.id,
        turnNumber,
        title: `Turn ${turnNumber}`,
        narrative: 'A crisis unfolds at the Cairo warehouse.',
        characterMessages: JSON.stringify([{ from: 'CFO', message: 'Cash is tight this month.' }]),
        newsOrSocial: JSON.stringify({ type: 'news', text: 'Import costs climb again.' }),
        options: JSON.stringify(DEFAULT_OPTIONS),
        optionId: decided ? 'A' : '',
        tags: JSON.stringify(decided ? ['negotiate_supplier'] : []),
        metricDeltas: JSON.stringify(decided ? { cash: -1000 } : {}),
        cashAfter: cash,
        revenueAfter: overrides.monthlyRevenue ?? 300_000,
        burnRateAfter: overrides.burnRate ?? 200_000,
        reputationAfter: overrides.reputation ?? 60,
        moraleAfter: overrides.morale ?? 60,
        churnAfter: overrides.churn ?? 20,
        legalRiskAfter: overrides.legalRisk ?? 10,
        marketShareAfter: overrides.marketShare ?? 20,
        decidedAt: decided ? new Date() : null,
      },
    });
  }

  return simulation;
}

export interface CompletedSeed extends SimulationSeed {
  industry?: string;
  companySize?: string;
  companyName?: string;
  endingType?: string;
  performanceScore?: number;
  /** Turns played out before the run ended. Defaults to a full ten. */
  turnsCompleted?: number;
  endedAt?: Date;
  notes?: string;
  /** Metric trajectory: one snapshot per completed turn. */
  trajectory?: Array<Partial<Record<'cash' | 'revenue' | 'reputation' | 'morale' | 'marketShare', number>>>;
  /** Decision tags per turn, so decision-shaped features have something to read. */
  decisionTags?: string[][];
}

/**
 * Seeds a run that has already finished: every turn decided, an ending, a
 * score and an `endedAt`. This is the shape the leaderboard, the analytics,
 * the comparison, the replay and the exporters all read.
 */
export async function seedCompletedSimulation(userId: string, overrides: CompletedSeed = {}) {
  const turnsCompleted = overrides.turnsCompleted ?? 10;
  const cash = overrides.cash ?? 1_000_000;
  const revenue = overrides.monthlyRevenue ?? 300_000;

  const simulation = await prisma.simulation.create({
    data: {
      userId,
      industry: overrides.industry ?? 'Retail',
      difficulty: overrides.difficulty ?? 'Medium',
      companySize: overrides.companySize ?? 'Small',
      companyName: overrides.companyName ?? 'Nile Home Goods',
      competitorName: 'Delta Living',
      competitorStrategy: overrides.competitorStrategy ?? 'price_war',
      competitorStrength: 50,
      cash,
      monthlyRevenue: revenue,
      burnRate: overrides.burnRate ?? 200_000,
      reputation: overrides.reputation ?? 60,
      morale: overrides.morale ?? 60,
      churn: overrides.churn ?? 20,
      legalRisk: overrides.legalRisk ?? 10,
      marketShare: overrides.marketShare ?? 20,
      supplierReliability: overrides.supplierReliability ?? 70,
      employeeLoyalty: overrides.employeeLoyalty ?? 70,
      demandVolatility: overrides.demandVolatility ?? 30,
      competitorAggression: overrides.competitorAggression ?? 40,
      flags: JSON.stringify(overrides.flags ?? {}),
      currentTurn: turnsCompleted,
      maxTurns: overrides.maxTurns ?? 10,
      status: 'ended',
      endingType: overrides.endingType ?? 'survival',
      performanceScore: overrides.performanceScore ?? 60,
      notes: overrides.notes ?? '',
      seed: overrides.seed ?? 987_654,
      endedAt: overrides.endedAt ?? new Date('2025-03-12T10:00:00.000Z'),
      finalReport: JSON.stringify({
        overallScore: overrides.performanceScore ?? 60,
        skillScores: { finance: 60, leadership: 62, risk: 55, communication: 64, ethics: 78 },
        endingType: overrides.endingType ?? 'survival',
        strengths: ['Kept the supply chain intact'],
        improvements: ['Act on the cost base earlier'],
        learningPath: ['Working capital management'],
        summary: 'The company came through ten difficult turns intact.',
      }),
    },
  });

  for (let turnNumber = 1; turnNumber <= turnsCompleted; turnNumber++) {
    const point = overrides.trajectory?.[turnNumber - 1] ?? {};
    const tags = overrides.decisionTags?.[turnNumber - 1] ?? ['negotiate_supplier'];

    await prisma.turn.create({
      data: {
        simulationId: simulation.id,
        turnNumber,
        title: `Turn ${turnNumber}`,
        narrative: 'A crisis unfolds at the Cairo warehouse.',
        characterMessages: JSON.stringify([{ from: 'CFO', message: 'Cash is tight this month.' }]),
        newsOrSocial: JSON.stringify({ type: 'news', text: 'Import costs climb again.' }),
        options: JSON.stringify(DEFAULT_OPTIONS),
        optionId: 'A',
        tags: JSON.stringify(tags),
        metricDeltas: JSON.stringify({ cash: -1000 }),
        cashAfter: point.cash ?? cash,
        revenueAfter: point.revenue ?? revenue,
        burnRateAfter: overrides.burnRate ?? 200_000,
        reputationAfter: point.reputation ?? overrides.reputation ?? 60,
        moraleAfter: point.morale ?? overrides.morale ?? 60,
        churnAfter: overrides.churn ?? 20,
        legalRiskAfter: overrides.legalRisk ?? 10,
        marketShareAfter: point.marketShare ?? overrides.marketShare ?? 20,
        coachFeedback: `Coach note for turn ${turnNumber}.`,
        coachWhyMatters: 'Continuity buys time; it does not fix the burn rate.',
        decidedAt: new Date(`2025-03-12T0${Math.min(9, turnNumber)}:00:00.000Z`),
      },
    });
  }

  return simulation;
}

export { DEFAULT_OPTIONS };
