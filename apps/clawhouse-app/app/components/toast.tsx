"use client";

import { useEffect, useState } from "react";
import { useKeyMarketStore } from "../store/key-market-store";

const DEFAULT_DURATION_MS = 1800;
const LINK_DURATION_MS = 9000;

/**
 * Toast notification. Replaces the legacy `byId("toast")` DOM manipulation in
 * `clawhouse-fomo-layout.js`; both the layout script and the wallet bridge now
 * request toasts through the store's `showToast` action.
 *
 * Behavior preserved from the legacy implementation: auto-hide after 1.8s, or 9s
 * when an action link is present; the link opens in a new tab.
 */
export function Toast() {
  const toast = useKeyMarketStore((s) => s.toast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const duration = toast.durationMs ?? (toast.linkUrl ? LINK_DURATION_MS : DEFAULT_DURATION_MS);
    const timer = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const className = ["toast", toast?.linkUrl ? "actionable" : "", visible ? "show" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} role="status" aria-live="polite">
      {toast?.message ?? "Preview action"}
      {toast?.linkUrl ? (
        <a href={toast.linkUrl} target="_blank" rel="noreferrer">
          {toast.linkLabel || "Open"}
        </a>
      ) : null}
    </div>
  );
}
