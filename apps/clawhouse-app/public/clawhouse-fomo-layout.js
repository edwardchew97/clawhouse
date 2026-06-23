const query = new URLSearchParams(window.location.search);
const requestedAgentId = query.get("agent") || "";
const DEFAULT_AGENT_BANNER_URL = "/agent-banners/default-agent-banner.png";
let agents = [
  normalizeDiscoveryAgent({
    id: "terminal_chad6",
    name: "terminal_chad6",
    initials: "TC",
    strategy: "terminal_chad6 / key-market and paper trading agent",
    description: "Reads key-market, backend ledger, and paper-trading data from live APIs only.",
    gate: "open",
  })
];
let discoveryLoading = true;
document.body.classList.add("motion-prep");

let selectedId = requestedAgentId || agentSelectionKey(agents[0]);
if (!agents.some((agent) => agentMatchesSelection(agent, selectedId))) selectedId = agentSelectionKey(agents[0]);
let tradeSide = "buy";
let agentSort = "pnl";
let activeChartRange = "24h";
let activeEventId = null;
let chainState = {
  accountId: null,
  contractId: null,
  networkId: null,
  pending: false,
  phase: "idle",
  lastTxHash: null,
  explorerUrl: null,
  state: null,
  quote: null,
  quoteSide: null,
  protection: null,
  activity: null,
  activityError: null,
  backend: null,
  readAccess: null,
  readAccessError: null,
  error: null
};

const TICKER_PX_PER_SECOND = 18;
const BACKEND_REFRESH_MS = 60_000;
const CHART_RANGES = {
  "1h": { label: "1H", hours: 1 },
  "24h": { label: "24H", hours: 24 },
  "7d": { label: "7D", hours: 24 * 7 },
  all: { label: "ALL", hours: null },
};

const byId = (id) => document.getElementById(id);
function agentSelectionKey(agent) {
  return agent.boardId || agent.id;
}

function agentMatchesSelection(agent, value) {
  return agentSelectionKey(agent) === value || agent.id === value;
}

function resolveSelectedId(value) {
  const match = agents.find((agent) => agentSelectionKey(agent) === value) || agents.find((agent) => agent.id === value);
  return match ? agentSelectionKey(match) : agentSelectionKey(agents[0]);
}

