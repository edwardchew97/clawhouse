import type { DemoChainState, LegacyAgent } from "./key-market-types";

/**
 * TRANSITIONAL (Phase 4): typed access to legacy chart logic still living in
 * `public/clawhouse-fomo-layout.js`. The chart data model is the most intricate
 * pure logic in the app; rather than re-derive it (and risk fidelity drift), the
 * React chart/hero/room panels reuse the exact legacy `chartModel` through this
 * window handle until it is ported to TS and this module is deleted.
 */

export type ChartPoint = { time: number; value: number };

export type ChartEvent = {
  id: string;
  index: number;
  timeValue: number | null;
  chartValue: number | null;
  title: string;
  label: string;
  time: string;
  action: string;
  move: string;
  summary: string;
  reason: string;
  sources: string[];
  raw: Record<string, unknown>;
  backend?: boolean;
  public?: boolean;
};

export type ChartModel = {
  values: number[];
  points: ChartPoint[];
  events: ChartEvent[];
  tone: string;
  title?: string;
  source?: string;
  valueKind?: string;
  message: string;
};

declare global {
  interface Window {
    __clawhouseLegacy?: {
      chartModel: (agent: LegacyAgent | null) => ChartModel;
      openEvent: (eventId: string) => void;
      closeEvent: () => void;
      selectAgent: (id: string) => void;
      clearDiscoveryFilters: () => void;
      setTradeSide: (side: "buy" | "sell") => void;
      onAmountChange: () => void;
      applyDiscovery: (agents: LegacyAgent[], data: Record<string, unknown>) => void;
      applyDiscoveryError: (message: string) => void;
    };
  }
}

/** Wait until the legacy script has installed the bridge, then resolve it. */
export async function whenLegacyReady(timeoutMs = 6000): Promise<Window["__clawhouseLegacy"] | null> {
  if (typeof window === "undefined") return null;
  const started = Date.now();
  while (!window.__clawhouseLegacy && Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return window.__clawhouseLegacy ?? null;
}

/** Current chart model for an agent, or null before the legacy script has loaded. */
export function legacyChartModel(agent: LegacyAgent | null): ChartModel | null {
  if (typeof window === "undefined" || !window.__clawhouseLegacy) return null;
  return window.__clawhouseLegacy.chartModel(agent);
}

/** Open an event: legacy gates + sets activeEventId + highlights the chart; React renders. */
export function legacyOpenEvent(eventId: string) {
  window.__clawhouseLegacy?.openEvent(eventId);
}

/** Close the event modal (clears legacy activeEventId + chart highlight). */
export function legacyCloseEvent() {
  window.__clawhouseLegacy?.closeEvent();
}

/** Drive the legacy-authoritative agent selection (chart + ticket still read it). */
export function legacySelectAgent(id: string) {
  window.__clawhouseLegacy?.selectAgent(id);
}

/** Clear the legacy-owned discovery filters. */
export function legacyClearDiscoveryFilters() {
  window.__clawhouseLegacy?.clearDiscoveryFilters();
}

/** Write chain state through the legacy container (merges + renders + mirrors to store). */
export function legacySetChainState(next: DemoChainState) {
  window.ClawHouseDemo?.setChainState(next);
}

/** Set the legacy-owned trade side (the wallet bridge reads it). */
export function legacySetTradeSide(side: "buy" | "sell") {
  window.__clawhouseLegacy?.setTradeSide(side);
}

/** Notify the legacy layer that the key amount changed (re-quote). */
export function legacyOnAmountChange() {
  window.__clawhouseLegacy?.onAmountChange();
}
