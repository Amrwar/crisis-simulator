import type { ApiResponse } from '@/types';

/**
 * The browser side of the response envelope.
 *
 * Pages call `apiGet` / `apiSend` and get back either the payload or a message
 * they can show, without every component re-implementing the same three-way
 * branch over `response.ok`, the envelope and a network failure.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** True when the caller should be sent to the sign-in page. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  let body: ApiResponse<T> | null = null;

  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    // A body that is not JSON at all — a proxy error page, say.
    throw new ApiError(`Request failed (${response.status})`, response.status);
  }

  if (body && body.success === true) return body.data;

  const message = body && body.success === false ? body.error : `Request failed (${response.status})`;
  const details = body && body.success === false ? body.details : undefined;
  throw new ApiError(message, response.status, details);
}

/** GETs an enveloped endpoint and returns its payload. */
export async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, { signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('Could not reach the server', 0);
  }

  return unwrap<T>(response);
}

/** Sends a JSON body to an enveloped endpoint and returns its payload. */
export async function apiSend<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('Could not reach the server', 0);
  }

  return unwrap<T>(response);
}

/** The message to put in front of a user for any thrown value. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message !== '') return error.message;
  return 'Something went wrong';
}

/**
 * Builds a query string from values that may be absent.
 *
 * Empty strings, null and undefined are dropped rather than sent as blanks,
 * so a cleared filter disappears from the URL instead of becoming `?x=`.
 */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const text = String(value);
    if (text === '') continue;
    search.set(key, text);
  }

  const query = search.toString();
  return query === '' ? '' : `?${query}`;
}
