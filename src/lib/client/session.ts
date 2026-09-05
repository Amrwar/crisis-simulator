/**
 * Reading the signed-in identity from the browser.
 *
 * `/api/auth/me` predates the response envelope and answers with a bare
 * `{ userId, email, name }`, so it cannot go through `apiGet`. Rather than
 * rewrite a route four pages already depend on, this adapts the old shape once
 * and every caller gets the same type back.
 */

export interface CurrentUser {
  userId: string;
  email: string;
  name: string | null;
}

/** Returns the signed-in user, or null when nobody is signed in. */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<CurrentUser | null> {
  let response: Response;

  try {
    response = await fetch('/api/auth/me', { signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    return null;
  }

  if (!response.ok) return null;

  try {
    const body = (await response.json()) as Partial<CurrentUser>;
    if (typeof body.userId !== 'string' || typeof body.email !== 'string') return null;

    return { userId: body.userId, email: body.email, name: body.name ?? null };
  } catch {
    return null;
  }
}

/** Ends the session and returns once the cookie has been cleared. */
export async function signOutRequest(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // The cookie is httpOnly, so there is nothing useful to do client-side if
    // the request never lands; the caller navigates away regardless.
  }
}
