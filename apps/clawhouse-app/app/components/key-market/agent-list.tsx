"use client";

import { pnlLabel } from "../../lib/key-market-format";
import { legacyClearDiscoveryFilters, legacySelectAgent } from "../../lib/legacy-bridge";
import {
  activeDiscoveryFilterLabels,
  agentKey,
  agentRowPnl,
  agentRowReadout,
  agentTitle,
  isPaperAgent,
  sortedAgents,
} from "../../lib/key-market-selectors";
import { useKeyMarketStore } from "../../store/key-market-store";
import { useSelectorContext } from "../../store/use-key-market";
import { AgentIcon } from "./agent-icon";

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <div className="agent-row agent-row-skeleton" aria-hidden="true" key={i}>
          <div className="avatar agent-skeleton-avatar" />
          <div className="agent-copy">
            <div className="agent-name">
              <span className="agent-skeleton-line agent-skeleton-name" />
              <span className="agent-skeleton-line agent-skeleton-tag" />
            </div>
            <div className="agent-skeleton-line agent-skeleton-meta" />
            <div className="agent-stats">
              <span className="agent-skeleton-line agent-skeleton-stat" />
              <span className="agent-skeleton-line agent-skeleton-stat short" />
              <b className="agent-skeleton-line agent-skeleton-change" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** Left-column agent discovery list. Ported from legacy renderAgentList. */
export function AgentList() {
  const ctx = useSelectorContext();
  const selectedId = useKeyMarketStore((s) => s.selectedId);
  const discoveryLoading = useKeyMarketStore((s) => s.discoveryLoading);

  const readbackLoading = ctx.agents.length > 0 && !ctx.chain.backend;
  if (discoveryLoading || readbackLoading) {
    return <div className="agent-list" aria-busy="true"><SkeletonRows /></div>;
  }

  const sorted = sortedAgents(ctx);
  if (!sorted.length) {
    const filters = activeDiscoveryFilterLabels(ctx.activeDiscoveryFilters);
    return (
      <div className="agent-list">
        <div className="agent-list-empty">
          <span className="agent-list-empty-kicker">{filters.length ? `${filters.length} filters active` : "No matches"}</span>
          <strong>No agents found</strong>
          <p>{filters.length ? `No public agent matches ${filters.join(" + ")}.` : "No public agents are available right now."}</p>
          <button className="agent-clear-filters" type="button" onClick={() => legacyClearDiscoveryFilters()}>Clear filters</button>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-list">
      {sorted.map((agent) => {
        const pnl = agentRowPnl(ctx, agent);
        const selectionKey = agentKey(agent);
        const selected = selectionKey === selectedId;
        const pnlTone = pnl === null ? "empty" : pnl < 0 ? "down" : "up";
        const readout = agentRowReadout(ctx, agent);
        const rowTag = isPaperAgent(ctx, agent) ? "paper" : "key market";
        return (
          <button
            className="agent-row"
            key={selectionKey}
            data-selected={selected ? "true" : "false"}
            aria-label={`Open ${agentTitle(agent)}`}
            onClick={() => legacySelectAgent(selectionKey)}
          >
            <div className="avatar"><AgentIcon agent={agent} /></div>
            <div className="agent-copy">
              <div className="agent-name">
                <span className="agent-title" title={agent.name}>{agentTitle(agent)}</span>
                <span className="tag">{rowTag}</span>
              </div>
              <div className="agent-meta">{agent.strategy as string}</div>
              <div className="agent-stats">
                <span className="agent-row-metric">{readout.primary}</span>
                <span className={`agent-row-status ${readout.tone}`}>{readout.secondary}</span>
                <b className={`agent-change ${pnlTone}`}>{pnlLabel(pnl)}</b>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
