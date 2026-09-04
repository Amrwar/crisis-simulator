/**
 * A minimal, in-memory stand-in for the cookie store that `next/headers`
 * exposes inside a request. It implements exactly the surface iron-session
 * needs (`get` / `set`), so the real sealing and unsealing code runs during
 * tests — only the transport is faked.
 */

export interface StoredCookie {
  name: string;
  value: string;
}

export interface CookieJar {
  get(name: string): StoredCookie | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
  set(options: { name: string; value: string } & Record<string, unknown>): void;
  /** Test-only: the raw value currently held, ignoring iron-session semantics. */
  raw(name: string): string | undefined;
  clear(): void;
}

export function createCookieJar(): CookieJar {
  const store = new Map<string, string>();

  function set(
    nameOrOptions: string | ({ name: string; value: string } & Record<string, unknown>),
    value?: string
  ): void {
    if (typeof nameOrOptions === 'string') {
      store.set(nameOrOptions, value ?? '');
    } else {
      store.set(nameOrOptions.name, nameOrOptions.value);
    }
  }

  return {
    get(name) {
      const found = store.get(name);
      return found === undefined ? undefined : { name, value: found };
    },
    set: set as CookieJar['set'],
    raw(name) {
      return store.get(name);
    },
    clear() {
      store.clear();
    },
  };
}

let active: CookieJar = createCookieJar();

/** Returns the jar that the mocked `cookies()` should hand out right now. */
export function activeCookieJar(): CookieJar {
  return active;
}

/** Switches the ambient jar — the test equivalent of "this browser sent us". */
export function useCookieJar(jar: CookieJar = createCookieJar()): CookieJar {
  active = jar;
  return jar;
}
