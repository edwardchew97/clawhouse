"use client";

import type { ReactNode } from "react";
import { formatUtcTime, keyAmountLabel, signedPct } from "../../lib/key-market-format";
import {
  agentTitle,
  backendApplies,
  backendNetwork,
  backendPnl,
  chainApplies,
  holderBalance,
  holderCount,
  isUnlocked,
  keyPriceLabel,
  keyStateInitialLoading,
  paperActivity,
  paperSummary,
  roomAccessLoading,
  type SelectorContext,
} from "../../lib/key-market-selectors";
import type { LegacyAgent } from "../../lib/key-market-types";
import { useKeyMarketStore } from "../../store/key-market-store";
import { useSelectedAgent, useSelectorContext } from "../../store/use-key-market";
import { AgentIcon } from "./agent-icon";
import { Skeleton } from "./skeleton";

const DEFAULT_BANNER = "/agent-banners/default-agent-banner.png";

function GateValue({ ctx, agent }: { ctx: SelectorContext; agent: LegacyAgent }): ReactNode {
  const balance = holderBalance(ctx, agent);
  if (isUnlocked(ctx, agent)) return "Room open";
  if (!ctx.chain.accountId) return "1 key";
  if (keyStateInitialLoading(ctx, agent) || roomAccessLoading(ctx, agent)) {
    return <Skeleton width="42px" className="inline-skeleton" />;
  }
  if (ctx.chain.readAccessError) return "Access error";
  return balance && balance > 0 ? <Skeleton width="42px" className="inline-skeleton" /> : "1 key";
}

function lastUpdate(ctx: SelectorContext, agent: LegacyAgent) {
  const activity = paperActivity(ctx, agent);
  const summary = paperSummary(ctx, agent);
  const latestRiskAt = (summary.latest_risk_at as string)
    ?? (activity?.latest_risk as Record<string, unknown> | undefined)?.created_at;
  if (latestRiskAt) return formatUtcTime(latestRiskAt);
  if (chainApplies(ctx, agent)) return "testnet live";
  if (backendApplies(ctx, agent) && (ctx.chain.backend as Record<string, unknown> | null)?.ok) {
    return backendNetwork(ctx, agent);
  }
  return String(agent.last ?? "checking");
}

/** Right-column agent profile. Ported from the hero half of legacy renderHero. */
export function AgentProfile() {
  const ctx = useSelectorContext();
  const agent = useSelectedAgent();
  // Subscribe so the panel re-renders as chain state updates.
  useKeyMarketStore((s) => s.chain);

  if (!agent) {
    return (
      <section className="panel hero agent-profile">
        <div className="hero-banner" aria-hidden="true">
          <img src={DEFAULT_BANNER} alt="" />
        </div>
        <div className="hero-content">
          <div className="hero-left">
            <div className="avatar">--</div>
            <div>
              <div className="hero-name">
                <span className="hero-title">No agents yet</span>
                <span className="live-badge"><span className="dot" /> running</span>
              </div>
              <div className="hero-desc">
                Fresh staging is ready. New agents will appear after onboarding registers a public board and paper account.
              </div>
            </div>
          </div>
          <div className="hero-stats">
            <Stat label="Agent P&L 24h" value="--" />
            <Stat label="Key price tNEAR" value="--" />
            <Stat label="Holders" value="--" />
            <Stat label="Last update" value="fresh start" />
            <Stat label="Room gate" value="--" />
          </div>
        </div>
      </section>
    );
  }

  const pnl = backendPnl(ctx, agent);
  const holders = holderCount(ctx, agent);

  return (
    <section className="panel hero agent-profile">
      <div className="hero-banner" aria-hidden="true">
        <img src={(agent.bannerUrl as string) || DEFAULT_BANNER} alt="" />
      </div>
      <div className="hero-content">
        <div className="hero-left">
          <div className="avatar"><AgentIcon agent={agent} /></div>
          <div>
            <div className="hero-name">
              <span className="hero-title">{agentTitle(agent)}</span>
              <span className="live-badge"><span className="dot" /> running</span>
            </div>
            <div className="hero-desc">{agent.desc as string}</div>
          </div>
        </div>
        <div className="hero-stats">
          <Stat
            label="Agent P&L 24h"
            value={pnl === null ? "--" : signedPct(pnl)}
            className={pnl === null ? "" : pnl >= 0 ? "green" : "red"}
          />
          <Stat label="Key price tNEAR" value={keyPriceLabel(ctx, agent).replace(" tNEAR", "")} />
          <Stat label="Holders" value={holders === null ? "--" : holders.toLocaleString()} />
          <Stat label="Last update" value={lastUpdate(ctx, agent)} />
          <Stat label="Room gate" value={<GateValue ctx={ctx} agent={agent} />} />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className="stat">
      <label>{label}</label>
      <strong className={className}>{value}</strong>
    </div>
  );
}
