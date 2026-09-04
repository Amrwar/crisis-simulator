import { NextRequest } from 'next/server';

/** Builds the JSON request an App Router handler receives, without a server. */
export function jsonRequest(url: string, body: unknown, method = 'POST'): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost').toString(), {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Builds a request with a body that is not valid JSON. */
export function rawRequest(url: string, body: string, method = 'POST'): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost').toString(), {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

/** Builds a bodyless request for GET handlers. */
export function getRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost').toString(), { method: 'GET' });
}

export async function readJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
