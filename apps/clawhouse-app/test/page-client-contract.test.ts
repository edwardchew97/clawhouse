import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Transitional guard for the frontend refactor.
 *
 * The legacy `public/clawhouse-fomo-layout.js` drives the DOM with `getElementById`,
 * and `app/components/key-market-wallet-bridge.tsx` reaches in with `closest("#...")`.
 * Those ids are provided by `app/page.tsx` and (as panels port) by the React
 * components in `app/components/**`. There is no compiler check across that seam,
 * so deleting an id the legacy/bridge still targets silently breaks the client.
 *
 * This test fails if a legacy/bridge id reference is not provided anywhere in the
 * page or components — catching half-finished moves. As the legacy script shrinks,
 * its references disappear and the seam closes.
 *
 * KNOWN_DYNAMIC lists ids the client guards for but nothing renders (dead/optional
 * code paths). Remove entries as that code is deleted.
 */

const appDir = join(import.meta.dir, "..");
const pageSource = readFileSync(join(appDir, "app/page.tsx"), "utf8");
const layoutSource = readFileSync(join(appDir, "public/clawhouse-fomo-layout.js"), "utf8");
const bridgeSource = readFileSync(join(appDir, "app/components/key-market-wallet-bridge.tsx"), "utf8");

function readComponentSources(dir: string): string {
  let combined = "";
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) combined += readComponentSources(full);
    else if (entry.name.endsWith(".tsx")) combined += readFileSync(full, "utf8");
  }
  return combined;
}
const componentSources = readComponentSources(join(appDir, "app/components"));

const KNOWN_DYNAMIC = new Set([
  "tickerTrack", // renderTicker(): no ticker markup, early-returns
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

// ids provided by the static page or rendered by any React component.
const providedIds = new Set<string>([
  ...matchAll(pageSource, /id="([a-zA-Z0-9_-]+)"/g),
  ...matchAll(componentSources, /id="([a-zA-Z0-9_-]+)"/g),
]);
const layoutIds = matchAll(layoutSource, /(?:byId|getElementById)\("([a-zA-Z0-9_-]+)"\)/g);
const bridgeIds = matchAll(bridgeSource, /(?:closest|querySelector)\("#([a-zA-Z0-9_-]+)"\)/g);
const clientIds = new Set<string>([...layoutIds, ...bridgeIds]);
const pageIds = providedIds;

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
