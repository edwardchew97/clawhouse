/**
 * Core key-market derivation selectors, ported legacy-exact from
 * `public/clawhouse-fomo-layout.js`.
 *
 * The legacy functions read module globals (`chainState`, `agents`, `tradeSide`);
 * here they take an explicit `SelectorContext` (a slice of the store) so they are
 * pure and testable. Behavior is reproduced one-to-one — verified against the live
 * legacy output in the browser as panels are ported.
 */

import type { DemoChainState, LegacyAgent, TradeSide } from "./key-market-types";
import { asNumber, nearLabel, normalizePct } from "./key-market-format";

export type SelectorContext = {
  chain: DemoChainState;
  agents: LegacyAgent[];
  tradeSide: TradeSide;
};

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec | null =>
  value && typeof value === "object" ? (value as Rec) : null;

export function agentTitle(agent: LegacyAgent) {
  return agent.displayName || agent.name;
}

/** Legacy-exact agent identity key (uses `||`, treats null as ""). */
export function agentKey(agent: LegacyAgent | null) {
  if (!agent) return "";
  return agent.boardId || agent.id;
}

/** Resolve the selected agent the way the legacy `selectedAgent()` getter does. */
export function selectAgent(agents: LegacyAgent[], selectedId: string): LegacyAgent | null {
  return agents.find((agent) => agentKey(agent) === selectedId)
    || agents.find((agent) => agent.id === selectedId)
    || agents[0]
    || null;
}

export function chainApplies(s: SelectorContext, agent: LegacyAgent | null) {
  const stateAgent = rec(rec(s.chain.state)?.agent);
  return Boolean(agent && stateAgent?.agent_id === agent.id);
}

export function holderBalance(s: SelectorContext, agent: LegacyAgent | null): number | null {
  if (!agent) return null;
  const value = rec(s.chain.state)?.holder_balance;
  if (!chainApplies(s, agent) || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function keyMarketReadbackUnavailable(agent: LegacyAgent | null) {
  return Boolean(agent && agent.keyMarketStatus === "unavailable");
}

export function keyMarketUnavailable(s: SelectorContext, agent: LegacyAgent | null) {
  if (!agent) return true;
  if (chainApplies(s, agent)) return false;
  if (keyMarketReadbackUnavailable(agent)) return true;
  const message = String(s.chain.error || "");
  return /Agent key market does not exist|WasmTrap\(Unreachable\)/i.test(message);
}

export function readAccessApplies(s: SelectorContext, agent: LegacyAgent | null) {
  if (!agent) return false;
  const access = s.chain.readAccess;
  if (!access) return false;
  const boardId = agent.boardId || agent.id;
  const expiresAt = Date.parse(access.expiresAt || "");
  return access.boardId === boardId
    && access.holderAccountId === s.chain.accountId
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now();
}

export function isUnlocked(s: SelectorContext, agent: LegacyAgent | null) {
  if (!agent) return false;
  const balance = holderBalance(s, agent);
  return Boolean(s.chain.accountId && readAccessApplies(s, agent) && (balance === null || balance > 0));
}

export function backendApplies(s: SelectorContext, agent: LegacyAgent | null) {
  if (!agent) return false;
  const backend = rec(s.chain.backend);
  if (!backend) return false;
  const boardId = agent.boardId ?? agent.id;
  const board = rec(backend.board);
  return backend.boardId === boardId || board?.id === boardId || board?.agent_id === agent.id;
}

export function backendBoard(s: SelectorContext, agent: LegacyAgent | null): Rec | null {
  return backendApplies(s, agent) ? rec(rec(s.chain.backend)?.board) : null;
}

export function paperLeaderboardRow(s: SelectorContext, agent: LegacyAgent | null): Rec | null {
  if (!agent) return null;
  const rows = rec(rec(s.chain.backend)?.paperLeaderboard)?.leaderboard;
  if (!Array.isArray(rows)) return null;
  const boardId = agent.boardId ?? agent.id;
  const direct = rows.find((row) => row?.paper_account_id === boardId || row?.paper_account_id === agent.id);
  if (direct) return direct as Rec;
  const uniqueAgentId = s.agents.filter((candidate) => candidate.id === agent.id).length === 1;
  if (!uniqueAgentId) return null;
  return (rows.find((row) => row?.agent_id === agent.id) as Rec) ?? null;
}

export function paperActivity(s: SelectorContext, agent: LegacyAgent | null): Rec | null {
  if (!agent) return null;
  const backend = rec(s.chain.backend);
  if (!backendApplies(s, agent) || !backend?.ok) return null;
  if (!readAccessApplies(s, agent) && !keyMarketUnavailable(s, agent)) return null;
  const activity = rec(backend.paperActivity);
  const account = rec(activity?.account);
  if (!activity?.ok || !account) return null;
  const row = paperLeaderboardRow(s, agent);
  if (row?.paper_account_id && account.id !== row.paper_account_id) return null;
  if (account.agent_id && account.agent_id !== agent.id) return null;
  return activity;
}

export function paperSummary(s: SelectorContext, agent: LegacyAgent | null): Rec {
  return rec(paperActivity(s, agent)?.summary) ?? {};
}

export function paperFills(s: SelectorContext, agent: LegacyAgent | null): unknown[] {
  const fills = paperActivity(s, agent)?.fills;
  return Array.isArray(fills) ? fills : [];
}

export function paperOpenPositions(s: SelectorContext, agent: LegacyAgent | null): Rec[] {
  const positions = paperActivity(s, agent)?.positions;
  return Array.isArray(positions)
    ? (positions.filter(
        (position) =>
          String(rec(position)?.status || "open").toLowerCase() === "open"
          && Math.abs(asNumber(rec(position)?.signed_size) ?? 0) > 0,
      ) as Rec[])
    : [];
}

export function holderCount(s: SelectorContext, agent: LegacyAgent | null): number | null {
  const liveSupply = chainApplies(s, agent) ? asNumber(rec(rec(s.chain.state)?.agent)?.supply) : null;
  if (liveSupply !== null) return liveSupply;
  return agent ? asNumber(agent.holders) : null;
}

export function keyPriceLabel(s: SelectorContext, agent: LegacyAgent | null) {
  const applies = chainApplies(s, agent);
  const liveQuote = applies && s.chain.quoteSide === "buy"
    ? rec(s.chain.quote)
    : applies
      ? rec(rec(s.chain.state)?.next_buy_price)
      : null;
  return liveQuote?.total_cost_near ? nearLabel(liveQuote.total_cost_near) : "--";
}

export function discoveryPnl(agent: LegacyAgent): number | null {
  if (agent.pnl === null || agent.pnl === undefined || (agent.pnl as unknown) === "") return null;
  return asNumber(agent.pnl);
}

export function selectedBackendPnl(s: SelectorContext, agent: LegacyAgent | null): number | null {
  const backend = rec(s.chain.backend);
  if (!backendApplies(s, agent) || !backend?.ok) return null;
  return normalizePct(rec(rec(backend.pnl)?.latest)?.total_pnl_pct);
}

export function backendPnl(s: SelectorContext, agent: LegacyAgent | null): number | null {
  const paper = paperLeaderboardRow(s, agent);
  if (paper) return normalizePct(paper.paper_pnl_pct);
  return selectedBackendPnl(s, agent) ?? (agent ? discoveryPnl(agent) : null);
}
