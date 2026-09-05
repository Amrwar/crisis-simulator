import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';

import { guardFailed, requireUserId } from '@/lib/api/guards';
import { badRequest, ok, readJsonBody, unauthorized, validationFailed } from '@/lib/api/respond';
import { prisma } from '@/lib/db';
import { ChangePasswordSchema } from '@/lib/profile';

/**
 * POST /api/profile/password
 *
 * Changes the caller's password. The current one is required as well as the
 * session: a session can be an unattended browser, and a password change is
 * what locks the real owner out.
 *
 * The hash uses the same cost factor the register route does, so a password
 * changed here is no cheaper to attack than one set at sign-up.
 */

const BCRYPT_COST = 12;

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const body = await readJsonBody(req);
  if (body === undefined) return badRequest('Expected a JSON body');

  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const user = await prisma.user.findUnique({
    where: { id: auth.value },
    select: { id: true, passwordHash: true },
  });

  if (!user) return unauthorized();

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return badRequest('That password is not correct');

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST) },
  });

  // The session is deliberately left intact: the person who just proved they
  // know the old password is the owner, and signing them out here would only
  // make them sign back in with the password they have just set.
  return ok({ changed: true });
}
