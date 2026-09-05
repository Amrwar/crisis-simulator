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

export { DEFAULT_OPTIONS };
