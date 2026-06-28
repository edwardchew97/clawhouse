"use client";

import { useEffect, useRef } from "react";
import { fetchDiscovery, refreshKeyMarket } from "../../lib/market-data";
import { whenLegacyReady } from "../../lib/legacy-bridge";
import { selectAgent } from "../../lib/key-market-selectors";
import { useKeyMarketStore } from "../../store/key-market-store";

/**
 * Drives market-data fetching from React. The HTTP + parsing is typed
 * (app/lib/market-data.ts); results flow into the legacy chain-state container via
 * the bridge until that container itself moves into the store.
 *
 * Owns: discovery, and the key-market read (state / quote / activity / max-buy),
 * triggered reactively on selection / side / amount / wallet changes.
 */
export function MarketDataController() {
  const agents = useKeyMarketStore((s) => s.agents);
  const selectedId = useKeyMarketStore((s) => s.selectedId);
  const tradeSide = useKeyMarketStore((s) => s.tradeSide);
  const keyAmount = useKeyMarketStore((s) => s.keyAmount);
  const accountId = useKeyMarketStore((s) => s.chain.accountId) ?? null;

  // Discovery (once).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const legacy = await whenLegacyReady();
      if (cancelled || !legacy) return;
      try {
        const { agents: list, data } = await fetchDiscovery();
        if (!cancelled) legacy.applyDiscovery(list, data);
      } catch (error) {
        if (!cancelled) legacy.applyDiscoveryError(error instanceof Error ? error.message : "Discovery unavailable.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Key-market read, debounced, on selection / side / amount / wallet changes.
  const prev = useRef({ selectedId, accountId, tradeSide, keyAmount });
  useEffect(() => {
    const agent = selectAgent(agents, selectedId);
    if (!agent) return;
    const p = prev.current;
    let reason = "refresh";
    if (selectedId !== p.selectedId || accountId !== p.accountId) reason = "agent-change";
    else if (tradeSide !== p.tradeSide) reason = "side-change";
    else if (keyAmount !== p.keyAmount) reason = "amount-change";
    prev.current = { selectedId, accountId, tradeSide, keyAmount };

    const timer = window.setTimeout(() => {
      void refreshKeyMarket({ agent, tradeSide, keyAmount, accountId, reason });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [agents, selectedId, tradeSide, keyAmount, accountId]);

  return null;
}
