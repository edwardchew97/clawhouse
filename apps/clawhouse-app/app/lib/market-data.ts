/**
 * Typed market-data fetchers, ported from the data-fetching layer in
 * `public/clawhouse-fomo-layout.js`. These do the HTTP + parsing only; the
 * results are handed to the legacy orchestration via the window bridge until the
 * state container itself moves into the store.
 */

import { normalizeDiscoveryAgent } from "./discovery";
import type { LegacyAgent } from "./key-market-types";

const inFlight = new Map<string, Promise<unknown>>();

/** Deduped JSON GET that mirrors the legacy fetchJson (ok:false => throw). */
export async function fetchJson<T = Record<string, unknown>>(path: string): Promise<T> {
  const existing = inFlight.get(path) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = (async () => {
    const response = await fetch(path, { cache: "no-store" });
    const data = await response.json() as T & { ok?: boolean; error?: string };
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return data;
  })();
  inFlight.set(path, promise);
  promise.finally(() => { if (inFlight.get(path) === promise) inFlight.delete(path); }).catch(() => undefined);
  return promise;
}

export type DiscoveryResult = { agents: LegacyAgent[]; data: Record<string, unknown> };

/** Fetch + normalize the discovery agent list. */
export async function fetchDiscovery(): Promise<DiscoveryResult> {
  const data = await fetchJson<{ agents?: unknown[] }>("/api/agents");
  const agents = Array.isArray(data.agents)
    ? data.agents.map((agent, index) => normalizeDiscoveryAgent(agent as Record<string, unknown>, index))
    : [];
  return { agents, data: data as Record<string, unknown> };
}
