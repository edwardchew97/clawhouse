import { create } from "zustand";
import type { DemoChainState, LegacyAgent, ToastOptions, TradeSide } from "../lib/key-market-types";

/** A toast currently requested for display. `id` re-triggers the timer on repeat messages. */
export type ToastMessage = ToastOptions & { id: number; message: string };

/**
 * Canonical client state for the key-market UI.
 *
 * This is the Phase 2 target: the React panels read from here instead of the
 * module-level `let`s in `public/clawhouse-fomo-layout.js`, and the wallet bridge
 * writes here instead of pushing through `window.ClawHouseDemo.setChainState`.
 *
 * The slices mirror the legacy globals one-to-one so the port is a mechanical
 * move with no behavior change:
 *   - chain slice  <- the legacy `chainState` object + `setChainState`/`clearQuote`
 *   - ui slice     <- `selectedId`, `tradeSide`, `activeChartRange`,
 *                     `activeAgentTab`, `activeEventId`, `activeDiscoveryFilters`
 *
 * Not yet wired into the live render path — that move happens panel-by-panel in
 * Phase 2. Kept inert so this foundation lands without changing runtime behavior.
 */

export type ChartRange = "1h" | "24h" | "7d" | "all";
export type AgentTab = "chatroom" | "keyholders" | "positions";

export const initialChainState: DemoChainState = {
  accountId: null,
  contractId: undefined,
  networkId: undefined,
  pending: false,
  phase: "idle",
  lastTxHash: null,
  explorerUrl: null,
  state: null,
  quote: null,
  quoteSide: null,
  protection: null,
  maxBuy: null,
  maxBuyError: null,
  stateLoading: false,
  quoteLoading: false,
  maxBuyLoading: false,
  activityLoading: false,
  activity: null,
  activityError: null,
  backend: null,
  backendLoading: false,
  readAccess: null,
  readAccessLoading: false,
  readAccessError: null,
  error: null,
};

/**
 * Merge a partial chain-state update the same way the legacy `setChainState`
 * does: when a data field arrives, its matching `*Loading` flag is forced false
 * even if the caller did not set it. This implicit clearing is load-bearing UI
 * logic and must stay byte-for-byte identical to the legacy behavior.
 */
export function mergeChainState(current: DemoChainState, next: DemoChainState): DemoChainState {
  const loadingClears: DemoChainState = {};
  const has = (key: keyof DemoChainState) => Object.prototype.hasOwnProperty.call(next, key);
  if (has("state")) loadingClears.stateLoading = false;
  if (has("quote")) loadingClears.quoteLoading = false;
  if (has("maxBuy")) loadingClears.maxBuyLoading = false;
  if (has("activity")) loadingClears.activityLoading = false;
  if (has("backend")) loadingClears.backendLoading = false;
  if (has("readAccess") || has("readAccessError")) loadingClears.readAccessLoading = false;
  return { ...current, ...loadingClears, ...next };
}

/** The slice of state the legacy script mirrors into the store each render. */
export type LegacySnapshot = {
  chain: DemoChainState;
  agents: LegacyAgent[];
  selectedId: string;
  tradeSide: TradeSide;
  activeChartRange: ChartRange;
  activeAgentTab: AgentTab;
  activeEventId: string | null;
  discoveryLoading: boolean;
  activeDiscoveryFilters: Set<string>;
};

export type KeyMarketState = LegacySnapshot & {
  toast: ToastMessage | null;

  /**
   * TRANSITIONAL (Phase 2): wholesale-replace the read replica from the legacy
   * script. While the legacy globals still own state, the store is a downstream
   * mirror, so this replaces rather than merges. Replaced by React-owned state in
   * Phase 3, after which the granular actions below are the only writers.
   */
  hydrate: (snapshot: Partial<LegacySnapshot>) => void;

  setChainState: (next: DemoChainState) => void;
  clearQuote: () => void;
  showToast: (message: string, options?: ToastOptions) => void;
  setSelectedId: (id: string) => void;
  setTradeSide: (side: TradeSide) => void;
  setChartRange: (range: ChartRange) => void;
  setAgentTab: (tab: AgentTab) => void;
  setActiveEventId: (id: string | null) => void;
  toggleDiscoveryFilter: (filter: string) => void;
};

export const useKeyMarketStore = create<KeyMarketState>((set) => ({
  chain: initialChainState,
  agents: [],
  selectedId: "",
  tradeSide: "buy",
  activeChartRange: "24h",
  activeAgentTab: "chatroom",
  activeEventId: null,
  discoveryLoading: true,
  activeDiscoveryFilters: new Set<string>(),
  toast: null,

  hydrate: (snapshot) => set(snapshot),
  setChainState: (next) => set((s) => ({ chain: mergeChainState(s.chain, next) })),
  showToast: (message, options) =>
    set((s) => ({ toast: { id: (s.toast?.id ?? 0) + 1, message, ...options } })),
  clearQuote: () =>
    set((s) => ({
      chain: { ...s.chain, quote: null, quoteSide: null, protection: null, error: null },
    })),
  setSelectedId: (selectedId) => set({ selectedId }),
  setTradeSide: (tradeSide) => set({ tradeSide }),
  setChartRange: (activeChartRange) => set({ activeChartRange }),
  setAgentTab: (activeAgentTab) => set({ activeAgentTab }),
  setActiveEventId: (activeEventId) => set({ activeEventId }),
  toggleDiscoveryFilter: (filter) =>
    set((s) => {
      const next = new Set(s.activeDiscoveryFilters);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return { activeDiscoveryFilters: next };
    }),
}));
