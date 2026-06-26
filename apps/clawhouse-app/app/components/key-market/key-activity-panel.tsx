"use client";

import type { CSSProperties } from "react";
import {
  keyActivityInitialLoading,
  keyActivityLoading,
  keyActivityRows,
} from "../../lib/key-market-selectors";
import { useSelectedAgent, useSelectorContext } from "../../store/use-key-market";
import { useKeyMarketStore } from "../../store/key-market-store";

function skeletonStyle(width: string): CSSProperties {
  return { ["--skeleton-width" as string]: width };
}

function Skeleton({ width = "44px", className = "" }: { width?: string; className?: string }) {
  return <span className={`ui-skeleton ${className}`} style={skeletonStyle(width)} />;
}

/** Key trading activity panel. Ported from legacy renderKeyActivity. */
export function KeyActivityPanel() {
  const ctx = useSelectorContext();
  const agent = useSelectedAgent();
  const activityError = useKeyMarketStore((s) => s.chain.activityError);

  const loading = keyActivityLoading(ctx, agent);
  const initialLoading = keyActivityInitialLoading(ctx, agent);
  const rows = agent ? keyActivityRows(ctx, agent) : [];

  return (
    <section className="panel key-activity">
      <div className="key-activity-head">
        <div>
          <div className={`panel-title${loading ? " is-refreshing" : ""}`}>
            Key Trading Activity
          </div>
          <div className="panel-sub">NEAR testnet key market</div>
        </div>
      </div>
      <div className="activity-list key-activity-list">
        {!agent ? (
          <div className="backend-empty">
            <span>Reading key market</span>
            <strong>Waiting for NEAR testnet key-market state.</strong>
          </div>
        ) : initialLoading ? (
          [0, 1, 2].map((i) => (
            <div className="activity-row activity-row-skeleton" aria-hidden="true" key={i}>
              <Skeleton width="38px" className="activity-action-skeleton" />
              <span className="activity-main"><Skeleton width="132px" /></span>
              <Skeleton width="86px" className="activity-value-skeleton" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="backend-empty">
            <span>{activityError ? "Key activity unavailable" : "No verified key trades yet"}</span>
            <strong>{activityError || "Verified ClawHouse key buy/sell reports will appear here."}</strong>
          </div>
        ) : (
          rows.slice(0, 7).map((row, i) => (
            <div className={`activity-row key-activity-row ${row.tone}`} key={i}>
              <span className="activity-action">{row.title}</span>
              <span className="activity-main">
                <b>{row.amountLabel}</b>
                <span>
                  by{" "}
                  {row.traderUrl ? (
                    <a href={row.traderUrl} target="_blank" rel="noreferrer">{row.traderLabel}</a>
                  ) : (
                    row.traderLabel
                  )}
                </span>
              </span>
              <span className="activity-value">
                {row.linkUrl ? (
                  <a href={row.linkUrl} target="_blank" rel="noreferrer">{row.side}</a>
                ) : (
                  row.side
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
