import type { LegacyAgent } from "./key-market-types";

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
    };
  }
}

/** Current chart model for an agent, or null before the legacy script has loaded. */
export function legacyChartModel(agent: LegacyAgent | null): ChartModel | null {
  if (typeof window === "undefined" || !window.__clawhouseLegacy) return null;
  return window.__clawhouseLegacy.chartModel(agent);
}

/** Open the (still-legacy) event modal for an event id. Removed when the modal ports. */
export function legacyOpenEvent(eventId: string) {
  window.__clawhouseLegacy?.openEvent(eventId);
}
