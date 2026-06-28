"use client";

import type { ReactNode } from "react";
import {
  asNumber,
  compactNumber,
  formatPrice,
  formatSignedUsd,
  formatUsd,
  keyAmountLabel,
  shortAccount,
} from "../../lib/key-market-format";
import { compactReason, eventTag, normalizePaperOrderEvent } from "../../lib/key-market-events";
import { legacyChartModel, legacyOpenEvent } from "../../lib/legacy-bridge";
import {
  agentTitle,
  chainApplies,
  holderBalance,
  holderCount,
  isUnlocked,
  keyActivityTrades,
  keyStateInitialLoading,
  keyTradeAccountUrl,
  paperActivity,
  paperActivityAccessState,
  paperActivityLoading,
  paperLeaderboardRow,
  paperOpenPositions,
  paperOrders,
  positionPnlUsd,
  roomAccessLoading,
  sortedByObservedAt,
  type SelectorContext,
} from "../../lib/key-market-selectors";
import type { LegacyAgent } from "../../lib/key-market-types";
import { type AgentTab, useKeyMarketStore } from "../../store/key-market-store";
import { useSelectedAgent, useSelectorContext } from "../../store/use-key-market";
import { AgentIcon } from "./agent-icon";
import { BalanceValue, GateValue } from "./labels";
import { Skeleton } from "./skeleton";

const TABS: { id: AgentTab; label: string }[] = [
  { id: "chatroom", label: "Chatroom" },
  { id: "keyholders", label: "Keyholders" },
  { id: "positions", label: "Positions" },
];

