"use client";

import { formatCompactUsd, signedPct } from "../../lib/key-market-format";
import {
  agentTitle,
  backendPnl,
  keyPriceLabel,
  paperActivity,
  paperFills,
  paperLeaderboardRow,
  paperOpenPositions,
  paperSummary,
} from "../../lib/key-market-selectors";
import { useSelectedAgent, useSelectorContext } from "../../store/use-key-market";

/**
 * Header market strip. Ported from the `byId("topAgentName")…` block in the legacy
 * renderHero (and its no-agent fallback in renderFreshStartEmpty).
 */
export function TopMarketStrip() {
  const ctx = useSelectorContext();
  const agent = useSelectedAgent();

  let name = "No agents";
  let pnlText = "--";
  let pnlClass = "";
  let keyPrice = "--";
  let equity = "--";
  let positions = "--";
  let fills = "--";

  if (agent) {
    const pnl = backendPnl(ctx, agent);
    const activity = paperActivity(ctx, agent);
    const summary = paperSummary(ctx, agent);
    const equityValue =
      (activity?.latest_risk as Record<string, unknown> | undefined)?.equity_usd
      ?? paperLeaderboardRow(ctx, agent)?.equity_usd;
    const filledOrders = (summary.filled_orders as number | undefined) ?? paperFills(ctx, agent).length;

    name = agentTitle(agent);
    pnlText = pnl === null ? "--" : signedPct(pnl);
    pnlClass = pnl === null ? "" : pnl >= 0 ? "green" : "red";
    keyPrice = keyPriceLabel(ctx, agent).replace(" tNEAR", "");
    equity = formatCompactUsd(equityValue);
    positions = paperOpenPositions(ctx, agent).length.toLocaleString();
    fills = Number(filledOrders).toLocaleString();
  }

  return (
    <div className="top-market-strip" aria-label="Current agent market context">
      <div className="top-market-primary">
        <span className="top-market-kicker">Paper P&amp;L</span>
        <strong>{name}</strong>
        <b className={pnlClass}>{pnlText}</b>
      </div>
      <div className="top-market-items">
        <span><b>{keyPrice}</b> key</span>
        <span><b>{equity}</b> equity</span>
        <span><b>{positions}</b> pos</span>
        <span><b>{fills}</b> fills</span>
      </div>
    </div>
  );
}
