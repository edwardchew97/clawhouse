"use client";

import type { ReactNode } from "react";
import { formatCompactUsd, signedPct } from "../../lib/key-market-format";
import { legacyChartModel } from "../../lib/legacy-bridge";
import {
  agentTitle,
  backendNetwork,
  backendPnl,
  chainApplies,
  holderCount,
  keyPriceLabel,
  paperActivity,
  paperFills,
  paperLeaderboardRow,
  paperOpenPositions,
  paperSummary,
} from "../../lib/key-market-selectors";
import { useKeyMarketStore } from "../../store/key-market-store";
import { useSelectedAgent, useSelectorContext } from "../../store/use-key-market";
import { AgentIcon } from "./agent-icon";

/** Chart-top identity bar. Ported from the fomo-bar half of legacy renderHero. */
export function FomoAgentBar() {
  const ctx = useSelectorContext();
  const agent = useSelectedAgent();
  // Re-render on chain + range changes (range feeds the delegated chart message).
  useKeyMarketStore((s) => s.chain);
  useKeyMarketStore((s) => s.activeChartRange);

  if (!agent) {
    return (
      <div className="fomo-agent-bar">
        <Identity name="No agents yet" meta="No public agent board has been registered yet." />
        <StatStrip equity="--" keyPrice="--" pnl="--" pnlClass="" positions="--" filled="--" holders="--" />
      </div>
    );
  }

  const pnl = backendPnl(ctx, agent);
  const activity = paperActivity(ctx, agent);
  const summary = paperSummary(ctx, agent);
  const holders = holderCount(ctx, agent);
  const equityValue = (activity?.latest_risk as Record<string, unknown> | undefined)?.equity_usd
    ?? paperLeaderboardRow(ctx, agent)?.equity_usd;
  const filled = (summary.filled_orders as number | undefined) ?? paperFills(ctx, agent).length;

  const chart = legacyChartModel(agent);
  const network = backendNetwork(ctx, agent);
  let meta = "Reading backend agent network series.";
  if (chart) {
    meta = activity
      ? `${chart.message} · ${(summary.filled_orders as number | undefined) ?? 0}/${(summary.total_orders as number | undefined) ?? 0} filled · ${network}`
      : `${chart.message} · ${network} · key market ${chainApplies(ctx, agent) ? "live" : "checking"}`;
  }

  return (
    <div className="fomo-agent-bar">
      <Identity name={String(agentTitle(agent))} meta={meta} avatar={<AgentIcon agent={agent} />} />
      <StatStrip
        equity={formatCompactUsd(equityValue)}
        keyPrice={keyPriceLabel(ctx, agent).replace(" tNEAR", "")}
        pnl={pnl === null ? "--" : signedPct(pnl)}
        pnlClass={pnl === null ? "" : pnl >= 0 ? "green" : "red"}
        positions={paperOpenPositions(ctx, agent).length.toLocaleString()}
        filled={Number(filled).toLocaleString()}
        holders={holders === null ? "--" : holders.toLocaleString()}
      />
    </div>
  );
}

function Identity({ name, meta, avatar }: { name: string; meta: string; avatar?: ReactNode }) {
  return (
    <div className="fomo-agent-identity">
      <div className="fomo-agent-avatar">{avatar ?? "--"}</div>
      <div className="fomo-agent-copy">
        <div className="fomo-agent-title-row">
          <strong>{name}</strong>
          <span className="fomo-agent-status"><span className="dot" /> running</span>
        </div>
        <div className="fomo-agent-meta">{meta}</div>
      </div>
    </div>
  );
}

function StatStrip(props: {
  equity: string; keyPrice: string; pnl: string; pnlClass: string;
  positions: string; filled: string; holders: string;
}) {
  return (
    <div className="fomo-stat-strip" aria-label="Agent market stats">
      <Chip label="Equity" value={props.equity} />
      <Chip label="Key price" value={props.keyPrice} />
      <Chip label="24H P&L" value={props.pnl} className={props.pnlClass} />
      <Chip label="Positions" value={props.positions} />
      <Chip label="Filled" value={props.filled} />
      <Chip label="Holders" value={props.holders} />
    </div>
  );
}

function Chip({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="fomo-stat-chip">
      <span>{label}</span>
      <strong className={className}>{value}</strong>
    </div>
  );
}
