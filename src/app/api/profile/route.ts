import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';

import { guardFailed, requireUserId } from '@/lib/api/guards';
import { badRequest, ok, readJsonBody, unauthorized, validationFailed } from '@/lib/api/respond';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  DeleteAccountSchema,
  UpdateProfileSchema,
  type ProfilePayload,
} from '@/lib/profile';

/**
 * The caller's own account: read it, change it, or delete it.
 *
 * Everything here is scoped to the session's own user id, so there is no
 * resource to own-check beyond that — a caller cannot address anybody else's
 * account through this route at all.
 */

export async function GET() {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const user = await prisma.user.findUnique({
    where: { id: auth.value },
    select: {
      id: true,
      email: true,
      name: true,
      preferredIndustry: true,
      preferredDifficulty: true,
      preferredCompanySize: true,
      createdAt: true,
    },
  });

  if (!user) return unauthorized();

  const [simulations, completedRuns, achievements, templates] = await Promise.all([
    prisma.simulation.count({ where: { userId: user.id } }),
    prisma.simulation.count({ where: { userId: user.id, status: 'ended' } }),
    prisma.achievement.count({ where: { simulation: { userId: user.id } } }),
    prisma.scenarioTemplate.count({ where: { userId: user.id } }),
  ]);

  const payload: ProfilePayload = {
    id: user.id,
    email: user.email,
    name: user.name ?? '',
    preferredIndustry: user.preferredIndustry,
    preferredDifficulty: user.preferredDifficulty,
    preferredCompanySize: user.preferredCompanySize,
    createdAt: user.createdAt.toISOString(),
    stats: { simulations, completedRuns, achievements, templates },
  };

  return ok(payload);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const body = await readJsonBody(req);
  if (body === undefined) return badRequest('Expected a JSON body');

  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const { name, preferredIndustry, preferredDifficulty, preferredCompanySize } = parsed.data;

  const updated = await prisma.user.update({
    where: { id: auth.value },
    data: {
      // The column is nullable and the MVP writes null for "no name"; keep it.
      name: name === '' ? null : name,
      preferredIndustry,
      preferredDifficulty,
      preferredCompanySize,
    },
    select: {
      name: true,
      preferredIndustry: true,
      preferredDifficulty: true,
      preferredCompanySize: true,
    },
  });

  // The header reads the display name out of the session, so it has to move too.
  const session = await getSession();
  session.name = updated.name ?? undefined;
  await session.save();

  return ok({
    name: updated.name ?? '',
    preferredIndustry: updated.preferredIndustry,
    preferredDifficulty: updated.preferredDifficulty,
    preferredCompanySize: updated.preferredCompanySize,
  });
}

/**
 * DELETE /api/profile
 *
 * Destroys the account and, by the schema's cascades, every simulation, turn,
 * achievement, label and template that hangs off it. Asks for the password as
 * well as the session: a session can be an unattended browser.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const body = await readJsonBody(req);
  if (body === undefined) return badRequest('Expected a JSON body');

  const parsed = DeleteAccountSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const user = await prisma.user.findUnique({
    where: { id: auth.value },
    select: { id: true, passwordHash: true },
  });

  if (!user) return unauthorized();

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return badRequest('That password is not correct');

  await prisma.user.delete({ where: { id: user.id } });

  const session = await getSession();
  session.destroy();

  return ok({ deleted: true });
}
