import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sim = await prisma.simulation.findUnique({
    where: { id: params.id },
    include: {
      turns: { orderBy: { turnNumber: 'asc' } },
      achievements: true,
    },
  });

  if (!sim) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sim.userId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Parse JSON fields for convenience
  const turns = sim.turns.map((t) => ({
    ...t,
    characterMessagesParsed: JSON.parse(t.characterMessages),
    newsOrSocialParsed: t.newsOrSocial ? JSON.parse(t.newsOrSocial) : null,
    optionsParsed: JSON.parse(t.options),
    tagsParsed: JSON.parse(t.tags),
    metricDeltasParsed: JSON.parse(t.metricDeltas),
  }));

  const flags: Record<string, boolean> = JSON.parse(sim.flags);
  const finalReport = sim.finalReport ? JSON.parse(sim.finalReport) : null;

  return NextResponse.json({ ...sim, turns, flags, finalReport });
}
