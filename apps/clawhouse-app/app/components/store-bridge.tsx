"use client";

import { useEffect } from "react";
import { useKeyMarketStore } from "../store/key-market-store";

/**
 * TRANSITIONAL (removed in Phase 4).
 *
 * Exposes the Zustand store to the legacy `public/clawhouse-fomo-layout.js`, which
 * is served as a static script and cannot import bundled modules. While panels are
 * being ported, the legacy script writes UI state (e.g. toasts) through this handle
 * so the React panels and the legacy renderer share one source of truth.
 *
 * Once the legacy script is deleted, this component and `window.__clawhouseStore`
 * go away with it.
 */
declare global {
  interface Window {
    __clawhouseStore?: typeof useKeyMarketStore;
  }
}

export function StoreBridge() {
  useEffect(() => {
    window.__clawhouseStore = useKeyMarketStore;
    return () => {
      if (window.__clawhouseStore === useKeyMarketStore) delete window.__clawhouseStore;
    };
  }, []);
  return null;
}
