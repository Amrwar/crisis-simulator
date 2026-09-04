/**
 * The suite must never reach the network: no model provider is called, no API
 * key is required and no test can quietly start depending on a remote service.
 * Both provider SDKs the app can be configured with issue their requests
 * through the global `fetch`, so replacing it is enough to make an accidental
 * call fail loudly instead of silently succeeding on a developer machine that
 * happens to have credentials in its environment.
 */

export const NETWORK_BLOCKED_MESSAGE = 'network access is disabled in tests';

export function installNetworkGuard(): void {
  const blocked = async (input: unknown): Promise<never> => {
    const target =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : ((input as { url?: string } | null)?.url ?? String(input));
    throw new Error(`${NETWORK_BLOCKED_MESSAGE} (attempted request to ${target})`);
  };

  globalThis.fetch = blocked as unknown as typeof fetch;
}
