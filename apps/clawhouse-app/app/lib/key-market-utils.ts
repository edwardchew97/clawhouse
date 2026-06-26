/**
 * Pure key-market domain + error helpers shared across the client.
 *
 * Duplicated today between `key-market-wallet-bridge.tsx` and
 * `public/clawhouse-fomo-layout.js`; the bridge imports them here and the legacy
 * layout script collapses onto this module as panels are ported to React.
 */

import type { DemoAgent } from "./key-market-types";

/** Stable identity key for an agent: its board id, falling back to its id. */
export function agentSelectionKey(agent: DemoAgent) {
  return agent.boardId ?? agent.id;
}

/**
 * Coerce a raw key-amount input to a safe whole-number string (1..999999).
 * Anything outside that shape falls back to "1".
 */
export function normalizedAmount(value: string) {
  const trimmed = value.trim();
  return /^[1-9]\d{0,5}$/.test(trimmed) ? trimmed : "1";
}

/** Extract a human message from an unknown thrown value, with a fallback. */
export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** First rejection message from a Promise.allSettled result set, or null. */
export function firstRejectedMessage(results: PromiseSettledResult<unknown>[]) {
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  return rejected ? errorMessage(rejected.reason, "Key market read failed.") : null;
}
