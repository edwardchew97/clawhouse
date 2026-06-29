/**
 * Typed market-data fetchers, ported from the data-fetching layer in
 * `public/clawhouse-fomo-layout.js`. These do the HTTP + parsing only; the
 * results are handed to the legacy orchestration via the window bridge until the
 * state container itself moves into the store.
 */

import { normalizeDiscoveryAgent } from "./discovery";
import { legacySetChainState } from "./legacy-bridge";
import { errorMessage, normalizedAmount } from "./key-market-utils";
import { asNumber } from "./key-market-format";
import {
  backendApplies,
  keyMarketReadbackUnavailable,
  paperActivity,
  readAccessApplies,
  type SelectorContext,
} from "./key-market-selectors";
import { useKeyMarketStore } from "../store/key-market-store";
import type { DemoChainState, LegacyAgent, TradeSide } from "./key-market-types";

export const BACKEND_REFRESH_MS = 60_000;

/** Current selector context from the store (chain is mirrored from the legacy container). */
function currentContext(): SelectorContext {
  const s = useKeyMarketStore.getState();
  return { chain: s.chain, agents: s.agents, tradeSide: s.tradeSide, activeDiscoveryFilters: s.activeDiscoveryFilters };
}

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

// --- Key market read ------------------------------------------------------

let keyMarketRefreshId = 0;
const enc = encodeURIComponent;

export type KeyMarketRefreshArgs = {
  agent: LegacyAgent;
  tradeSide: TradeSide;
  keyAmount: string;
  accountId: string | null;
  reason: string;
};

/**
 * Read key-market state / quote / activity / max-buy for the selected agent and
 * write the result through the legacy chain-state container. Ported from the
 * legacy refreshKeyMarketRead; batches the result like the legacy (loading flags
 * first, then one combined apply) and guards against stale refreshes.
 */
export async function refreshKeyMarket(args: KeyMarketRefreshArgs): Promise<void> {
  const { agent, tradeSide, keyAmount, accountId, reason } = args;
  const refreshId = ++keyMarketRefreshId;

  if (keyMarketReadbackUnavailable(agent)) {
    legacySetChainState({
      state: null, quote: null, quoteSide: null, protection: null, maxBuy: null, maxBuyError: null,
      stateLoading: false, quoteLoading: false, activityLoading: false, maxBuyLoading: false,
      activity: { ok: true, agent_id: agent.id, count: 0, trades: [] }, activityError: null, error: null,
    });
    return;
  }

  const side: TradeSide = tradeSide === "sell" ? "sell" : "buy";
  const amount = normalizedAmount(keyAmount);
  const holderParam = accountId ? `&holderId=${enc(accountId)}` : "";
  const shouldRefreshMaxBuy = Boolean(accountId) && side === "buy" && reason !== "amount-change" && reason !== "side-change";

  legacySetChainState({ stateLoading: true, quoteLoading: true, activityLoading: true, maxBuyLoading: shouldRefreshMaxBuy });

  const statePromise = fetchJson<{ state: unknown }>(`/api/key-market/state?agentId=${enc(agent.id)}${holderParam}`)
    .then((d): DemoChainState => ({ state: d.state as Record<string, unknown>, stateLoading: false, error: null }))
    .catch((e): DemoChainState => ({ stateLoading: false, error: errorMessage(e, "Key market state read failed.") }));

  const quotePromise = fetchJson<{ quote: unknown; protection: unknown }>(`/api/key-market/quote?side=${side}&agentId=${enc(agent.id)}&amount=${enc(amount)}`)
    .then((d): DemoChainState => ({ quote: d.quote as Record<string, unknown>, quoteSide: side, protection: d.protection as Record<string, unknown>, quoteLoading: false, error: null }))
    .catch((e): DemoChainState => ({ quoteLoading: false, error: errorMessage(e, "Key market quote read failed.") }));

  const activityPromise = fetchJson(`/api/key-market/activity?agentId=${enc(agent.id)}&limit=7`)
    .then((d): DemoChainState => ({ activity: d as Record<string, unknown>, activityLoading: false, activityError: null }))
    .catch((e): DemoChainState => ({ activityLoading: false, activityError: errorMessage(e, "Key activity read failed.") }));

  const maxBuyPromise: Promise<DemoChainState> = shouldRefreshMaxBuy
    ? fetchJson(`/api/key-market/max-buy?agentId=${enc(agent.id)}&accountId=${enc(accountId || "")}`)
      .then((d): DemoChainState => ({ maxBuy: d as Record<string, unknown>, maxBuyLoading: false, maxBuyError: null }))
      .catch((e): DemoChainState => ({ maxBuyLoading: false, maxBuyError: errorMessage(e, "Max buy read failed.") }))
    : Promise.resolve<DemoChainState>({ maxBuyLoading: false });

  const [state, quote, activity, maxBuy] = await Promise.all([statePromise, quotePromise, activityPromise, maxBuyPromise]);
  if (refreshId !== keyMarketRefreshId) return;
  legacySetChainState({ ...state, ...quote, ...activity, ...maxBuy });
}

// --- Backend read ---------------------------------------------------------

let backendRefreshId = 0;

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});

/**
 * Read the backend board (+ hyperliquid mark prices for open positions) and write
 * it through the legacy chain container (which also caches it). Ported from the
 * legacy refreshBackendRead, including the read-access shortcut that avoids
 * clobbering wallet-gated paper activity with a public read. Returns whether the
 * caller should schedule the next poll.
 */
export async function refreshBackend(agent: LegacyAgent, reason: string): Promise<{ reschedule: boolean }> {
  const refreshId = ++backendRefreshId;
  const showLoading = reason !== "poll" || !backendApplies(currentContext(), agent);
  if (showLoading) legacySetChainState({ backendLoading: true });

  try {
    const backend = await fetchJson<Rec>(`/api/backend/board?boardId=${enc(String(agent.boardId || agent.id))}`);
    const positions = rec(backend.paperActivity).positions;
    const openPositions = Array.isArray(positions)
      ? positions.filter((p) => String(rec(p).status || "open").toLowerCase() === "open" && Math.abs(asNumber(rec(p).signed_size) ?? 0) > 0)
      : [];
    const coins = [...new Set(openPositions.map((p) => String(rec(p).coin || "").toUpperCase()).filter(Boolean))];
    const hyperliquidPrices = coins.length
      ? await fetchJson(`/api/backend/hyperliquid-prices?coins=${enc(coins.join(","))}`).catch((e) => ({ ok: false, error: errorMessage(e, "Price read failed.") }))
      : { ok: true, prices: [] };

    if (refreshId !== backendRefreshId) return { reschedule: false };
    const nextBackend = { ...backend, hyperliquidPrices } as Rec;
    const ctx = currentContext();
    const nextPaperOk = rec(nextBackend.paperActivity).ok;
    if (ctx.chain.accountId && readAccessApplies(ctx, agent) && paperActivity(ctx, agent) && !nextPaperOk) {
      legacySetChainState({ backendLoading: false });
      return { reschedule: true };
    }
    legacySetChainState({ backend: nextBackend, backendLoading: false });
  } catch (error) {
    if (refreshId !== backendRefreshId) return { reschedule: false };
    legacySetChainState({ backendLoading: false, backend: { ok: false, error: errorMessage(error, "Backend read failed.") } });
  }
  return { reschedule: true };
}