const selectedAgent = () => agents.find((agent) => agentSelectionKey(agent) === selectedId) || agents.find((agent) => agent.id === selectedId) || agents[0];
const chainApplies = (agent) => chainState.state?.agent?.agent_id === agent.id;
const chainBalance = (agent) => {
  const value = chainState.state?.holder_balance;
  if (!chainApplies(agent) || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const holderBalance = (agent) => chainBalance(agent);
const readAccessApplies = (agent) => {
  const access = chainState.readAccess;
  if (!access) return false;
  const boardId = agent.boardId || agent.id;
  const expiresAt = Date.parse(access.expiresAt || "");
  return access.boardId === boardId
    && access.holderAccountId === chainState.accountId
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now();
};
const isUnlocked = (agent) => {
  const balance = holderBalance(agent);
  return Boolean(chainState.accountId && balance !== null && balance > 0 && readAccessApplies(agent));
};

function dispatchUiEvent(name) {
  window.dispatchEvent(new CustomEvent(name));
}

function normalizeDiscoveryAgent(agent = {}, index = 0) {
  const keyStateAgent = agent.keyMarket?.data?.agent || {};
  const pnlLatest = agent.pnl?.data?.latest || {};
  const id = String(agent.id || keyStateAgent.agent_id || "terminal_chad6");
  const name = String(agent.name || keyStateAgent.name || id);
  const displayName = displayNameForAgent(name, id);
  return {
    id,
    name,
    displayName,
    initials: agent.initials || initialsFor(displayName),
    color: "#3c4044",
    bannerUrl: agent.bannerUrl || agent.banner_url || DEFAULT_AGENT_BANNER_URL,
    strategy: agent.strategy || `${id} / key-market and paper trading agent`,
    desc: agent.description || "Reads key-market, backend ledger, and paper-trading data from live APIs only.",
    holders: asNumber(keyStateAgent.supply),
    gate: agent.gate || "open",
    last: agent.status === "available" ? "live read" : "checking",
    boardId: agent.boardId || agent.board_id || id,
    pnl: normalizePct(pnlLatest.total_pnl_pct),
    discoveryIndex: index,
  };
}

function initialsFor(value) {
  const parts = String(value || "").split(/[_\-.]+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || String(value || "AG").slice(0, 2).toUpperCase();
}

function displayNameForAgent(name, id) {
  const value = String(name || id || "Agent").trim();
  if (!value) return "Agent";
  if (!isIdentifierLike(value) && value !== id) return value;

  const words = value
    .split(/[\s_\-./]+/g)
    .flatMap(splitLettersAndNumbers)
    .filter((word) => word && !isMachineToken(word))
    .map(titleWord);

  return words.length ? words.join(" ") : shortHash(value);
}

function isIdentifierLike(value) {
  const text = String(value || "");
  return /[_\-.]/.test(text)
    || /\d/.test(text)
    || text === text.toLowerCase()
    || /^[a-z0-9]+$/i.test(text);
}

function splitLettersAndNumbers(value) {
  return String(value || "").match(/[a-z]*\d+[a-z]*|[a-z]+|\d+/gi) ?? [];
}

function isMachineToken(value) {
  const token = String(value || "").toLowerCase();
  if (/^\d+$/.test(token)) return true;
  if (/^20\d{6,}/.test(token)) return true;
  if (/^\d{6,}t?\d*z?$/.test(token)) return true;
  if (/^[a-f0-9]{4,}$/.test(token) && /[a-f]/.test(token) && /\d/.test(token)) return true;
  return false;
}

function titleWord(value) {
  const token = String(value || "").toLowerCase();
  const acronyms = {
    ai: "AI",
    api: "API",
    cm: "CM",
    e2e: "E2E",
    ft: "FT",
    id: "ID",
    ll: "LL",
    near: "NEAR",
    pnl: "P&L",
    tc: "TC",
  };
  if (acronyms[token]) return acronyms[token];
  if (token === "clawhouse") return "ClawHouse";
  if (token === "ironclaw") return "IronClaw";
  return `${token.charAt(0).toUpperCase()}${token.slice(1)}`;
}

function agentTitle(agent) {
  return agent.displayName || agent.name;
}

function setChainState(nextState) {
  chainState = { ...chainState, ...nextState };
  render();
}

function clearQuote() {
  chainState = {
    ...chainState,
    quote: null,
    quoteSide: null,
    protection: null,
    error: null
  };
}

function hashName(name) {
  return [...name].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
}

function agentIcon(agent) {
  const hash = hashName(agentTitle(agent));
  const accents = ["#63d8bd", "#69a7f5", "#e2b35e", "#76c989", "#e48169", "#aab6c5"];
  const accent = accents[hash % accents.length];
  const accentTwo = accents[(hash >>> 5) % accents.length];
  const rotation = hash % 360;
  const cut = 19 + (hash % 7);
  const id = `agent-${hash.toString(36)}`;
  const label = agentTitle(agent).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  return `
    <svg class="agent-icon" viewBox="0 0 64 64" role="img" aria-label="${label} generated icon">
      <defs>
        <radialGradient id="${id}-bg" cx="30%" cy="20%" r="85%">
          <stop offset="0" stop-color="#353a40"/>
          <stop offset="0.48" stop-color="#181b1f"/>
          <stop offset="1" stop-color="#08090b"/>
        </radialGradient>
        <linearGradient id="${id}-metal" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${accent}" stop-opacity=".95"/>
          <stop offset="1" stop-color="${accentTwo}" stop-opacity=".38"/>
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="31" fill="url(#${id}-bg)" stroke="#fff" stroke-opacity=".15"/>
      <g transform="rotate(${rotation} 32 32)">
        <path d="M32 8 L${56 - cut / 3} ${cut} L56 42 L32 56 L8 42 L${8 + cut / 3} ${cut} Z" fill="none" stroke="url(#${id}-metal)" stroke-width="1.5" stroke-opacity=".8"/>
        <circle cx="32" cy="9" r="2" fill="${accent}"/>
        <circle cx="53" cy="39" r="1.5" fill="${accentTwo}"/>
      </g>
      <circle cx="32" cy="32" r="18" fill="#0d0f12" stroke="#fff" stroke-opacity=".1"/>
      <text x="32" y="36.5" text-anchor="middle" fill="#f7f8fa" font-family="system-ui, sans-serif" font-size="13" font-weight="800" letter-spacing=".7">${agent.initials}</text>
      <path d="M20 45 Q32 51 44 45" fill="none" stroke="${accent}" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>
    </svg>`;
}

function money(value, suffix = " tNEAR") {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(2)}${suffix}`;
}

function nearLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric.toFixed(numeric < 1 ? 5 : 2)} tNEAR`;
}

function keyPriceLabel(agent) {
  const liveQuote = chainApplies(agent) && chainState.quoteSide === "buy"
    ? chainState.quote
    : chainApplies(agent)
      ? chainState.state?.next_buy_price
      : null;
  return liveQuote?.total_cost_near ? nearLabel(liveQuote.total_cost_near) : "--";
}

function keyAmountLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${numeric} Key`;
}

function averageKeyPriceLabel(totalNear, amount) {
  const numericTotal = Number(totalNear);
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericTotal) || !Number.isFinite(numericAmount) || numericAmount <= 0) return "--";
  return nearLabel(numericTotal / numericAmount);
}

function holderCount(agent) {
  const liveSupply = chainApplies(agent) ? asNumber(chainState.state?.agent?.supply) : null;
  if (liveSupply !== null) return liveSupply;
  return asNumber(agent.holders);
}

function shortAccount(accountId) {
  return accountId.length > 18 ? `${accountId.slice(0, 9)}...${accountId.slice(-6)}` : accountId;
}

function shortHash(value) {
  const text = String(value || "");
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePct(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = asNumber(value);
  if (numeric === null) return null;
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
}

function backendApplies(agent) {
  const backend = chainState.backend;
  if (!backend) return false;
  const boardId = agent.boardId ?? agent.id;
  const board = backend.board;
  return backend.boardId === boardId || board?.id === boardId || board?.agent_id === agent.id;
}

function backendBoard(agent) {
  return backendApplies(agent) ? chainState.backend?.board ?? null : null;
}

function parseJsonField(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function boardMetadata(agent) {
  const board = backendBoard(agent);
  return board?.metadata ?? parseJsonField(board?.metadata_json) ?? {};
}

function isPaperAgent(agent) {
  if (paperLeaderboardRow(agent)) return true;
  const text = [
    agent?.id,
    agent?.name,
    agent?.displayName,
    agent?.strategy,
    agent?.desc,
    agent?.description,
  ].filter(Boolean).join(" ").toLowerCase();
  return text.includes("paper") || text.includes("hyperliquid");
}

function backendNetwork(agent) {
  const board = backendBoard(agent);
  const metadata = boardMetadata(agent);
  if (isPaperAgent(agent)) return "hyperliquid";
  return metadata.network_id || metadata.networkId || board?.chain || "near";
}

function backendVenue(agent) {
  const board = backendBoard(agent);
  const metadata = boardMetadata(agent);
  if (isPaperAgent(agent)) return "hyperliquid-paper";
  return metadata.venue || metadata.venue_namespace || board?.venue_namespace || "agent-board-ledger";
}

function backendErrorMessage() {
  const errors = chainState.backend?.errors;
  return errors?.board || errors?.events || errors?.pnl || chainState.backend?.error || "Staging backend is unavailable.";
}

function backendEvents(agent = selectedAgent()) {
  if (!backendApplies(agent) || !chainState.backend?.ok) return [];
  const events = chainState.backend?.events?.events;
  return Array.isArray(events) ? events : [];
}

function paperLeaderboardRow(agent) {
  const rows = chainState.backend?.paperLeaderboard?.leaderboard;
  if (!Array.isArray(rows)) return null;
  const boardId = agent.boardId ?? agent.id;
  const direct = rows.find((row) => row?.paper_account_id === boardId || row?.paper_account_id === agent.id);
  if (direct) return direct;
  const uniqueAgentId = agents.filter((candidate) => candidate.id === agent.id).length === 1;
  if (!uniqueAgentId) return null;
  return rows.find((row) => row?.agent_id === agent.id) ?? null;
}

function paperActivity(agent) {
  if (!backendApplies(agent) || !chainState.backend?.ok) return null;
  const activity = chainState.backend?.paperActivity;
  if (!activity?.ok || !activity.account) return null;
  const row = paperLeaderboardRow(agent);
  if (row?.paper_account_id && activity.account.id !== row.paper_account_id) return null;
  if (activity.account.agent_id && activity.account.agent_id !== agent.id) return null;
  return activity;
}

function paperOrders(agent) {
  const orders = paperActivity(agent)?.orders;
  return Array.isArray(orders) ? orders : [];
}

function paperFills(agent) {
  const fills = paperActivity(agent)?.fills;
  return Array.isArray(fills) ? fills : [];
}

function paperPositions(agent) {
  const positions = paperActivity(agent)?.positions;
  return Array.isArray(positions) ? positions : [];
}

function paperRiskSnapshots(agent) {
  const snapshots = paperActivity(agent)?.risk_snapshots;
  return Array.isArray(snapshots) ? snapshots : [];
}

function paperSummary(agent) {
  return paperActivity(agent)?.summary ?? {};
}

function discoveryPnl(agent) {
  if (agent.pnl === null || agent.pnl === undefined || agent.pnl === "") return null;
  return asNumber(agent.pnl);
}

function selectedBackendPnl(agent) {
  if (!backendApplies(agent) || !chainState.backend?.ok) return null;
  return normalizePct(chainState.backend?.pnl?.latest?.total_pnl_pct);
}

function agentRowPnl(agent) {
  const paper = paperLeaderboardRow(agent);
  if (paper) return normalizePct(paper.paper_pnl_pct);
  return null;
}

function backendPnl(agent) {
  const paper = paperLeaderboardRow(agent);
  if (paper) return normalizePct(paper.paper_pnl_pct);
  return selectedBackendPnl(agent) ?? discoveryPnl(agent);
}

function backendPnlSource(agent) {
  return paperLeaderboardRow(agent) ? "Paper P&L" : "Backend P&L";
}

function sortedAgents() {
  const sorted = [...agents];
  sorted.sort((a, b) => {
    const aValue = agentSort === "events" ? agentEventCount(a) : agentRowPnl(a);
    const bValue = agentSort === "events" ? agentEventCount(b) : agentRowPnl(b);
    if (aValue === null && bValue !== null) return 1;
    if (aValue !== null && bValue === null) return -1;
    if (aValue !== null && bValue !== null && aValue !== bValue) return bValue - aValue;
    return (a.discoveryIndex ?? 0) - (b.discoveryIndex ?? 0);
  });
  return sorted;
}

function agentEventCount(agent) {
  return chartModel(agent).events.length;
}

function formatBackendTime(value) {
  if (!value) return "no timestamp";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return String(value);
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(parsed));
}

function titleCase(value) {
  return String(value || "event")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatBackendAmount(amount, asset) {
  const numeric = asNumber(amount);
  if (numeric === null) return asset || "";
  const value = numeric >= 100 ? numeric.toFixed(0) : numeric >= 1 ? numeric.toFixed(2) : numeric.toFixed(5);
  return `${value}${asset ? ` ${asset}` : ""}`;
}

function formatUsd(value) {
  const numeric = asNumber(value);
  if (numeric === null) return "--";
  return `$${numeric.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatUtcTime(value) {
  if (!value) return "--";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return String(value);
  return new Date(parsed).toISOString().replace(".000Z", "Z");
}

function compactNumber(value, digits = 4) {
  const numeric = asNumber(value);
  if (numeric === null) return "--";
  if (Math.abs(numeric) >= 100) return numeric.toFixed(0);
  if (Math.abs(numeric) >= 1) return numeric.toFixed(2);
  return numeric.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

function formatBackendAction(event) {
  if (isPaperTradeEvent(event) && event.coin && event.size) {
    const action = titleCase(event.side || "order");
    const amount = formatBackendAmount(event.size, event.coin);
    if (event.status === "rejected" || event.reject_reason) {
      return `Rejected ${action.toLowerCase()} ${amount}: ${event.reject_reason || "order rejected"}`;
    }
    const px = asNumber(event.avg_fill_px);
    return px === null ? `${action} ${amount}` : `${action} ${amount} @ ${formatUsd(px)}`;
  }
  const input = formatBackendAmount(event.amount_in, event.asset_in);
  const output = formatBackendAmount(event.amount_out, event.asset_out);
  if (input && output) return `${input} -> ${output}`;
  if (output) return `Received ${output}`;
  if (input) return `Spent ${input}`;
  return titleCase(event.event_type || event.status_claim || "agent event");
}

function formatBackendSummary(event, agent) {
  const action = formatBackendAction(event);
  const status = event.status_claim ? `Status: ${event.status_claim}.` : "";
  const venue = `${eventNetwork(event, agent)} / ${eventVenue(event, agent)}`;
  const reference = eventReferenceLabel(event);
  return [action, status, venue, reference].filter(Boolean).join(" ");
}

function backendTxUrl(event, agent) {
  if (isPaperTradeEvent(event)) return null;
  if (!event.tx_hash) return null;
  const network = String(eventNetwork(event, agent)).toLowerCase();
  const host = network.includes("testnet") ? "testnet.nearblocks.io" : "nearblocks.io";
  return `https://${host}/txns/${encodeURIComponent(event.tx_hash)}`;
}

function eventMetadata(event) {
  return event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
}

function isPaperTradeEvent(event) {
  const metadata = eventMetadata(event);
  const source = String(metadata.source || "").toLowerCase();
  return event?.event_type === "paper_trade"
    || String(event?.intent_id || "").startsWith("paper_")
    || source.includes("paper")
    || metadata.venue === "hyperliquid-paper"
    || Boolean(metadata.market_type || metadata.marketType);
}

function eventNetwork(event, agent) {
  const metadata = eventMetadata(event);
  if (isPaperTradeEvent(event)) return "hyperliquid";
  return metadata.network_id || metadata.networkId || backendNetwork(agent);
}

function eventVenue(event, agent) {
  const metadata = eventMetadata(event);
  if (isPaperTradeEvent(event)) return "hyperliquid-paper";
  return metadata.venue || metadata.venue_namespace || backendVenue(agent);
}

function eventReferenceLabel(event) {
  const paper = isPaperTradeEvent(event);
  if (paper && event.intent_id) return `Paper order ${shortHash(event.intent_id)}.`;
  if (paper && event.tx_hash) return `Paper receipt ${shortHash(event.tx_hash)}.`;
  if (event.tx_hash) return `Tx ${shortHash(event.tx_hash)}.`;
  if (!event.intent_id) return "";
  return `Intent ${shortHash(event.intent_id)}.`;
}

function normalizeBackendEvent(event, index, agent, valueIndex, point) {
  const status = event.status_claim || event.event_type || "event";
  const metadata = eventMetadata(event);
  return {
    id: event.id || event.client_event_id || event.tx_hash || `backend-event-${index}`,
    index: valueIndex,
    timeValue: point?.time ?? null,
    chartValue: point?.value ?? null,
    title: metadata.title || titleCase(event.event_type || status),
    label: status,
    time: formatBackendTime(event.reported_at || event.created_at),
    action: formatBackendAction(event),
    move: status,
    summary: formatBackendSummary(event, agent),
    reason: event.reason || "No reasoning was supplied by the backend for this event.",
    sources: backendEventSources(event, agent),
    raw: event,
    backend: true,
  };
}

function normalizePaperOrderEvent(order, index, agent, valueIndex, point) {
  const status = order.status || "paper_order";
  const coin = String(order.coin || "").toUpperCase();
  const side = String(order.side || "order").toLowerCase();
  const raw = {
    ...order,
    event_type: "paper_trade",
    status_claim: status,
    metadata: {
      source: "paper_orders",
      venue: "hyperliquid-paper",
      market_type: order.market_type,
      coin,
      side,
      leverage: order.leverage,
    },
  };
  const title = `${coin || "Paper"} ${titleCase(side)}`;
  const action = formatBackendAction(raw);
  const reject = order.reject_reason ? ` Reject: ${order.reject_reason}.` : "";
  return {
    id: order.id || `paper-order-${index}`,
    index: valueIndex,
    timeValue: point?.time ?? null,
    chartValue: point?.value ?? null,
    title,
    label: status,
    time: formatBackendTime(order.created_at),
    action,
    move: status,
    summary: `${action}. Backend paper order status: ${status}.${reject}`,
    reason: order.reason || order.reject_reason || "No paper order reason was supplied.",
    sources: backendEventSources(raw, agent),
    raw,
    backend: true,
    public: true,
  };
}

function backendEventSources(event, agent) {
  const sources = [
    `network: ${eventNetwork(event, agent)}`,
    `venue: ${eventVenue(event, agent)}`,
  ];
  if (event.status_claim) sources.push(`status_claim: ${event.status_claim}`);
  if (event.tx_hash) sources.push(`tx_hash: ${event.tx_hash}`);
  if (event.intent_id) sources.push(`${isPaperTradeEvent(event) ? "paper_order_id" : "intent_id"}: ${event.intent_id}`);
  if (event.client_event_id) sources.push(`client_event_id: ${event.client_event_id}`);
  if (event.wallet_address) sources.push(`wallet: ${event.wallet_address}`);
  if (event.metadata?.source) sources.push(`source: ${event.metadata.source}`);
  return sources;
}

function backendBalanceChanges(agent) {
  if (!backendApplies(agent) || !chainState.backend?.ok) return [];
  const changes = chainState.backend?.balanceChanges?.balance_changes;
  return Array.isArray(changes) ? changes : [];
}

function backendPrices(agent) {
  if (!backendApplies(agent) || !chainState.backend?.ok) return [];
  const prices = chainState.backend?.prices?.prices;
  return Array.isArray(prices) ? prices : [];
}

function sortedByObservedAt(rows) {
  return rows.slice().sort((a, b) => {
    const left = rowTimestamp(a);
    const right = rowTimestamp(b);
    return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
  });
}

function rowTimestamp(row) {
  return Date.parse(row?.observed_at || row?.reported_at || row?.created_at || "");
}

function chartRangeMeta(range = activeChartRange) {
  return CHART_RANGES[range] || CHART_RANGES["24h"];
}

function filterRowsForChartRange(rows, range = activeChartRange) {
  const meta = chartRangeMeta(range);
  if (!meta.hours) return rows;
  const timestamps = rows.map(rowTimestamp).filter(Number.isFinite);
  if (!timestamps.length) return rows;
  const cutoff = Math.max(...timestamps) - meta.hours * 60 * 60 * 1000;
  return rows.filter((row) => {
    const timestamp = rowTimestamp(row);
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
}

function normalizeSeries(values) {
  const numeric = values.map(asNumber).filter((value) => value !== null);
  if (numeric.length < 2) return numeric;
  const first = numeric.find((value) => value !== 0) ?? numeric[0];
  if (!first) return numeric;
  return numeric.map((value) => ((value - first) / Math.abs(first)) * 100);
}

function paperNetWorthValues(rows) {
  const equities = rows.map((row) => asNumber(row.equity_usd));
  if (equities.some((value) => value === null)) return [];
  return equities;
}

function firstFilledPaperOrder(orderRows) {
  return orderRows
    .filter((order) => String(order?.status || "").toLowerCase() === "filled")
    .sort((left, right) => {
      const leftTime = rowTimestamp(left);
      const rightTime = rowTimestamp(right);
      return (Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER) -
        (Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER);
    })[0] ?? null;
}

function isFailedPaperOrder(order) {
  const status = String(order?.status || "").toLowerCase();
  return status.includes("reject") ||
    status.includes("fail") ||
    status.includes("error") ||
    status.includes("refund") ||
    status.includes("cancel");
}

function visiblePaperOrders(orderRows) {
  return orderRows.filter((order) => !isFailedPaperOrder(order));
}

function paperChartPointRows(activity, riskRows, orderRows) {
  const startingBalance = asNumber(activity?.account?.starting_balance_usd);
  const accountCreatedAt = activity?.account?.created_at;
  const accountTime = rowTimestamp(activity?.account);
  if (startingBalance === null || !Number.isFinite(accountTime)) return riskRows;

  const firstFilledOrder = firstFilledPaperOrder(orderRows);
  const firstFilledTime = rowTimestamp(firstFilledOrder);
  const totalFilledOrders = asNumber(activity?.summary?.filled_orders) ?? 0;
  const baselineRows = [{ created_at: accountCreatedAt, equity_usd: startingBalance }];
  let chartRiskRows = riskRows;

  if (Number.isFinite(firstFilledTime)) {
    if (firstFilledTime > accountTime + 1000) {
      baselineRows.push({
        created_at: new Date(firstFilledTime - 1000).toISOString(),
        equity_usd: startingBalance,
      });
    }
    chartRiskRows = riskRows.filter((row) => {
      const timestamp = rowTimestamp(row);
      return Number.isFinite(timestamp) && timestamp >= firstFilledTime;
    });
  } else if (totalFilledOrders === 0) {
    const latestRiskTime = rowTimestamp(riskRows[riskRows.length - 1]);
    const endTime = Number.isFinite(latestRiskTime) && latestRiskTime > accountTime
      ? latestRiskTime
      : Date.now();
    baselineRows.push({
      created_at: new Date(Math.max(accountTime + 1000, endTime)).toISOString(),
      equity_usd: startingBalance,
    });
    chartRiskRows = [];
  }

  return uniquePaperChartRows([...baselineRows, ...chartRiskRows]);
}

function uniquePaperChartRows(rows) {
  const seenTimes = new Set();
  return rows
    .filter((row) => asNumber(row?.equity_usd) !== null && Number.isFinite(rowTimestamp(row)))
    .sort((left, right) => rowTimestamp(left) - rowTimestamp(right))
    .filter((row) => {
      const time = rowTimestamp(row);
      if (seenTimes.has(time)) return false;
      seenTimes.add(time);
      return true;
    });
}

function paperChartEvents(orderRows) {
  const firstFilledOrder = firstFilledPaperOrder(orderRows);
  const recentOrders = visiblePaperOrders(orderRows).slice(-12);
  const byId = new Map();
  [firstFilledOrder, ...recentOrders].filter(Boolean).forEach((order) => {
    byId.set(order.id || `${order.created_at}-${order.client_order_id || order.side || "paper"}`, order);
  });
  return [...byId.values()].sort((left, right) => rowTimestamp(left) - rowTimestamp(right));
}

function chartPointTime(row, index, total, startTime, endTime) {
  const parsed = rowTimestamp(row);
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  const ratio = total > 1 ? index / (total - 1) : 1;
  return Math.round(startTime + (endTime - startTime) * ratio);
}

function chartPointsForValues(values, rows = []) {
  const range = chartRangeMeta();
  const spanSeconds = Math.max(60, (range.hours || Math.max(24, values.length - 1)) * 60 * 60);
  const knownTimes = rows.map((row) => {
    const parsed = rowTimestamp(row);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  });
  const finiteTimes = knownTimes.filter((time) => time !== null);
  const endTime = finiteTimes[finiteTimes.length - 1] ?? Math.floor(Date.now() / 1000);
  const startTime = finiteTimes[0] ?? endTime - spanSeconds;
  const fallbackEndTime = Math.max(endTime, startTime + Math.max(1, values.length - 1));
  const usedTimes = new Set();
  let previousTime = null;
  return values.map((value, index) => {
    let time = chartPointTime(rows[index], index, values.length, startTime, fallbackEndTime);
    if (previousTime !== null && time <= previousTime) time = previousTime + 1;
    while (usedTimes.has(time)) time += 1;
    usedTimes.add(time);
    previousTime = time;
    return { time, value };
  });
}

function nearestChartPointIndex(points, row, fallbackIndex, totalRows) {
  if (!points.length) return 0;
  const parsed = rowTimestamp(row);
  if (!Number.isFinite(parsed)) {
    return Math.min(points.length - 1, Math.round((fallbackIndex / Math.max(1, totalRows - 1)) * (points.length - 1)));
  }
  const target = Math.floor(parsed / 1000);
  return points.reduce((bestIndex, point, index) => (
    Math.abs(point.time - target) < Math.abs(points[bestIndex].time - target) ? index : bestIndex
  ), 0);
}

function chartModel(agent) {
  const range = chartRangeMeta();
  const rangePrefix = `${range.label} / `;
  if (!chainState.backend || !backendApplies(agent)) {
    return { values: [], points: [], events: [], tone: "idle", title: "Backend chart loading", message: `${rangePrefix}Reading backend for this agent.` };
  }
  if (!chainState.backend.ok) {
    return { values: [], points: [], events: [], tone: "error", title: "Backend chart unavailable", message: `${rangePrefix}${backendErrorMessage()}` };
  }

  const activity = paperActivity(agent);
  if (!chainState.accountId && !activity) {
    return {
      values: [],
      points: [],
      events: [],
      tone: "wallet",
      title: "Connect Wallet",
      message: `${rangePrefix}Connect Wallet to load holder-gated chart data.`,
    };
  }

  const allPaperOrders = activity ? sortedByObservedAt(paperOrders(agent)) : [];
  const paperRiskRows = activity
    ? filterRowsForChartRange(sortedByObservedAt(paperRiskSnapshots(agent))).filter((row) => asNumber(row.equity_usd) !== null)
    : [];
  const events = activity
    ? filterRowsForChartRange(allPaperOrders)
    : filterRowsForChartRange(sortedByObservedAt(backendEvents(agent)));
  const prices = filterRowsForChartRange(sortedByObservedAt(backendPrices(agent))).filter((row) => asNumber(row.price_usd) !== null);
  const balanceChanges = filterRowsForChartRange(sortedByObservedAt(backendBalanceChanges(agent)));
  let values = [];
  let pointRows = [];
  let source = activity ? "paper risk timeline" : "backend events";
  let valueKind = "pct";

  if (activity) {
    pointRows = paperChartPointRows(activity, paperRiskRows, allPaperOrders);
    values = paperNetWorthValues(pointRows);
    source = "paper net worth";
    valueKind = "usd";
  } else if (prices.length >= 2) {
    values = normalizeSeries(prices.map((row) => row.price_usd));
    pointRows = prices;
    source = "backend price snapshots";
  } else if (balanceChanges.length >= 2) {
    let cumulative = 0;
    values = balanceChanges.map((row) => {
      cumulative += asNumber(row.delta_value_usd) ?? 0;
      return cumulative;
    });
    pointRows = balanceChanges;
    source = "backend balance changes";
  } else {
    const latestPnl = backendPnl(agent);
    if (latestPnl !== null) {
      values = [0, latestPnl];
      pointRows = [null, chainState.backend?.pnl?.latest || null];
      source = "backend latest P&L";
    }
  }

  const safeValues = values.length >= 2 ? values : [];
  const points = safeValues.length >= 2 ? chartPointsForValues(safeValues, pointRows) : [];
  const chartEvents = activity ? paperChartEvents(allPaperOrders) : events.slice(-40);
  const normalizedEvents = chartEvents.map((event, index) => {
    const valueIndex = nearestChartPointIndex(points, event, index, chartEvents.length);
    return activity
      ? normalizePaperOrderEvent(event, index, agent, valueIndex, points[valueIndex])
      : normalizeBackendEvent(event, index, agent, valueIndex, points[valueIndex]);
  });

  return {
    values: safeValues,
    points,
    events: normalizedEvents,
    tone: "success",
    title: safeValues.length ? undefined : "No chart data yet",
    source,
    valueKind,
    message: safeValues.length ? `${range.label} ${source}` : `No chartable backend series in ${range.label}.`,
  };
}

function backendLabel() {
  if (!chainState.backend) return { status: "checking", url: "/api/backend/board" };
  const baseUrl = chainState.backend.config?.baseUrl || "/api/backend/board";
  if (chainState.backend.ok) return { status: "connected", url: baseUrl };
  return { status: "unavailable", url: baseUrl };
}

function signedPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function pnlLabel(value) {
  return value === null ? "--" : signedPct(value);
}

function pnlClass(value) {
  if (value === null) return "";
  return value >= 0 ? "up" : "down";
}

function showToast(message, options = {}) {
  const toast = byId("toast");
  toast.textContent = "";
  toast.append(document.createTextNode(message));
  toast.classList.toggle("actionable", Boolean(options.linkUrl));
  if (options.linkUrl) {
    const link = document.createElement("a");
    link.href = options.linkUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = options.linkLabel || "Open";
    toast.append(link);
  }
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), options.durationMs || (options.linkUrl ? 9000 : 1800));
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function normalizedAmount(value) {
  const trimmed = String(value || "").trim();
  return /^[1-9]\d{0,5}$/.test(trimmed) ? trimmed : "1";
}

function firstRejectedMessage(results) {
  const rejected = results.find((result) => result.status === "rejected");
  return rejected ? errorMessage(rejected.reason, "Key market read failed.") : null;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

let keyMarketRefreshTimer = 0;
let keyMarketRefreshId = 0;
let backendRefreshTimer = 0;
let backendRefreshId = 0;

function scheduleBackendRefresh(reason, delayMs = 0) {
  window.clearTimeout(backendRefreshTimer);
  backendRefreshTimer = window.setTimeout(() => {
    void refreshBackendRead(reason);
  }, delayMs);
}

async function refreshBackendRead(_reason) {
  const agent = selectedAgent();
  const refreshId = ++backendRefreshId;
  try {
    const backend = await fetchJson(`/api/backend/board?boardId=${encodeURIComponent(agent.boardId || agent.id)}`);
    if (refreshId !== backendRefreshId) return;
    chainState = {
      ...chainState,
      backend,
    };
  } catch (error) {
    if (refreshId !== backendRefreshId) return;
    chainState = {
      ...chainState,
      backend: { ok: false, error: errorMessage(error, "Backend read failed.") },
    };
  }
  render();
  scheduleBackendRefresh("poll", BACKEND_REFRESH_MS);
}

function scheduleKeyMarketRefresh(reason, delayMs = 120) {
  window.clearTimeout(keyMarketRefreshTimer);
  keyMarketRefreshTimer = window.setTimeout(() => {
    void refreshKeyMarketRead(reason);
  }, delayMs);
}

async function refreshKeyMarketRead(_reason) {
  const agent = selectedAgent();
  const refreshId = ++keyMarketRefreshId;
  const side = tradeSide === "sell" ? "sell" : "buy";
  const amount = normalizedAmount(byId("keyAmount")?.value || "1");
  const holderParam = chainState.accountId ? `&holderId=${encodeURIComponent(chainState.accountId)}` : "";
  const statePath = `/api/key-market/state?agentId=${encodeURIComponent(agent.id)}${holderParam}`;
  const quotePath = `/api/key-market/quote?side=${side}&agentId=${encodeURIComponent(agent.id)}&amount=${encodeURIComponent(amount)}`;
  const activityPath = `/api/key-market/activity?agentId=${encodeURIComponent(agent.id)}&limit=7`;
  const [stateResult, quoteResult, activityResult] = await Promise.allSettled([
    fetchJson(statePath),
    fetchJson(quotePath),
    fetchJson(activityPath),
  ]);
  if (refreshId !== keyMarketRefreshId) return;

  chainState = {
    ...chainState,
    state: stateResult.status === "fulfilled" ? stateResult.value.state : null,
    quote: quoteResult.status === "fulfilled" ? quoteResult.value.quote : null,
    quoteSide: quoteResult.status === "fulfilled" ? side : null,
    protection: quoteResult.status === "fulfilled" ? quoteResult.value.protection : null,
    activity: activityResult.status === "fulfilled" ? activityResult.value : null,
    activityError: firstRejectedMessage([activityResult]),
    error: firstRejectedMessage([stateResult, quoteResult]),
  };
  render();
}

async function loadDiscoveryAgents() {
  try {
    const response = await fetch("/api/agents", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Discovery request failed: ${response.status}`);
    }

    const nextAgents = Array.isArray(data.agents)
      ? data.agents.map((agent, index) => normalizeDiscoveryAgent(agent, index))
      : [];
    if (!nextAgents.length) {
      throw new Error("Discovery API returned no configured agents.");
    }

    agents = nextAgents;
    const preferredId = requestedAgentId && agents.some((agent) => agentMatchesSelection(agent, requestedAgentId))
      ? requestedAgentId
      : selectedId;
    selectedId = resolveSelectedId(preferredId);
    discoveryLoading = false;
    chainState = {
      ...chainState,
      discovery: data,
      discoveryError: null,
    };
    chartAnimationPending = true;
    render();
    scheduleBackendRefresh("discovery", 0);
    scheduleKeyMarketRefresh("discovery", 0);
    dispatchUiEvent("clawhouse:agent-change");
  } catch (error) {
    discoveryLoading = false;
    chainState = {
      ...chainState,
      discoveryError: error instanceof Error ? error.message : "Discovery unavailable.",
    };
    render();
    showToast(`Discovery unavailable: ${chainState.discoveryError}`, { durationMs: 4200 });
  }
}

function setTextWithOptionalLink(node, text, linkUrl) {
  if (!node) return;
  node.textContent = "";
  node.append(document.createTextNode(text));
  if (!linkUrl) return;
  node.append(document.createTextNode(" "));
  const link = document.createElement("a");
  link.href = linkUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "NearBlocks";
  node.append(link);
}

function buyOneForUnlock() {
  tradeSide = "buy";
  const input = byId("keyAmount");
  if (input) input.value = "1";
  clearQuote();
  render();
  scheduleKeyMarketRefresh("unlock-buy", 0);
  showToast("Connect Wallet to buy this agent key.");
}

function renderTicker() {
  const items = agents.flatMap((agent) => {
    const pnl = backendPnl(agent);
    const pnlSource = backendPnlSource(agent);
    const title = agentTitle(agent);
    const events = chartModel(agent).events.length;
    const holders = holderCount(agent);
    return [
      `<span class="ticker-item"><b>${escapeHtml(title)}</b><span class="${pnlClass(pnl)}">${pnlLabel(pnl)}</span><span>${pnlSource}</span></span>`,
      `<span class="ticker-item"><b>${escapeHtml(title)} key</b><span>${keyPriceLabel(agent)}</span><span>NEAR testnet</span></span>`,
      `<span class="ticker-item"><b>${holders === null ? "--" : holders}</b><span>keys in ${escapeHtml(title)}</span><span>${events} ledger events</span></span>`
    ];
  });
  const track = byId("tickerTrack");
  track.innerHTML = items.concat(items).join("");
  window.requestAnimationFrame(syncTickerSpeed);
}

function syncTickerSpeed() {
  const track = byId("tickerTrack");
  const loopWidth = track.scrollWidth / 2;
  if (!Number.isFinite(loopWidth) || loopWidth <= 0) {
    track.style.removeProperty("--ticker-duration");
    return;
  }

  const duration = loopWidth / TICKER_PX_PER_SECOND;
  track.style.setProperty("--ticker-duration", `${duration.toFixed(2)}s`);
}

function agentListSkeletonRows() {
  return Array.from({ length: 8 }, () => `
    <div class="agent-row agent-row-skeleton" aria-hidden="true">
      <div class="avatar agent-skeleton-avatar"></div>
      <div class="agent-copy">
        <div class="agent-name">
          <span class="agent-skeleton-line agent-skeleton-name"></span>
          <span class="agent-skeleton-line agent-skeleton-tag"></span>
        </div>
        <div class="agent-skeleton-line agent-skeleton-meta"></div>
        <div class="agent-stats">
          <span class="agent-skeleton-line agent-skeleton-stat"></span>
          <span class="agent-skeleton-line agent-skeleton-stat short"></span>
          <b class="agent-skeleton-line agent-skeleton-change"></b>
        </div>
      </div>
    </div>
  `).join("");
}

function renderAgentList() {
  const list = byId("agentList");
  if (discoveryLoading) {
    list.setAttribute("aria-busy", "true");
    list.innerHTML = agentListSkeletonRows();
    return;
  }

  list.removeAttribute("aria-busy");
  list.innerHTML = sortedAgents().map((agent) => {
    const pnl = agentRowPnl(agent);
    const selectionKey = agentSelectionKey(agent);
    const selected = selectionKey === selectedId;
    const title = agentTitle(agent);
    const pnlTone = pnl === null ? "empty" : pnl < 0 ? "down" : "up";
    const holders = holderCount(agent);
    const rowTag = isPaperAgent(agent) ? "paper" : "key market";
    return `
    <button class="agent-row" data-agent="${escapeHtml(selectionKey)}" data-agent-id="${escapeHtml(agent.id)}" data-selected="${selected ? "true" : "false"}" aria-label="Open ${escapeHtml(title)}">
      <div class="avatar">${agentIcon(agent)}</div>
      <div class="agent-copy">
        <div class="agent-name">
          <span class="agent-title" title="${escapeHtml(agent.name)}">${escapeHtml(title)}</span>
          <span class="tag">${escapeHtml(rowTag)}</span>
        </div>
        <div class="agent-meta">${escapeHtml(agent.strategy)}</div>
        <div class="agent-stats">
          <span>${keyPriceLabel(agent)}</span>
          <span>${holders === null ? "--" : holders} keys</span>
          <b class="agent-change ${pnlTone}">${pnlLabel(pnl)}</b>
        </div>
      </div>
    </button>
  `;
  }).join("");

  list.querySelectorAll("[data-agent]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.agent;
      activeEventId = null;
      chartAnimationPending = true;
      clearQuote();
      render();
      scheduleBackendRefresh("agent-change", 0);
      scheduleKeyMarketRefresh("agent-change", 0);
      dispatchUiEvent("clawhouse:agent-change");
      animateAgentChange();
    });
  });
}

function renderHero(agent) {
  const pnl = backendPnl(agent);
  const pnlSource = backendPnlSource(agent);
  const chart = chartModel(agent);
  const title = agentTitle(agent);
  const activity = paperActivity(agent);
  const summary = paperSummary(agent);
  const latestRiskAt = summary.latest_risk_at || activity?.latest_risk?.created_at;
  byId("heroAvatar").innerHTML = agentIcon(agent);
  byId("heroBannerImage").src = agent.bannerUrl || DEFAULT_AGENT_BANNER_URL;
  byId("heroName").textContent = title;
  byId("heroDesc").textContent = agent.desc;
  byId("statPnl").textContent = pnl === null ? "--" : signedPct(pnl);
  byId("statPnl").className = pnl === null ? "" : pnl >= 0 ? "green" : "red";
  byId("statKey").textContent = keyPriceLabel(agent).replace(" tNEAR", "");
  const holders = holderCount(agent);
  byId("statHolders").textContent = holders === null ? "--" : holders.toLocaleString();
  byId("statUpdate").textContent = latestRiskAt
    ? formatUtcTime(latestRiskAt)
    : chainApplies(agent) ? "testnet live" : backendApplies(agent) && chainState.backend?.ok ? backendNetwork(agent) : agent.last;
  byId("statGate").textContent = isUnlocked(agent) ? "Unlocked" : holderBalance(agent) > 0 ? "Sign proof" : "1 key";
  byId("priceMarker").textContent = pnl === null ? "backend" : signedPct(pnl);
  byId("priceMarker").style.background = pnl === null ? "var(--gray)" : pnl >= 0 ? "var(--green)" : "var(--red)";
  byId("miniTop").textContent = title;
  byId("miniMove").textContent = pnl === null ? "--" : signedPct(pnl);
  byId("leaderDataSource").textContent = pnlSource;
  byId("chartSub").textContent = activity
    ? `${chart.message} / ${summary.filled_orders ?? 0}/${summary.total_orders ?? 0} filled orders / ${backendNetwork(agent)}`
    : `${chart.message} / ${backendNetwork(agent)} / ${pnlSource} / key market ${chainApplies(agent) ? "live" : "checking"}`;
}

function publicEventText(event) {
  return `${event.title} / ${formatBackendAction(event.raw || event)}`;
}

function compactReason(reason) {
  const text = String(reason || "").trim().replace(/\s+/g, " ");
  if (!text) return "No reason supplied.";
  return text.length > 86 ? `${text.slice(0, 83).trim()}...` : text;
}

function eventTag(event) {
  const raw = event.raw || {};
  const coin = String(raw.coin || raw.metadata?.coin || "").toUpperCase();
  const side = String(raw.side || raw.metadata?.side || event.label || "event").toLowerCase();
  if (coin) return `${coin} ${titleCase(side)}`;
  return event.title || titleCase(side);
}

function renderBackendEmpty(targetId, title, detail) {
  byId(targetId).innerHTML = `
    <div class="backend-empty">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(detail)}</strong>
    </div>
  `;
}

function renderRoom(agent) {
  const activity = paperActivity(agent);
  const events = activity
    ? sortedByObservedAt(paperOrders(agent)).slice(-12).reverse().map((order, index) => normalizePaperOrderEvent(order, index, agent, 0, null))
    : chartModel(agent).events;
  if (!events.length) {
    byId("roomFeed").innerHTML = `
      <div class="blur-status feed-unavailable" aria-label="Agent chat room unavailable">
        <div class="blur-status-content" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="blur-status-label">Unavailable</div>
      </div>
    `;
    return;
  }

  byId("roomFeed").innerHTML = events.map((event) => `
    <article class="update" data-event="${event.id}">
      <div class="update-avatar" aria-hidden="true">${agentIcon(agent)}</div>
      <div class="update-copy">
        <div class="update-title">
          <strong>${escapeHtml(agentTitle(agent))}</strong>
          <span class="tag">${escapeHtml(eventTag(event))}</span>
          <time>${escapeHtml(event.time)}</time>
        </div>
        <div class="update-text">${escapeHtml(compactReason(event.reason))}</div>
        <div class="update-action">
          <span>Action</span>
          <strong>${escapeHtml(event.action)}</strong>
        </div>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-event]").forEach((button) => {
    button.addEventListener("click", () => openEvent(button.dataset.event));
  });
}

function renderKeyActivity(agent) {
  if (paperActivity(agent)) {
    renderPaperActivity(agent);
    return;
  }
  setActivityHeader("Key Trading Activity", "NEAR testnet key market");
  const rows = keyActivityRows(agent);
  if (!rows.length) {
    renderBackendEmpty(
      "keyActivityList",
      chainState.activityError ? "Key activity unavailable" : "No verified key trades yet",
      chainState.activityError || "Verified ClawHouse key buy/sell reports will appear here."
    );
    return;
  }

  byId("keyActivityList").innerHTML = rows.slice(0, 7).map((row) => `
    <div class="activity-row key-activity-row ${escapeHtml(row.tone)}">
      <span class="activity-action">${escapeHtml(row.title)}</span>
      <span class="activity-main">
        <b>${escapeHtml(row.amountLabel)}</b>
        <span>by ${row.traderUrl ? `<a href="${escapeHtml(row.traderUrl)}" target="_blank" rel="noreferrer">${escapeHtml(row.traderLabel)}</a>` : escapeHtml(row.traderLabel)}</span>
      </span>
      <span class="activity-value">${row.linkUrl ? `<a href="${escapeHtml(row.linkUrl)}" target="_blank" rel="noreferrer">${escapeHtml(row.side)}</a>` : escapeHtml(row.side)}</span>
    </div>
  `).join("");
}

function renderPaperActivity(agent) {
  const summary = paperSummary(agent);
  const latestRiskAt = summary.latest_risk_at ? `risk ${formatUtcTime(summary.latest_risk_at)}` : "risk pending";
  setActivityHeader(
    "Paper Trading Activity",
    `${summary.filled_orders ?? 0}/${summary.total_orders ?? 0} filled orders / ${latestRiskAt}`
  );
  const rows = paperActivityRows(agent);
  if (!rows.length) {
    renderBackendEmpty(
      "keyActivityList",
      "No filled paper orders yet",
      "Filled paper orders will appear here after the backend records execution."
    );
    return;
  }

  byId("keyActivityList").innerHTML = rows.slice(0, 7).map((row) => `
    <div class="activity-row key-activity-row ${escapeHtml(row.tone)}">
      <span class="activity-action">${escapeHtml(row.title)}</span>
      <span class="activity-main">
        <b>${escapeHtml(row.amountLabel)}</b>
        <span>${escapeHtml(row.detail)}</span>
      </span>
      <span class="activity-value">${escapeHtml(row.value)}</span>
    </div>
  `).join("");
}

function setActivityHeader(title, subtitle) {
  byId("activityPanelTitle").textContent = title;
  byId("activityPanelSub").textContent = subtitle;
}

function paperActivityRows(agent) {
  return visiblePaperOrders(paperOrders(agent)).map((order) => {
    const filled = order.status === "filled";
    const side = String(order.side || "order").toLowerCase();
    const coin = String(order.coin || "").toUpperCase();
    const size = compactNumber(order.size);
    const px = asNumber(order.avg_fill_px);
    const leverage = asNumber(order.leverage);
    const title = side === "sell" ? "SELL" : "BUY";
    const detail = `${order.market_type || "paper"} ${order.margin_mode || "cross"}${leverage ? ` ${compactNumber(leverage, 1)}x` : ""}`;
    return {
      title,
      amountLabel: `${size} ${coin}`.trim(),
      detail,
      value: filled && px !== null ? formatUsd(px) : titleCase(order.status || "order"),
      tone: side === "sell" ? "sell" : "buy",
    };
  });
}

function keyActivityRows(agent) {
  const rows = [];
  const trades = keyActivityTrades(agent);

  for (const trade of trades) {
    rows.push({
      title: titleCase(trade.side),
      amountLabel: `${trade.amount} key${trade.amount === "1" ? "" : "s"}`,
      traderLabel: shortAccount(trade.trader_id),
      traderUrl: keyTradeAccountUrl(trade),
      side: keyTradeValueLabel(trade),
      linkUrl: keyTradeExplorerUrl(trade),
      tone: trade.side === "sell" ? "sell" : "buy",
    });
  }

  return rows;
}

function keyActivityTrades(agent) {
  const activity = chainState.activity;
  if (!activity || activity.agent_id !== agent.id) return [];
  return Array.isArray(activity.trades) ? activity.trades : [];
}

function keyTradeValueLabel(trade) {
  const rawValue = trade.side === "sell" ? trade.payout : trade.total_cost;
  return yoctoNearLabel(rawValue || trade.price);
}

function keyTradeExplorerUrl(trade) {
  if (!trade.tx_hash) return null;
  const host = trade.network_id === "mainnet" ? "nearblocks.io" : "testnet.nearblocks.io";
  return `https://${host}/txns/${encodeURIComponent(trade.tx_hash)}`;
}

function keyTradeAccountUrl(trade) {
  if (!trade.trader_id) return null;
  const host = trade.network_id === "mainnet" ? "nearblocks.io" : "testnet.nearblocks.io";
  return `https://${host}/address/${encodeURIComponent(trade.trader_id)}`;
}

function yoctoNearLabel(value) {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text)) return "-";
  return nearLabel(Number(text) / 1e24);
}

function renderTicket(agent) {
  const keyAmount = byId("keyAmount");
  const amount = Math.max(Number(keyAmount?.value || 1), 0);
  const balance = holderBalance(agent);
  const busy = Boolean(chainState.pending);
  const quote = chainApplies(agent) && chainState.quoteSide === tradeSide ? chainState.quote : null;
  const chainTotal = tradeSide === "sell" ? quote?.payout_near : quote?.total_cost_near;
  if (tradeSide === "sell") {
    byId("quotePay").textContent = keyAmountLabel(amount);
    byId("quoteReceive").textContent = chainTotal ? nearLabel(chainTotal) : "--";
  } else {
    byId("quotePay").textContent = chainTotal ? nearLabel(chainTotal) : keyPriceLabel(agent);
    byId("quoteReceive").textContent = keyAmountLabel(amount);
  }
  byId("quoteAverage").textContent = chainTotal
    ? averageKeyPriceLabel(chainTotal, amount)
    : (tradeSide === "buy" && amount === 1 ? keyPriceLabel(agent) : "--");
  const tradeButton = byId("tradeButton");
  if (tradeButton) {
    tradeButton.textContent = busy
      ? statusButtonText()
      : chainState.accountId ? `${tradeSide === "buy" ? "Buy" : "Sell"} ${agentTitle(agent)} key` : "Connect Wallet";
    tradeButton.className = `${tradeSide === "buy" ? "primary" : "primary sell"}${busy ? " loading" : ""}`;
    tradeButton.disabled = busy || amount <= 0 || (tradeSide === "sell" && (balance === null || balance <= 0));
  }
  document.querySelectorAll(".ticket-tab, [data-amount], [data-unlock-agent]").forEach((button) => {
    button.disabled = busy;
  });
  if (keyAmount) keyAmount.disabled = busy;
  if (paperActivity(agent)) {
    renderPaperPosition(agent);
  } else {
    renderKeyPosition(balance);
  }
  byId("gateButton").textContent = isUnlocked(agent)
    ? "Room open"
    : balance && balance > 0
      ? "Sign proof"
      : "Gate: 1 key";
  const walletButton = byId("walletButton");
  if (walletButton) {
    walletButton.textContent = chainState.accountId ? shortAccount(chainState.accountId) : "Connect Wallet";
    walletButton.classList.toggle("connected", Boolean(chainState.accountId));
    walletButton.disabled = busy;
  }
  renderBackendStatus();
}

function renderKeyPosition(balance) {
  byId("positionTitle").textContent = "Your Key Position";
  byId("positionSub").textContent = "Key balance only, not copy-trade portfolio";
  byId("posKeysLabel").textContent = "Keys";
  byId("posEntryLabel").textContent = "Entry";
  byId("posExitLabel").textContent = "Exit";
  byId("posKeys").textContent = balance === null ? "--" : balance.toString();
  byId("posEntry").textContent = "-";
  byId("posExit").textContent = "-";
  byId("posExit").className = "";
}

function renderPaperPosition(agent) {
  const activity = paperActivity(agent);
  const summary = paperSummary(agent);
  const risk = activity?.latest_risk;
  const positions = paperPositions(agent);
  byId("positionTitle").textContent = "Paper Positions";
  byId("positionSub").textContent = `${summary.filled_orders ?? 0}/${summary.total_orders ?? 0} filled orders / ${formatUtcTime(summary.latest_risk_at || risk?.created_at)}`;
  byId("posKeysLabel").textContent = "Equity";
  byId("posKeys").textContent = formatUsd(risk?.equity_usd);

  const first = positions[0];
  const second = positions[1];
  byId("posEntryLabel").textContent = first?.coin || "Position";
  byId("posEntry").textContent = first ? paperPositionLabel(first) : "--";
  byId("posExitLabel").textContent = second?.coin || "Notional";
  byId("posExit").textContent = second ? paperPositionLabel(second) : formatUsd(risk?.total_notional_usd);
  byId("posExit").className = "";
}

function paperPositionLabel(position) {
  const size = asNumber(position.signed_size);
  if (size === null) return "--";
  return `${size > 0 ? "+" : ""}${compactNumber(size)} ${position.coin || ""}`.trim();
}

function statusButtonText() {
  if (chainState.phase === "connecting") return "Opening wallet...";
  if (chainState.phase === "quoting") return "Refreshing quote...";
  if (chainState.phase === "signing") return "Confirm in wallet...";
  if (chainState.phase === "unlocking") return "Confirm access...";
  if (chainState.phase === "refreshing") return "Refreshing balance...";
  return "Working...";
}

function renderBackendStatus() {
  if (!byId("backendStatus") || !byId("backendUrl")) return;
  const backend = backendLabel();
  byId("backendStatus").textContent = backend.status;
  byId("backendUrl").textContent = backend.url;
}

function chartLoadingState(title, message) {
  const text = `${title || ""} ${message || ""}`.toLowerCase();
  return text.includes("loading") || text.includes("reading backend") || text.includes("checking");
}

function setChartEmptyState(isEmpty, message = "", title = "Backend chart data unavailable", loading = false) {
  const panel = byId("chartPanel");
  const overlay = byId("chartEmptyOverlay");
  if (!panel || !overlay) return;
  const isLoading = isEmpty && (loading || chartLoadingState(title, message));
  panel.classList.toggle("is-empty", isEmpty);
  panel.classList.toggle("is-loading", isLoading);
  overlay.classList.toggle("is-loading", isLoading);
  overlay.setAttribute("aria-busy", isLoading ? "true" : "false");
  overlay.setAttribute("aria-label", isLoading ? "Loading chart data" : title);
  overlay.hidden = !isEmpty;
  if (!isEmpty) return;
  byId("chartEmptyTitle").textContent = title;
  byId("chartEmptyDetail").textContent = message || "No backend time series has been recorded for this agent.";
}

function axisPctLabel(value) {
  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  const display = Math.abs(normalized) >= 10 ? Math.round(normalized) : Number(normalized.toFixed(1));
  return `${display > 0 ? "+" : ""}${display}%`;
}

function chartValueFormatter(model) {
  return model?.valueKind === "usd" ? formatUsd : axisPctLabel;
}

function chartValueLabel(model, value) {
  return chartValueFormatter(model)(value);
}

let pnlTradingViewChart = null;
let pnlTradingViewSeries = null;
let pnlTradingViewMarkers = null;
let pnlTradingViewResizeObserver = null;
let lastPnlChartModel = null;
let tradingViewRetryTimer = 0;

function chartTrend(model) {
  const values = model.values || [];
  if (values.length < 2) return 0;
  return values[values.length - 1] - values[0];
}

function chartToneColors(model) {
  return chartTrend(model) >= 0
    ? { line: "#1ecb73", top: "rgba(30, 203, 115, 0.34)", bottom: "rgba(30, 203, 115, 0)" }
    : { line: "#ff6a4a", top: "rgba(255, 106, 74, 0.3)", bottom: "rgba(255, 106, 74, 0)" };
}

function resizeTradingViewChart(container) {
  if (!pnlTradingViewChart) return;
  pnlTradingViewChart.resize(
    Math.max(1, Math.floor(container.clientWidth)),
    Math.max(1, Math.floor(container.clientHeight))
  );
}

function ensureTradingViewChart(container) {
  if (pnlTradingViewChart && pnlTradingViewSeries && pnlTradingViewMarkers) return true;
  const tradingView = window.LightweightCharts;
  if (!tradingView?.createChart || !tradingView?.AreaSeries || !tradingView?.createSeriesMarkers) return false;

  pnlTradingViewChart = tradingView.createChart(container, {
    width: Math.max(1, Math.floor(container.clientWidth)),
    height: Math.max(1, Math.floor(container.clientHeight)),
    layout: {
      background: { type: tradingView.ColorType.Solid, color: "transparent" },
      textColor: "rgba(255, 255, 255, 0.42)",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: 10,
    },
    localization: {
      priceFormatter: axisPctLabel,
    },
    grid: {
      vertLines: { color: "rgba(255, 255, 255, 0.045)" },
      horzLines: { color: "rgba(255, 255, 255, 0.055)" },
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: { top: 0.16, bottom: 0.18 },
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true,
    },
    crosshair: {
      mode: tradingView.CrosshairMode.Normal,
      vertLine: { color: "rgba(255, 255, 255, 0.14)", labelVisible: false },
      horzLine: { color: "rgba(255, 255, 255, 0.14)", labelVisible: true },
    },
    handleScale: {
      axisPressedMouseMove: false,
    },
  });

  pnlTradingViewSeries = pnlTradingViewChart.addSeries(tradingView.AreaSeries, {
    lineColor: "#1ecb73",
    topColor: "rgba(30, 203, 115, 0.34)",
    bottomColor: "rgba(30, 203, 115, 0)",
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    priceFormat: {
      type: "custom",
      formatter: axisPctLabel,
      minMove: 0.01,
    },
  });

  pnlTradingViewMarkers = tradingView.createSeriesMarkers(pnlTradingViewSeries, [], { zOrder: "top" });
  pnlTradingViewResizeObserver = new ResizeObserver(() => {
    resizeTradingViewChart(container);
    if (lastPnlChartModel) {
      updatePriceMarker(lastPnlChartModel);
      renderChartEvents(selectedAgent(), null, lastPnlChartModel);
    }
  });
  pnlTradingViewResizeObserver.observe(container);
  return true;
}

function clearTradingViewChart() {
  if (pnlTradingViewSeries) pnlTradingViewSeries.setData([]);
  if (pnlTradingViewMarkers) pnlTradingViewMarkers.setMarkers([]);
  lastPnlChartModel = null;
}

function tradingViewEventMarkers(model) {
  const unlocked = isUnlocked(selectedAgent());
  return model.events
    .filter((event) => event.timeValue !== null && event.chartValue !== null)
    .map((event, index) => {
      const visible = unlocked || event.public === true;
      const status = String(event.raw?.status_claim || event.label || "").toLowerCase();
      const failed = status.includes("fail") || status.includes("reject") || status.includes("refund");
      return {
        time: event.timeValue,
        position: event.chartValue >= 0 ? "aboveBar" : "belowBar",
        color: visible ? (failed ? "#ff622e" : "#516af6") : "rgba(145, 151, 157, 0.78)",
        shape: failed ? "arrowDown" : "circle",
        text: "",
      };
    });
}

function drawChart(agent) {
  const container = byId("pnlChart");
  const model = chartModel(agent);
  if (!container || !ensureTradingViewChart(container)) {
    setChartEmptyState(true, "TradingView chart library is loading.", "Chart loading", true);
    byId("chartEvents").innerHTML = "";
    hidePriceMarker();
    window.clearTimeout(tradingViewRetryTimer);
    tradingViewRetryTimer = window.setTimeout(() => drawChart(selectedAgent()), 150);
    return;
  }

  if (model.points.length < 2) {
    clearTradingViewChart();
    setChartEmptyState(true, model.message, model.title);
    byId("chartEvents").innerHTML = "";
    hidePriceMarker();
    return;
  }

  setChartEmptyState(false);
  lastPnlChartModel = model;
  const colors = chartToneColors(model);
  pnlTradingViewSeries.applyOptions({
    lineColor: colors.line,
    topColor: colors.top,
    bottomColor: colors.bottom,
    priceFormat: {
      type: "custom",
      formatter: chartValueFormatter(model),
      minMove: 0.01,
    },
  });
  pnlTradingViewChart.applyOptions({
    localization: {
      priceFormatter: chartValueFormatter(model),
    },
  });
  pnlTradingViewSeries.setData(model.points);
  pnlTradingViewMarkers.setMarkers(tradingViewEventMarkers(model));
  pnlTradingViewChart.timeScale().fitContent();
  updatePriceMarker(model);
  renderChartEvents(agent, null, model);
}

function hidePriceMarker() {
  const marker = byId("priceMarker");
  const line = byId("priceReferenceLine");
  marker.hidden = true;
  if (line) line.hidden = true;
}

function updatePriceMarker(model) {
  const marker = byId("priceMarker");
  const line = byId("priceReferenceLine");
  const container = byId("pnlChart");
  const latest = model.values[model.values.length - 1];
  const y = pnlTradingViewSeries?.priceToCoordinate(latest);
  const trend = chartTrend(model);
  const color = trend >= 0 ? "var(--green)" : "var(--red)";
  const textColor = trend >= 0 ? "#03140b" : "#230702";
  const glow = trend >= 0 ? "rgba(32, 239, 131, 0.2)" : "rgba(255, 106, 74, 0.22)";
  marker.hidden = false;
  marker.textContent = chartValueLabel(model, latest);
  marker.style.background = color;
  marker.style.color = textColor;
  marker.style.boxShadow = trend >= 0 ? "0 0 24px rgba(32, 239, 131, 0.28)" : "0 0 24px rgba(255, 106, 74, 0.26)";
  if (line) {
    line.hidden = false;
    line.style.setProperty("--price-reference-color", color);
    line.style.setProperty("--price-reference-glow", glow);
  }
  if (container && Number.isFinite(y)) {
    const top = `${container.offsetTop + y}px`;
    marker.style.top = top;
    if (line) line.style.top = top;
  }
}

function animateChart(agent) {
  drawChart(agent);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderChartEvents(agent, _rect, model = chartModel(agent)) {
  const unlocked = isUnlocked(agent);
  const container = byId("pnlChart");
  if (model.points.length < 2 || !model.events.length || !container || !pnlTradingViewChart || !pnlTradingViewSeries) {
    byId("chartEvents").innerHTML = "";
    return;
  }
  const eventHtml = model.events.map((event, eventIndex) => {
    if (event.timeValue === null || event.chartValue === null) return "";
    const visible = unlocked || event.public === true;
    const rawX = pnlTradingViewChart.timeScale().timeToCoordinate(event.timeValue);
    const rawY = pnlTradingViewSeries.priceToCoordinate(event.chartValue);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return "";
    const x = clamp(rawX, 24, Math.max(24, container.clientWidth - 24));
    const y = clamp(rawY, 18, Math.max(18, container.clientHeight - 18));
    const labelY = y < 78 ? y + 28 : y - 46;
    return `
      <button
        class="event-marker ${visible ? "" : "locked"} ${activeEventId === event.id ? "active" : ""}"
        data-chart-event="${event.id}"
        style="left:${x}px; top:${y}px"
        aria-label="${escapeHtml(visible ? event.title : "Locked backend event")}"
      >Order ${eventIndex + 1}</button>
      <span class="event-label ${visible ? "" : "locked"}" style="left:${x}px; top:${labelY}px">
        ${escapeHtml(visible ? event.label : publicEventText(event))}
      </span>
    `;
  }).join("");
  byId("chartEvents").innerHTML = eventHtml;

  document.querySelectorAll("[data-chart-event]").forEach((button) => {
    button.addEventListener("click", () => {
      openEvent(button.dataset.chartEvent);
    });
  });
}

function openEvent(eventId) {
  const agent = selectedAgent();
  const model = lastPnlChartModel || chartModel(agent);
  const event = model.events.find((item) => item.id === eventId);
  if (!event) return;
  if (!isUnlocked(agent) && event.public !== true) {
    showToast("Buy 1 key and sign wallet proof to unlock Agent reasoning.");
    return;
  }
  activeEventId = event.id;
  renderChartEvents(agent, null, model);
  renderBackendEventModal(agent, event);
  byId("eventModal").hidden = false;
}

function renderBackendEventModal(agent, event) {
  const raw = event.raw || {};
  const model = readableEventModel(raw, event, agent);
  byId("modalKicker").textContent = `${agentTitle(agent)} / ${event.time}`;
  byId("modalTitle").textContent = model.title;
  byId("modalSummary").textContent = model.summary;
  byId("modalMetricLabel").textContent = model.statusLabel;
  byId("modalMove").textContent = model.status;
  byId("modalMove").className = model.statusTone;
  byId("modalMoveHint").textContent = model.receipt;
  byId("modalDirection").textContent = model.direction;
  byId("modalVenue").textContent = model.venue;
  byId("modalAction").textContent = model.action;
  byId("modalReason").textContent = event.reason;
  renderModalSources(event, agent);
}

function readableEventModel(raw, event, agent) {
  const status = raw.status_claim || raw.event_type || "event";
  const tradeType = readableTradeType(raw);
  const venue = eventVenue(raw, agent);
  const action = formatBackendAction(raw);
  const direction = readableTradeDirection(raw);
  const receipt = raw.id ? `Receipt ${shortHash(raw.id)}` : eventReferenceLabel(raw) || "Agent Board Ledger";
  const statusText = titleCase(status);

  return {
    title: event.title || tradeType,
    summary: readableTradeSummary(raw, action, tradeType, statusText, venue),
    statusLabel: raw.status_claim ? "Backend status" : "Event type",
    status,
    statusTone: failureStatus(status) ? "red" : "green",
    receipt,
    direction,
    venue,
    action,
  };
}

function readableTradeSummary(event, action, tradeType, statusText, venue) {
  if (isPaperTradeEvent(event)) {
    return `${tradeType} on ${venue}: ${action}. Backend recorded ${statusText.toLowerCase()}.`;
  }
  return `${tradeType}: ${action}. Backend recorded ${statusText.toLowerCase()}.`;
}

function readableTradeType(event) {
  if (!isPaperTradeEvent(event)) return titleCase(event.event_type || "Backend event");
  const market = eventMarketType(event);
  if (market === "spot") return "Paper spot order";
  if (market === "perp") return "Paper perp order";
  return "Paper trade";
}

function eventMarketType(event) {
  const metadata = eventMetadata(event);
  const rawMarket = metadata.market_type || metadata.marketType || event.market_type || event.marketType;
  if (rawMarket) return String(rawMarket).toLowerCase();
  const reason = String(event.reason || "").toLowerCase();
  if (reason.includes("perp")) return "perp";
  if (reason.includes("spot")) return "spot";
  return "";
}

function readableTradeDirection(event) {
  const side = readableTradeSide(event);
  const coin = eventCoin(event);
  const leverage = eventLeverage(event);
  if (side === "long" || side === "short") {
    return [leverage, coin, side].filter(Boolean).join(" ") || titleCase(side);
  }
  if (side) return [titleCase(side), coin].filter(Boolean).join(" ");
  return coin || "--";
}

function readableTradeSide(event) {
  const metadata = eventMetadata(event);
  const text = [
    event.reason,
    event.client_event_id,
    metadata.side,
    metadata.direction,
    metadata.position_side,
    metadata.positionSide,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\blong\b/.test(text)) return "long";
  if (/\bshort\b/.test(text)) return "short";
  const side = String(metadata.side || event.side || "").toLowerCase();
  const market = eventMarketType(event);
  if (side === "buy" && market === "perp") return "long";
  if (side === "sell" && market === "perp") return "short";
  if (side === "buy" || side === "sell") return side;
  const eventId = String(event.client_event_id || "").toLowerCase();
  if (eventId.includes("-buy-")) return market === "perp" ? "long" : "buy";
  if (eventId.includes("-sell-")) return market === "perp" ? "short" : "sell";
  const assetIn = String(event.asset_in || "").toUpperCase();
  const assetOut = String(event.asset_out || "").toUpperCase();
  if (assetIn === "USD" && assetOut && assetOut !== "USD") return market === "perp" ? "long" : "buy";
  if (assetOut === "USD" && assetIn && assetIn !== "USD") return market === "perp" ? "short" : "sell";
  return "";
}

function eventCoin(event) {
  const metadata = eventMetadata(event);
  const direct = metadata.coin || event.coin;
  if (direct) return String(direct).toUpperCase();
  const assetOut = String(event.asset_out || "").toUpperCase();
  const assetIn = String(event.asset_in || "").toUpperCase();
  if (assetOut && assetOut !== "USD") return assetOut;
  if (assetIn && assetIn !== "USD") return assetIn;
  const match = String(event.reason || "").match(/\b(BTC|ETH|SOL|USDC|USDT|PURR)\b/i);
  return match ? match[1].toUpperCase() : "";
}

function eventLeverage(event) {
  const metadata = eventMetadata(event);
  const value = asNumber(metadata.leverage ?? event.leverage);
  if (value !== null) return `${Number.isInteger(value) ? value.toFixed(0) : String(value)}x`;
  const match = String(event.reason || "").match(/\b(\d+(?:\.\d+)?)\s*x\b/i);
  return match ? `${match[1]}x` : "";
}

function failureStatus(status) {
  return /fail|reject|cancel|error|liquidat/i.test(String(status || ""));
}

function renderModalSources(event, agent) {
  const txUrl = backendTxUrl(event.raw || {}, agent);
  const container = byId("modalSources");
  container.textContent = "";
  keyModalSources(event.sources).forEach((source) => {
    const { label, value } = readableSource(source);
    appendSourceRow(container, label, value);
  });
  if (txUrl) {
    const row = document.createElement("span");
    const name = document.createElement("b");
    name.textContent = "Explorer";
    const link = document.createElement("a");
    link.href = txUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "NearBlocks";
    row.append(name, link);
    container.append(row);
  }
}

function keyModalSources(sources) {
  const priority = ["paper_order_id", "intent_id", "client_event_id", "wallet", "source"];
  return sources
    .slice()
    .sort((left, right) => sourcePriority(left, priority) - sourcePriority(right, priority))
    .slice(0, 4);
}

function sourcePriority(source, priority) {
  const key = String(source).split(":")[0]?.trim();
  const index = priority.indexOf(key);
  return index === -1 ? priority.length : index;
}

function readableSource(source) {
  const [rawKey, ...rest] = String(source).split(":");
  const value = rest.join(":").trim();
  const key = rawKey.trim();
  const labels = {
    client_event_id: "Client event ID",
    intent_id: "Intent ID",
    network: "Network",
    paper_order_id: "Paper order ID",
    source: "Table",
    status_claim: "Backend status",
    tx_hash: "Tx hash",
    venue: "Venue",
    wallet: "Agent wallet",
  };
  return {
    label: labels[key] || titleCase(key),
    value: value || source,
  };
}

function appendSourceRow(container, label, value) {
  const row = document.createElement("span");
  const name = document.createElement("b");
  const code = document.createElement("code");
  name.textContent = label;
  code.textContent = value;
  row.append(name, code);
  container.append(row);
}

function closeModal() {
  byId("eventModal").hidden = true;
}

function bindUnlockButtons() {
  document.querySelectorAll("[data-unlock-agent]").forEach((button) => {
    button.addEventListener("click", buyOneForUnlock);
  });
}

function renderGateState(agent) {
  const unlocked = isUnlocked(agent);
  byId("chartPanel").classList.toggle("unlocked", unlocked);
  document.body.classList.toggle("is-unlocked", unlocked);
}

let columnSyncFrame = 0;
let chartAnimationPending = true;

function drawChartWithMotion() {
  if (chartAnimationPending) {
    chartAnimationPending = false;
    animateChart(selectedAgent());
  } else {
    drawChart(selectedAgent());
  }
}

function animateAgentChange() {
  const main = document.querySelector(".main");
  if (!main || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  main.classList.remove("agent-changing");
  void main.offsetWidth;
  main.classList.add("agent-changing");
  window.setTimeout(() => main.classList.remove("agent-changing"), 720);
}

function syncContentColumns() {
  window.cancelAnimationFrame(columnSyncFrame);
  columnSyncFrame = window.requestAnimationFrame(() => {
    const center = document.querySelector(".center");
    const right = document.querySelector(".right");
    if (!center || !right) return;

    center.style.height = "";
    right.style.height = "";

    if (window.matchMedia("(max-width: 1120px)").matches) {
      drawChartWithMotion();
      return;
    }

    center.style.height = "max-content";
    right.style.height = "max-content";
    const matchedHeight = Math.max(
      center.getBoundingClientRect().height,
      right.getBoundingClientRect().height
    );
    center.style.height = `${matchedHeight}px`;
    right.style.height = `${matchedHeight}px`;
    drawChartWithMotion();
  });
}
function render() {
  const agent = selectedAgent();
  renderGateState(agent);
  renderTicker();
  renderAgentList();
  renderHero(agent);
  renderRoom(agent);
  renderKeyActivity(agent);
  renderTicket(agent);
  bindUnlockButtons();
  syncContentColumns();
}

document.querySelectorAll(".ticket-tab").forEach((button) => {
  button.addEventListener("click", () => {
    tradeSide = button.dataset.side;
    clearQuote();
    document.querySelectorAll(".ticket-tab").forEach((item) => item.classList.remove("active", "buy", "sell"));
    button.classList.add("active", tradeSide);
    renderTicket(selectedAgent());
    scheduleKeyMarketRefresh("side-change");
    dispatchUiEvent("clawhouse:side-change");
  });
});

function syncChartRangeButtons() {
  document.querySelectorAll("[data-chart-range]").forEach((button) => {
    const active = button.dataset.chartRange === activeChartRange;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

document.querySelectorAll("[data-chart-range]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextRange = CHART_RANGES[button.dataset.chartRange] ? button.dataset.chartRange : "24h";
    if (nextRange === activeChartRange) return;
    activeChartRange = nextRange;
    activeEventId = null;
    chartAnimationPending = true;
    syncChartRangeButtons();
    renderHero(selectedAgent());
    renderRoom(selectedAgent());
    syncContentColumns();
    dispatchUiEvent("clawhouse:chart-range-change");
  });
});

const agentSortControl = byId("agentSort");
if (agentSortControl) {
  agentSortControl.value = agentSort;
  agentSortControl.addEventListener("change", () => {
    agentSort = agentSortControl.value === "events" ? "events" : "pnl";
    renderAgentList();
    dispatchUiEvent("clawhouse:agent-sort-change");
  });
}

document.querySelectorAll("[data-amount]").forEach((button) => {
  button.addEventListener("click", () => {
    byId("keyAmount").value = button.dataset.amount;
    clearQuote();
    renderTicket(selectedAgent());
    scheduleKeyMarketRefresh("amount-change");
    dispatchUiEvent("clawhouse:amount-change");
  });
});

const keyAmountInput = byId("keyAmount");
if (keyAmountInput) {
  keyAmountInput.addEventListener("input", () => {
    clearQuote();
    renderTicket(selectedAgent());
    scheduleKeyMarketRefresh("amount-change");
    dispatchUiEvent("clawhouse:amount-change");
  });
}

const tradeButton = byId("tradeButton");
if (tradeButton) {
  tradeButton.addEventListener("click", () => {
    const agent = selectedAgent();
    const amount = Math.max(Number(byId("keyAmount")?.value || 1), 0);
    if (amount <= 0) {
      showToast("Enter a key amount first.");
      return;
    }
    if (tradeSide === "sell" && (holderBalance(agent) ?? 0) <= 0) {
      showToast(`No ${agentTitle(agent)} key to sell.`);
      return;
    }
    showToast("Connect Wallet to continue.");
  });
}

byId("modalClose").addEventListener("click", closeModal);
byId("eventModal").addEventListener("click", (event) => {
  if (event.target === byId("eventModal")) closeModal();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});
window.addEventListener("resize", syncContentColumns);
window.addEventListener("resize", () => window.requestAnimationFrame(syncTickerSpeed));

function animateAsciiKey() {
  const key = document.querySelector(".ascii-key");
  const art = key?.querySelector("pre");
  const status = key?.querySelector("span");
  if (!key || !art || !status) return;

  const finalArt = art.textContent;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    status.textContent = "ACCESS KEY // ENCRYPTED";
    return;
  }

  const glyphs = "01#*+=-:.";
  const frames = 44;
  let frame = 0;
  key.classList.add("decoding");

  const decode = () => {
    const progress = frame / frames;
    const revealed = Math.floor(finalArt.length * progress);
    art.textContent = [...finalArt].map((char, index) => {
      if (/\s/.test(char) || index < revealed) return char;
      return glyphs[(index * 7 + frame * 3) % glyphs.length];
    }).join("");
    status.textContent = `DECODING // ${String(Math.min(100, Math.round(progress * 100))).padStart(2, "0")}%`;

    if (frame++ < frames) {
      window.setTimeout(decode, 42);
    } else {
      art.textContent = finalArt;
      status.textContent = "ACCESS KEY // ENCRYPTED";
      key.classList.remove("decoding");
    }
  };

  decode();
}

window.ClawHouseDemo = {
  getSelectedAgent: selectedAgent,
  getTradeSide: () => tradeSide,
  getKeyAmount: () => byId("keyAmount")?.value || "1",
  getChartRange: () => activeChartRange,
  getChartModel: () => chartModel(selectedAgent()),
  setChainState,
  showToast
};

syncChartRangeButtons();
render();
dispatchUiEvent("clawhouse:ready");
scheduleKeyMarketRefresh("initial", 0);
void loadDiscoveryAgents();
window.requestAnimationFrame(() => document.body.classList.add("ui-ready"));
animateAsciiKey();
if (query.get("event")) {
  openEvent(query.get("event"));
}