export function AgentBase() {
  const ctx = useSelectorContext();
  const agent = useSelectedAgent();
  const activeTab = useKeyMarketStore((s) => s.activeAgentTab);
  const setAgentTab = useKeyMarketStore((s) => s.setAgentTab);
  useKeyMarketStore((s) => s.chain);
  // Room events depend on the chart range (via the delegated chart model).
  useKeyMarketStore((s) => s.activeChartRange);

  return (
    <section className="panel room chat-room">
      <div className="panel-head">
        <div>
          <div className="panel-title">Agent Base View</div>
          <div className="panel-sub">Chatroom, keyholders, and agent positions</div>
        </div>
        <button className="mini-button" type="button">
          {agent ? <GateValue ctx={ctx} agent={agent} /> : "No agent selected"}
        </button>
      </div>
      <div className="agent-base-tabs" role="tablist" aria-label="Agent base view">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`agent-base-tab${activeTab === tab.id ? " active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setAgentTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={`agent-tab-panel${activeTab === "chatroom" ? " active" : ""}`} role="tabpanel" hidden={activeTab !== "chatroom"}>
        <div className="room-feed chat-room-feed">
          {activeTab === "chatroom" ? <RoomFeed ctx={ctx} agent={agent} /> : null}
        </div>
      </div>
      <div className={`agent-tab-panel keyholders-panel${activeTab === "keyholders" ? " active" : ""}`} role="tabpanel" hidden={activeTab !== "keyholders"}>
        {activeTab === "keyholders" && agent ? <Keyholders ctx={ctx} agent={agent} /> : null}
      </div>
      <div className={`agent-tab-panel positions-panel${activeTab === "positions" ? " active" : ""}`} role="tabpanel" hidden={activeTab !== "positions"}>
        {activeTab === "positions" && agent ? <Positions ctx={ctx} agent={agent} /> : null}
      </div>
    </section>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="backend-empty">
      <span>{title}</span>
      <strong>{detail}</strong>
    </div>
  );
}

function RoomFeed({ ctx, agent }: { ctx: SelectorContext; agent: LegacyAgent | null }) {
  if (!agent) return <Empty title="No agent room yet" detail="Onboard the first paper-trading agent to create the first board." />;
  const activity = paperActivity(ctx, agent);
  const accessState = paperActivityAccessState(ctx, agent);
  const events = activity
    ? sortedByObservedAt(paperOrders(ctx, agent)).slice(-12).reverse().map((order, i) => normalizePaperOrderEvent(ctx, order, i, agent))
    : (legacyChartModel(agent)?.events ?? []);

  if (!events.length) {
    if (accessState?.loading || paperActivityLoading(ctx, agent)) {
      return (
        <div className="chat-empty chat-empty-loading" aria-busy="true" aria-label="Loading room events">
          <div className="chat-empty-copy">
            <span><Skeleton width="62px" className="inline-skeleton" /></span>
            <strong><Skeleton width="156px" className="inline-skeleton" /></strong>
            <p><Skeleton width="280px" className="inline-skeleton" /></p>
          </div>
          <div className="chat-empty-badge"><Skeleton width="54px" className="inline-skeleton" /></div>
        </div>
      );
    }
    return (
      <div className="chat-empty" aria-label="Agent chat room has no readable events">
        <div className="chat-empty-copy">
          <span>Chatroom</span>
          <strong>{accessState?.title || "No readable room events yet"}</strong>
          <p>{accessState?.message || "Orders and agent updates will appear here when this board reports activity."}</p>
        </div>
        <div className="chat-empty-badge">{accessState?.badge || "Idle"}</div>
      </div>
    );
  }

  return (
    <>
      {events.map((event) => (
        <article className="update" key={event.id} onClick={() => legacyOpenEvent(event.id)} style={{ cursor: "pointer" }}>
          <div className="update-avatar" aria-hidden="true"><AgentIcon agent={agent} /></div>
          <div className="update-copy">
            <div className="update-title">
              <strong>{agentTitle(agent)}</strong>
              <span className="tag">{eventTag(event)}</span>
              <time>{event.time}</time>
            </div>
            <div className="update-text">{compactReason(event.reason)}</div>
            <div className="update-action">
              <span>Action</span>
              <strong>{event.action}</strong>
            </div>
          </div>
        </article>
      ))}
    </>
  );
}

type KeyholderRow = { title: string; meta: string; value: ReactNode; url?: string | null };

function Keyholders({ ctx, agent }: { ctx: SelectorContext; agent: LegacyAgent }) {
  const holders = holderCount(ctx, agent);
  const rows: KeyholderRow[] = [];
  const liveAgent = chainApplies(ctx, agent) ? (ctx.chain.state as Record<string, unknown> | null)?.agent as Record<string, unknown> | undefined : null;
  if (liveAgent?.creator_id) {
    rows.push({ title: String(liveAgent.creator_id), meta: "Creator / key-market owner", value: "creator" });
  }
  if (ctx.chain.accountId) {
    const balance = holderBalance(ctx, agent);
    rows.push({
      title: ctx.chain.accountId,
      meta: isUnlocked(ctx, agent)
        ? "Connected wallet / room access active"
        : roomAccessLoading(ctx, agent) ? "Connected wallet / opening room" : "Connected wallet",
      value: keyStateInitialLoading(ctx, agent)
        ? <Skeleton width="48px" className="inline-skeleton align-right" />
        : balance === null ? "--" : keyAmountLabel(balance),
    });
  }
  const seen = new Set(rows.map((r) => r.title));
  for (const trade of keyActivityTrades(ctx, agent)) {
    if (!trade.trader_id || seen.has(trade.trader_id)) continue;
    seen.add(trade.trader_id);
    rows.push({
      title: trade.trader_id,
      meta: `Recent ${trade.side || "key"} trade`,
      value: `${trade.amount} key${trade.amount === "1" ? "" : "s"}`,
      url: keyTradeAccountUrl(trade),
    });
  }

  return (
    <>
      <div className="agent-summary-grid">
        <Card label="Total keys" value={holders === null && keyStateInitialLoading(ctx, agent) ? <Skeleton width="42px" /> : holders === null ? "--" : holders.toLocaleString()} />
        <Card label="Your keys" value={<BalanceValue ctx={ctx} agent={agent} />} />
        <Card label="Gate" value={<GateValue ctx={ctx} agent={agent} compact />} />
      </div>
      {rows.length ? rows.slice(0, 8).map((row, i) => (
        <div className="keyholder-row" key={i}>
          <div className="keyholder-main">
            <strong>
              {row.url
                ? <a href={row.url} target="_blank" rel="noreferrer">{shortAccount(row.title)}</a>
                : shortAccount(row.title)}
            </strong>
            <span className="keyholder-meta">{row.meta}</span>
          </div>
          <div className="keyholder-value">{row.value}</div>
        </div>
      )) : (
        <Empty title="No keyholders yet" detail={`Staging reports ${holders === null ? "--" : holders.toLocaleString()} keys for this agent.`} />
      )}
    </>
  );
}

function Positions({ ctx, agent }: { ctx: SelectorContext; agent: LegacyAgent }) {
  const activity = paperActivity(ctx, agent);
  if (!activity) return <Empty title="No paper activity yet" detail="This agent has no readable paper account activity." />;
  const positions = paperOpenPositions(ctx, agent);
  if (!positions.length) return <Empty title="No open positions" detail="This agent has no open paper positions right now." />;

  const hasPnl = positions.some((p) => positionPnlUsd(ctx, p) !== null);
  const totalPnl = positions.reduce((sum, p) => { const v = positionPnlUsd(ctx, p); return v === null ? sum : sum + v; }, 0);
  const account = activity.account as Record<string, unknown> | undefined;
  const latestRisk = activity.latest_risk as Record<string, unknown> | undefined;

  return (
    <>
      <div className="agent-summary-grid">
        <Card label="Open positions" value={positions.length.toLocaleString()} />
        <Card label="Equity" value={formatUsd(latestRisk?.equity_usd ?? paperLeaderboardRow(ctx, agent)?.equity_usd)} />
        <Card label="Cash" value={formatUsd(account?.cash_balance_usd)} />
      </div>
      <div className="position-table" role="table" aria-label="Open paper positions">
        <div className="position-table-head" role="row">
          <span>Market</span><span>Size</span><span>Entry</span><span>P&L</span>
        </div>
        {positions.map((position, i) => {
          const size = asNumber(position.signed_size) ?? 0;
          const side = size < 0 ? "Short" : "Long";
          const leverage = asNumber(position.leverage);
          const coin = String(position.coin || "").toUpperCase();
          const pnl = positionPnlUsd(ctx, position);
          const pnlTone = pnl === null ? "empty" : pnl >= 0 ? "up" : "down";
          return (
            <div className="position-row" role="row" key={i}>
              <div className="position-main">
                <strong>{coin || "PAPER"} <span className={size < 0 ? "down" : "up"}>{side}</span></strong>
                <span className="position-meta">
                  {String(position.market_type || "paper")} / {String(position.margin_mode || "margin")} / {leverage === null ? "--" : `${leverage}x`}
                </span>
              </div>
              <div className="position-value">{compactNumber(Math.abs(size))} {coin}</div>
              <div className="position-entry">{formatPrice(position.entry_px)}</div>
              <div className={`position-pnl ${pnlTone}`}>{formatSignedUsd(pnl)}</div>
            </div>
          );
        })}
      </div>
      <div className="positions-footnote">
        {hasPnl
          ? <>Visible position P&L total <strong className={totalPnl >= 0 ? "up" : "down"}>{formatSignedUsd(totalPnl)}</strong></>
          : "Per-position P&L needs mark price or unrealized P&L from the backend."}
      </div>
    </>
  );
}

function Card({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="agent-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
