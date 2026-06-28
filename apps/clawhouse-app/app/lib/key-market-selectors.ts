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
import { asNullableNumber, asNumber, formatBackendTime, formatUsd, nearLabel, normalizePct, shortAccount, titleCase, wholeKeyAmount, yoctoNearLabel } from "./key-market-format";

export type SelectorContext = {
  chain: DemoChainState;
  agents: LegacyAgent[];
  tradeSide: TradeSide;
  activeDiscoveryFilters: Set<string>;
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

function parseJsonField(value: unknown): Rec | null {
  if (!value || typeof value !== "string") return null;
  try {
    return rec(JSON.parse(value));
  } catch {
    return null;
  }
}

export function boardMetadata(s: SelectorContext, agent: LegacyAgent | null): Rec {
  const board = backendBoard(s, agent);
  return rec(board?.metadata) ?? parseJsonField(board?.metadata_json) ?? {};
}

export function isPaperAgent(s: SelectorContext, agent: LegacyAgent | null) {
  if (!agent) return false;
  if (paperLeaderboardRow(s, agent)) return true;
  const text = [agent.id, agent.name, agent.displayName, agent.strategy, agent.desc, (agent as Rec).description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes("paper") || text.includes("hyperliquid");
}

export function backendNetwork(s: SelectorContext, agent: LegacyAgent | null) {
  const board = backendBoard(s, agent);
  const metadata = boardMetadata(s, agent);
  if (isPaperAgent(s, agent)) return "hyperliquid";
  return (metadata.network_id as string) || (metadata.networkId as string) || (board?.chain as string) || "near";
}

export function backendVenue(s: SelectorContext, agent: LegacyAgent | null) {
  const board = backendBoard(s, agent);
  const metadata = boardMetadata(s, agent);
  if (isPaperAgent(s, agent)) return "hyperliquid-paper";
  return (metadata.venue as string) || (metadata.venue_namespace as string)
    || (board?.venue_namespace as string) || "agent-board-ledger";
}

// --- Loading / access state -----------------------------------------------

export function keyStateLoading(s: SelectorContext, agent: LegacyAgent | null) {
  return Boolean(agent && s.chain.stateLoading);
}

export function keyStateInitialLoading(s: SelectorContext, agent: LegacyAgent | null) {
  return keyStateLoading(s, agent) && !chainApplies(s, agent);
}

export function keyStateUnavailable(s: SelectorContext, agent: LegacyAgent | null) {
  return Boolean(agent && s.chain.error && !chainApplies(s, agent));
}

export function roomAccessLoading(s: SelectorContext, agent: LegacyAgent | null): boolean {
  if (!agent || !s.chain.accountId) return false;
  if (readAccessApplies(s, agent)) return false;
  const balance = holderBalance(s, agent);
  return Boolean(
    s.chain.readAccessLoading
    || s.chain.backendLoading
    || keyStateInitialLoading(s, agent)
    || (keyStateUnavailable(s, agent) && !readAccessApplies(s, agent))
    || (s.chain.backend && !backendApplies(s, agent))
    || !s.chain.backend
    || (s.chain.pending && (s.chain.phase === "authenticating" || s.chain.phase === "refreshing"))
    || (balance !== null && balance > 0 && !readAccessApplies(s, agent) && !s.chain.readAccessError),
  );
}

export function paperActivityReadError(s: SelectorContext, agent: LegacyAgent | null): string | null {
  const backend = rec(s.chain.backend);
  if (!agent || !backendApplies(s, agent) || !backend?.ok) return null;
  const error = rec(backend.errors)?.paperActivity;
  return typeof error === "string" && error.trim() ? error.trim() : null;
}

export function paperActivityLoading(s: SelectorContext, agent: LegacyAgent | null): boolean {
  if (!agent) return false;
  return Boolean(
    s.chain.backendLoading
    || (!keyMarketUnavailable(s, agent) && keyStateInitialLoading(s, agent))
    || (!keyMarketUnavailable(s, agent) && keyStateUnavailable(s, agent) && !readAccessApplies(s, agent))
    || (!keyMarketUnavailable(s, agent) && s.chain.readAccessLoading)
    || (!keyMarketUnavailable(s, agent) && roomAccessLoading(s, agent))
    || (readAccessApplies(s, agent) && !paperActivity(s, agent))
    || !s.chain.backend
    || (s.chain.backend && !backendApplies(s, agent)),
  );
}

export type AccessState = { tone: string; title: string; message: string; badge: string; loading?: boolean };

export function paperActivityAccessState(s: SelectorContext, agent: LegacyAgent | null): AccessState | null {
  const error = paperActivityReadError(s, agent);
  if (paperActivityLoading(s, agent)) {
    return { tone: "idle", title: "Room data loading", message: "Loading holder-gated paper activity.", badge: "Loading", loading: true };
  }
  if (!error || !/read access/i.test(error)) return null;
  if (!s.chain.accountId) {
    return {
      tone: "wallet",
      title: "Connect Wallet",
      message: "Connect Wallet to check key ownership and load holder-gated paper activity.",
      badge: "Wallet",
    };
  }
  const balance = holderBalance(s, agent);
  if (balance === null) {
    return { tone: "idle", title: "Room data loading", message: "Loading holder-gated paper activity.", badge: "Loading", loading: true };
  }
  if (balance > 0) {
    if (roomAccessLoading(s, agent)) {
      return { tone: "idle", title: "Room data loading", message: "Loading holder-gated paper activity.", badge: "Loading", loading: true };
    }
    return {
      tone: "idle",
      title: "Room access unavailable",
      message: "Holder access was not available for this board yet. Refresh or reconnect the wallet session.",
      badge: "Access",
    };
  }
  return {
    tone: "wallet",
    title: "Key required",
    message: "Buy 1 key to unlock this agent's paper trading chart, room events, and positions.",
    badge: "Gate: 1 key",
  };
}

export function maxBuyApplies(s: SelectorContext, agent: LegacyAgent | null) {
  if (!agent) return false;
  const maxBuy = rec(s.chain.maxBuy);
  return Boolean(maxBuy && maxBuy.agent_id === agent.id && maxBuy.account_id === s.chain.accountId);
}

export function buyMaxAmount(s: SelectorContext, agent: LegacyAgent | null): number | null {
  if (!maxBuyApplies(s, agent)) return null;
  const amount = rec(rec(s.chain.maxBuy)?.maxBuy)?.amount;
  const numeric = Math.floor(Number(amount));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function maxAmountForSide(s: SelectorContext, agent: LegacyAgent | null): number | null {
  if (s.tradeSide === "sell") return wholeKeyAmount(holderBalance(s, agent));
  return buyMaxAmount(s, agent);
}

export function quoteApplies(s: SelectorContext, agent: LegacyAgent | null) {
  return Boolean(agent && chainApplies(s, agent) && s.chain.quoteSide === s.tradeSide && s.chain.quote);
}

export function quoteLoading(s: SelectorContext) {
  return Boolean(s.chain.quoteLoading || s.chain.phase === "quoting");
}

export function quoteInitialLoading(s: SelectorContext, agent: LegacyAgent | null) {
  return quoteLoading(s) && !quoteApplies(s, agent);
}

export function statusButtonText(s: SelectorContext) {
  switch (s.chain.phase) {
    case "connecting": return "Opening wallet...";
    case "authenticating": return "Confirm session...";
    case "quoting": return "Refreshing quote...";
    case "signing": return "Confirm in wallet...";
    case "refreshing": return "Refreshing balance...";
    default: return "Working...";
  }
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

export function paperOrders(s: SelectorContext, agent: LegacyAgent | null): Rec[] {
  const orders = paperActivity(s, agent)?.orders;
  return Array.isArray(orders) ? (orders as Rec[]) : [];
}

function hyperliquidPriceRows(s: SelectorContext): Rec[] {
  const prices = rec(rec(s.chain.backend)?.hyperliquidPrices)?.prices;
  return Array.isArray(prices) ? (prices as Rec[]) : [];
}

function positionMarkPx(s: SelectorContext, position: Rec): number | null {
  const direct = asNullableNumber(position?.mark_px ?? position?.markPx ?? position?.current_px ?? position?.currentPx);
  if (direct !== null) return direct;
  const coin = String(position?.coin || "").toUpperCase();
  const row = hyperliquidPriceRows(s).find((price) => String(price?.coin || "").toUpperCase() === coin);
  return asNullableNumber(row?.mark_px ?? row?.markPx);
}

export function positionPnlUsd(s: SelectorContext, position: Rec): number | null {
  const direct = [
    position?.unrealized_pnl_usd,
    position?.unrealizedPnlUsd,
    position?.current_pnl_usd,
    position?.currentPnlUsd,
    position?.pnl_usd,
    position?.pnlUsd,
  ].map(asNullableNumber).find((value) => value !== null);
  if (direct !== undefined) return direct;
  const mark = positionMarkPx(s, position);
  const entry = asNullableNumber(position?.entry_px);
  const size = asNullableNumber(position?.signed_size);
  if (mark === null || entry === null || size === null) return null;
  return (mark - entry) * size;
}

export function rowTimestamp(row: unknown): number {
  const r = rec(row);
  return Date.parse(String(r?.observed_at || r?.reported_at || r?.created_at || ""));
}

export function sortedByObservedAt<T>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const left = rowTimestamp(a);
    const right = rowTimestamp(b);
    return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
  });
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

// --- Discovery list (filter / sort / row readout) -------------------------

export function keyTradingEnabled(s: SelectorContext, agent: LegacyAgent | null) {
  if (!agent) return false;
  if (chainApplies(s, agent)) {
    return !keyMarketUnavailable(s, agent) && rec(rec(s.chain.state)?.agent)?.agent_id === agent.id;
  }
  return agent.keyMarketStatus === "available" && agent.keyMarketAgentId === agent.id;
}

function latestPaperActivityTimestamp(s: SelectorContext, agent: LegacyAgent): number | null {
  const times: number[] = [];
  const row = paperLeaderboardRow(s, agent);
  const summary = paperSummary(s, agent);
  [
    row?.created_at,
    summary.latest_fill_at,
    summary.latest_order_at,
    summary.latest_risk_at,
    (paperActivity(s, agent)?.latest_risk as Rec | undefined)?.created_at,
  ].forEach((value) => {
    const parsed = Date.parse(String(value || ""));
    if (Number.isFinite(parsed)) times.push(parsed);
  });
  return times.length ? Math.max(...times) : null;
}

export function hasRecentPaperActivity(s: SelectorContext, agent: LegacyAgent, hours = 24) {
  const timestamp = latestPaperActivityTimestamp(s, agent);
  if (timestamp === null || !Number.isFinite(timestamp)) return false;
  return timestamp >= Date.now() - hours * 60 * 60 * 1000;
}

export function agentMatchesDiscoveryFilters(s: SelectorContext, agent: LegacyAgent) {
  const f = s.activeDiscoveryFilters;
  if (f.has("last24h") && !hasRecentPaperActivity(s, agent)) return false;
  if (f.has("keyEnabled") && !keyTradingEnabled(s, agent)) return false;
  if (f.has("openPosition") && paperOpenPositions(s, agent).length === 0) return false;
  if (f.has("positivePnl") && !((backendPnl(s, agent) ?? 0) > 0)) return false;
  return true;
}

export function activeDiscoveryFilterLabels(filters: Set<string>) {
  const labels: Record<string, string> = {
    last24h: "Last 24h active",
    keyEnabled: "Key trading enabled",
    openPosition: "Open position",
    positivePnl: "Positive P&L",
  };
  return [...filters].map((filter) => labels[filter]).filter(Boolean);
}

function paperLeaderboardRows(s: SelectorContext): unknown[] | null {
  const rows = rec(rec(s.chain.backend)?.paperLeaderboard)?.leaderboard;
  return Array.isArray(rows) ? rows : null;
}

function hasPaperActivity(s: SelectorContext, agent: LegacyAgent) {
  return Boolean(paperLeaderboardRow(s, agent));
}

export function visibleDiscoveryAgents(s: SelectorContext): LegacyAgent[] {
  const rows = paperLeaderboardRows(s);
  const base = !rows ? [...s.agents] : s.agents.filter((a) => hasPaperActivity(s, a));
  const visible = base.length ? base : [...s.agents];
  if (!s.activeDiscoveryFilters.size) return visible;
  return visible.filter((a) => agentMatchesDiscoveryFilters(s, a));
}

export function agentRowPnl(s: SelectorContext, agent: LegacyAgent): number | null {
  const paper = paperLeaderboardRow(s, agent);
  return paper ? normalizePct(paper.paper_pnl_pct) : null;
}

export function sortedAgents(s: SelectorContext): LegacyAgent[] {
  return visibleDiscoveryAgents(s).slice().sort((a, b) => {
    const aValue = agentRowPnl(s, a);
    const bValue = agentRowPnl(s, b);
    if (aValue === null && bValue !== null) return 1;
    if (aValue !== null && bValue === null) return -1;
    if (aValue !== null && bValue !== null && aValue !== bValue) return bValue - aValue;
    return ((a.discoveryIndex as number) ?? 0) - ((b.discoveryIndex as number) ?? 0);
  });
}

export type AgentRowReadout = { primary: string; secondary: string; tone: string };

export function agentRowReadout(s: SelectorContext, agent: LegacyAgent): AgentRowReadout {
  const paper = paperLeaderboardRow(s, agent);
  if (paper) {
    const freshness = String(paper.stale_data_status || "").replace(/_/g, " ");
    const updated = formatBackendTime(paper.created_at);
    const liquidations = asNumber(paper.liquidation_count) ?? 0;
    return {
      primary: `Equity ${formatUsd(paper.equity_usd)}`,
      secondary: `${freshness || "paper"} · ${updated}${liquidations > 0 ? ` · ${liquidations} liq` : ""}`,
      tone: freshness.includes("stale") ? "warn" : "fresh",
    };
  }
  const holders = holderCount(s, agent);
  return {
    primary: keyPriceLabel(s, agent),
    secondary: holders === null ? "key market checking" : `${holders} key holders`,
    tone: "idle",
  };
}

// --- Key trading activity -------------------------------------------------

export type KeyTrade = Rec & {
  side?: string;
  amount?: string;
  trader_id?: string;
  tx_hash?: string;
  network_id?: string;
};

export type KeyActivityRow = {
  title: string;
  amountLabel: string;
  traderLabel: string;
  traderUrl: string | null;
  side: string;
  linkUrl: string | null;
  tone: "buy" | "sell";
};

export function keyActivityTrades(s: SelectorContext, agent: LegacyAgent | null): KeyTrade[] {
  const activity = rec(s.chain.activity);
  if (!agent || !activity || activity.agent_id !== agent.id) return [];
  return Array.isArray(activity.trades) ? (activity.trades as KeyTrade[]) : [];
}

export function keyActivityLoading(s: SelectorContext, agent: LegacyAgent | null) {
  return Boolean(agent && s.chain.activityLoading);
}

export function keyActivityInitialLoading(s: SelectorContext, agent: LegacyAgent | null) {
  return keyActivityLoading(s, agent) && !keyActivityTrades(s, agent).length;
}

function nearBlocksHost(networkId: unknown) {
  return networkId === "mainnet" ? "nearblocks.io" : "testnet.nearblocks.io";
}

export function keyTradeValueLabel(trade: KeyTrade) {
  const rawValue = trade.side === "sell" ? trade.payout : trade.total_cost;
  return yoctoNearLabel(rawValue || trade.price);
}

export function keyTradeExplorerUrl(trade: KeyTrade) {
  if (!trade.tx_hash) return null;
  return `https://${nearBlocksHost(trade.network_id)}/txns/${encodeURIComponent(String(trade.tx_hash))}`;
}

export function keyTradeAccountUrl(trade: KeyTrade) {
  if (!trade.trader_id) return null;
  return `https://${nearBlocksHost(trade.network_id)}/address/${encodeURIComponent(String(trade.trader_id))}`;
}

export function keyActivityRows(s: SelectorContext, agent: LegacyAgent | null): KeyActivityRow[] {
  return keyActivityTrades(s, agent).map((trade) => ({
    title: titleCase(trade.side),
    amountLabel: `${trade.amount} key${trade.amount === "1" ? "" : "s"}`,
    traderLabel: shortAccount(String(trade.trader_id ?? "")),
    traderUrl: keyTradeAccountUrl(trade),
    side: keyTradeValueLabel(trade),
    linkUrl: keyTradeExplorerUrl(trade),
    tone: trade.side === "sell" ? "sell" : "buy",
  }));
}
