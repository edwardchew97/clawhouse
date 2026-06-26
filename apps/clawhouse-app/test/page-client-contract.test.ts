import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Transitional guard for the frontend refactor.
 *
 * Today the UI is split across three files that are coupled only by hard-coded
 * DOM ids: `app/page.tsx` renders a static shell, `public/clawhouse-fomo-layout.js`
 * drives it with `getElementById`, and `app/components/key-market-wallet-bridge.tsx`
 * reaches in with `closest("#...")`. There is no compiler check across that seam,
 * so deleting an id in the page silently breaks the client.
 *
 * As panels are ported to React, the matching ids should disappear from BOTH the
 * page and the client at the same time. This test fails if a client file still
 * references an id the page no longer provides — catching half-finished moves.
 *
 * KNOWN_DYNAMIC lists ids the client guards for but the page intentionally does
 * not render (dead/optional code paths). Remove entries as that code is deleted.
 */

const appDir = join(import.meta.dir, "..");
const pageSource = readFileSync(join(appDir, "app/page.tsx"), "utf8");
const layoutSource = readFileSync(join(appDir, "public/clawhouse-fomo-layout.js"), "utf8");
const bridgeSource = readFileSync(join(appDir, "app/components/key-market-wallet-bridge.tsx"), "utf8");

const KNOWN_DYNAMIC = new Set([
  "tickerTrack", // renderTicker(): no ticker markup in the page, early-returns
  "backendStatus", // renderBackendStatus(): no backend-status markup, early-returns
  "backendUrl", // renderBackendStatus(): no backend-status markup, early-returns
]);

function matchAll(source: string, pattern: RegExp) {
  const ids = new Set<string>();
  for (const match of source.matchAll(pattern)) {
    if (match[1]) ids.add(match[1]);
  }
  return ids;
}

const pageIds = matchAll(pageSource, /id="([a-zA-Z0-9_-]+)"/g);
const layoutIds = matchAll(layoutSource, /(?:byId|getElementById)\("([a-zA-Z0-9_-]+)"\)/g);
const bridgeIds = matchAll(bridgeSource, /(?:closest|querySelector)\("#([a-zA-Z0-9_-]+)"\)/g);
const clientIds = new Set<string>([...layoutIds, ...bridgeIds]);

describe("page.tsx <-> client DOM id contract", () => {
  test("every id the client targets is provided by the page (or known-dynamic)", () => {
    const missing = [...clientIds].filter((id) => !pageIds.has(id) && !KNOWN_DYNAMIC.has(id));
    expect(missing).toEqual([]);
  });

  test("known-dynamic ids stay out of the page so the allowlist does not rot", () => {
    const leaked = [...KNOWN_DYNAMIC].filter((id) => pageIds.has(id));
    expect(leaked).toEqual([]);
  });
});
