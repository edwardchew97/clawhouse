"use client";

import { useEffect } from "react";
import { fetchDiscovery } from "../../lib/market-data";
import { whenLegacyReady } from "../../lib/legacy-bridge";

/**
 * Drives market data fetching from React. The HTTP + parsing is typed
 * (app/lib/market-data.ts); results are handed to the legacy orchestration via the
 * bridge until the state container itself moves into the store.
 *
 * Currently owns: discovery. (Key-market + backend refreshes follow.)
 */
export function MarketDataController() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const legacy = await whenLegacyReady();
      if (cancelled || !legacy) return;
      try {
        const { agents, data } = await fetchDiscovery();
        if (!cancelled) legacy.applyDiscovery(agents, data);
      } catch (error) {
        if (!cancelled) {
          legacy.applyDiscoveryError(error instanceof Error ? error.message : "Discovery unavailable.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
