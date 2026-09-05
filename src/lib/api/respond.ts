import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

import type { ApiFailure, ApiSuccess } from '@/types';

/**
 * Constructors for the `{ success, data?, error? }` envelope.
 *
 * Routes never build a `NextResponse` by hand: going through these keeps the
 * status codes and the body shape in one place, so "unauthenticated" always
 * means 401 with the same wording no matter which route produced it.
 */

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true as const, data }, { status });
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return ok(data, 201);
}

export function fail(error: string, status: number, details?: unknown): NextResponse<ApiFailure> {
  const body: ApiFailure = details === undefined
    ? { success: false, error }
    : { success: false, error, details };
  return NextResponse.json(body, { status });
}

// ─── The standard refusals ───────────────────────────────────────────────────

/** No session cookie, or a session that no longer names a user. */
export function unauthorized(): NextResponse<ApiFailure> {
  return fail('Unauthorized', 401);
}

/** A real session, but the row belongs to somebody else. */
export function forbidden(): NextResponse<ApiFailure> {
  return fail('Forbidden', 403);
}

/** No such row, for anybody. */
export function notFound(what = 'Not found'): NextResponse<ApiFailure> {
  return fail(what, 404);
}

/** A request the caller could fix by sending different values. */
export function badRequest(error = 'Invalid input', details?: unknown): NextResponse<ApiFailure> {
  return fail(error, 400, details);
}

/** A well-formed request that conflicts with state already stored. */
export function conflict(error: string): NextResponse<ApiFailure> {
  return fail(error, 409);
}

/** Something broke on our side; the caller can only retry. */
export function serverError(error = 'Internal server error'): NextResponse<ApiFailure> {
  return fail(error, 500);
}

/**
 * Turns a zod failure into a 400 whose `details` carry the per-field messages,
 * matching the `details: parsed.error.flatten()` shape the MVP routes use.
 */
export function validationFailed(error: ZodError): NextResponse<ApiFailure> {
  return badRequest('Invalid input', error.flatten());
}

/**
 * Reads and parses a JSON body, distinguishing "no body / not JSON" from a
 * body that parsed but failed validation. Handlers get `undefined` for the
 * former and answer 400 rather than throwing a 500.
 */
export async function readJsonBody(req: Request): Promise<unknown | undefined> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
