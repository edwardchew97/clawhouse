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
  error: null
};

const TICKER_PX_PER_SECOND = 18;

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
const isUnlocked = () => true;

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

function backendNetwork(agent) {
  const board = backendBoard(agent);
  const metadata = boardMetadata(agent);
  return metadata.network_id || metadata.networkId || board?.chain || "near";
}

function backendVenue(agent) {
  const board = backendBoard(agent);
  const metadata = boardMetadata(agent);
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

function formatBackendAction(event) {
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
  const network = `${backendNetwork(agent)} / ${backendVenue(agent)}`;
  const tx = event.tx_hash ? `Tx ${shortHash(event.tx_hash)}.` : event.intent_id ? `Intent ${shortHash(event.intent_id)}.` : "";
  return [action, status, network, tx].filter(Boolean).join(" ");
}

function backendTxUrl(event, agent) {
  if (!event.tx_hash) return null;
  const network = String(event.metadata?.network_id || event.metadata?.networkId || backendNetwork(agent)).toLowerCase();
  const host = network.includes("testnet") ? "testnet.nearblocks.io" : "nearblocks.io";
  return `https://${host}/txns/${encodeURIComponent(event.tx_hash)}`;
}

function normalizeBackendEvent(event, index, agent, valueIndex) {
  const status = event.status_claim || event.event_type || "event";
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  return {
    id: event.id || event.client_event_id || event.tx_hash || `backend-event-${index}`,
    index: valueIndex,
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

function backendEventSources(event, agent) {
  const sources = [
    `network: ${backendNetwork(agent)}`,
    `venue: ${backendVenue(agent)}`,
  ];
  if (event.status_claim) sources.push(`status_claim: ${event.status_claim}`);
  if (event.tx_hash) sources.push(`tx_hash: ${event.tx_hash}`);
  if (event.intent_id) sources.push(`intent_id: ${event.intent_id}`);
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
    const left = Date.parse(a.observed_at || a.reported_at || a.created_at || "");
    const right = Date.parse(b.observed_at || b.reported_at || b.created_at || "");
    return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
  });
}

function normalizeSeries(values) {
  const numeric = values.map(asNumber).filter((value) => value !== null);
  if (numeric.length < 2) return numeric;
  const first = numeric.find((value) => value !== 0) ?? numeric[0];
  if (!first) return numeric;
  return numeric.map((value) => ((value - first) / Math.abs(first)) * 100);
}

function chartModel(agent) {
  if (!chainState.backend || !backendApplies(agent)) {
    return { values: [], events: [], tone: "idle", message: "Reading staging backend for this agent." };
  }
  if (!chainState.backend.ok) {
    return { values: [], events: [], tone: "error", message: backendErrorMessage() };
  }

  const events = sortedByObservedAt(backendEvents(agent));
  const prices = sortedByObservedAt(backendPrices(agent)).filter((row) => asNumber(row.price_usd) !== null);
  const balanceChanges = sortedByObservedAt(backendBalanceChanges(agent));
  let values = [];
  let source = "backend events";

  if (prices.length >= 2) {
    values = normalizeSeries(prices.map((row) => row.price_usd));
    source = "backend price snapshots";
  } else if (balanceChanges.length >= 2) {
    let cumulative = 0;
    values = balanceChanges.map((row) => {
      cumulative += asNumber(row.delta_value_usd) ?? 0;
      return cumulative;
    });
    source = "backend balance changes";
  } else {
    const latestPnl = backendPnl(agent);
    if (latestPnl !== null) {
      values = [0, latestPnl];
      source = "backend latest P&L";
    }
  }

  const safeValues = values.length >= 2 ? values : [];
  const normalizedEvents = events.map((event, index) => {
    const valueIndex = safeValues.length > 1
      ? Math.min(safeValues.length - 1, Math.round((index / Math.max(1, events.length - 1)) * (safeValues.length - 1)))
      : 0;
    return normalizeBackendEvent(event, index, agent, valueIndex);
  });

  return {
    values: safeValues,
    events: normalizedEvents,
    tone: "success",
    source,
    message: safeValues.length ? source : "Backend is connected, but no chartable network series has been recorded yet.",
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
    return `
    <button class="agent-row" data-agent="${escapeHtml(selectionKey)}" data-agent-id="${escapeHtml(agent.id)}" data-selected="${selected ? "true" : "false"}" aria-label="Open ${escapeHtml(title)}">
      <div class="avatar">${agentIcon(agent)}</div>
      <div class="agent-copy">
        <div class="agent-name">
          <span class="agent-title" title="${escapeHtml(agent.name)}">${escapeHtml(title)}</span>
          <span class="tag">key market</span>
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
  byId("heroAvatar").innerHTML = agentIcon(agent);
  byId("heroBannerImage").src = agent.bannerUrl || DEFAULT_AGENT_BANNER_URL;
  byId("heroName").textContent = title;
  byId("heroDesc").textContent = agent.desc;
  byId("statPnl").textContent = pnl === null ? "--" : signedPct(pnl);
  byId("statPnl").className = pnl === null ? "" : pnl >= 0 ? "green" : "red";
  byId("statKey").textContent = keyPriceLabel(agent).replace(" tNEAR", "");
  const holders = holderCount(agent);
  byId("statHolders").textContent = holders === null ? "--" : holders.toLocaleString();
  byId("statUpdate").textContent = chainApplies(agent) ? "testnet live" : backendApplies(agent) && chainState.backend?.ok ? backendNetwork(agent) : agent.last;
  byId("statGate").textContent = holderBalance(agent) > 0 ? "Unlocked" : "1 key";
  byId("priceMarker").textContent = pnl === null ? "backend" : signedPct(pnl);
  byId("priceMarker").style.background = pnl === null ? "var(--gray)" : pnl >= 0 ? "var(--green)" : "var(--red)";
  byId("miniTop").textContent = title;
  byId("miniMove").textContent = pnl === null ? "--" : signedPct(pnl);
  byId("leaderDataSource").textContent = pnlSource;
  byId("chartSub").textContent = `${chart.message} / ${backendNetwork(agent)} / ${pnlSource} / key market ${chainApplies(agent) ? "live" : "checking"}`;
}

function publicEventText(event) {
  return `${event.title} / ${formatBackendAction(event.raw || event)}`;
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
  const events = chartModel(agent).events;
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
          <div class="update-copy">
        <div class="update-title">
          <span>${escapeHtml(event.title)}</span>
          <span class="tag">agent event</span>
        </div>
        <div class="update-text">${escapeHtml(event.summary)}</div>
      </div>
      <div class="update-time">${escapeHtml(event.time)}</div>
    </article>
  `).join("");

  document.querySelectorAll("[data-event]").forEach((button) => {
    button.addEventListener("click", () => openEvent(button.dataset.event));
  });
}

function renderKeyActivity(agent) {
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
    <div class="activity-row key-activity-row">
      <span><b>${escapeHtml(row.title)}</b> ${escapeHtml(row.detail)}</span>
      <span class="side">${row.linkUrl ? `<a href="${escapeHtml(row.linkUrl)}" target="_blank" rel="noreferrer">${escapeHtml(row.side)}</a>` : escapeHtml(row.side)}</span>
    </div>
  `).join("");
}

function keyActivityRows(agent) {
  const rows = [];
  const trades = keyActivityTrades(agent);
  const latestTxHash = chainState.lastTxHash;

  if (latestTxHash && !trades.some((trade) => trade.tx_hash === latestTxHash)) {
    rows.push({
      title: chainState.statusTitle || "Key trade complete",
      detail: `Tx ${shortHash(latestTxHash)}`,
      side: "NearBlocks",
      linkUrl: chainState.explorerUrl,
    });
  }

  for (const trade of trades) {
    rows.push({
      title: titleCase(trade.side),
      detail: `${trade.amount} key${trade.amount === "1" ? "" : "s"} by ${shortAccount(trade.trader_id)}`,
      side: keyTradeValueLabel(trade),
      linkUrl: keyTradeExplorerUrl(trade),
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
  byId("quotePrice").textContent = chainTotal ? nearLabel(chainTotal) : keyPriceLabel(agent);
  byId("quoteTotal").textContent = chainTotal ? nearLabel(chainTotal) : "--";
  byId("quoteUnlock").textContent = balance && balance > 0 ? "Additional room weight" : "Holder room";
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
  byId("posKeys").textContent = balance === null ? "--" : balance.toString();
  byId("posEntry").textContent = "-";
  byId("posExit").textContent = "-";
  byId("posExit").className = "";
  byId("gateButton").textContent = balance && balance > 0 ? "Room open" : "Gate: 1 key";
  const walletButton = byId("walletButton");
  if (walletButton) {
    walletButton.textContent = chainState.accountId ? shortAccount(chainState.accountId) : "Connect Wallet";
    walletButton.classList.toggle("connected", Boolean(chainState.accountId));
    walletButton.disabled = busy;
  }
  renderBackendStatus();
}

function statusButtonText() {
  if (chainState.phase === "connecting") return "Opening wallet...";
  if (chainState.phase === "quoting") return "Refreshing quote...";
  if (chainState.phase === "signing") return "Confirm in wallet...";
  if (chainState.phase === "refreshing") return "Refreshing balance...";
  return "Working...";
}

function renderBackendStatus() {
  if (!byId("backendStatus") || !byId("backendUrl")) return;
  const backend = backendLabel();
  byId("backendStatus").textContent = backend.status;
  byId("backendUrl").textContent = backend.url;
}

function chartGeometry(values, rect) {
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 0);
  const spread = Math.max(1, maxValue - minValue);
  const paddedMin = minValue - spread * 0.12;
  const paddedMax = maxValue + spread * 0.12;
  const tickStep = niceTickStep(paddedMax - paddedMin, 5);
  const min = Math.floor(paddedMin / tickStep) * tickStep;
  const max = Math.ceil(paddedMax / tickStep) * tickStep;
  const left = 48;
  const right = 18;
  const top = 24;
  const bottom = 30;
  const width = Math.max(1, rect.width - left - right);
  const height = Math.max(1, rect.height - top - bottom);
  const ticks = [];
  for (let tick = min; tick <= max + tickStep / 2; tick += tickStep) ticks.push(tick);
  return {
    left,
    right,
    top,
    bottom,
    rightX: rect.width - right,
    bottomY: rect.height - bottom,
    width,
    height,
    min,
    max,
    ticks,
    yFor: (value) => top + (1 - (value - min) / (max - min)) * height,
    xFor: (index) => left + (values.length > 1 ? index / (values.length - 1) : 1) * width
  };
}

function niceTickStep(range, targetIntervals) {
  const rough = Math.max(0.1, range / targetIntervals);
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  if (fraction <= 1) return power;
  if (fraction <= 2) return 2 * power;
  if (fraction <= 5) return 5 * power;
  return 10 * power;
}

function drawChart(agent, progress = 1) {
  const canvas = byId("pnlChart");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const model = chartModel(agent);
  const values = model.values;
  if (values.length < 2) {
    drawEmptyChart(ctx, rect, model.message);
    setChartEmptyState(true, model.message);
    byId("chartEvents").innerHTML = "";
    hidePriceMarker();
    return;
  }
  setChartEmptyState(false);

  const geo = chartGeometry(values, rect);
  const zeroY = geo.yFor(0);
  const trend = values[values.length - 1] - values[0];
  drawChartAxes(ctx, geo, values);

  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(geo.left, zeroY);
  ctx.lineTo(geo.rightX, zeroY);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(geo.left, geo.top, geo.width * Math.max(0, Math.min(1, progress)), geo.height);
  ctx.clip();

  const gradient = ctx.createLinearGradient(0, geo.top, 0, geo.bottomY);
  if (trend >= 0) {
    gradient.addColorStop(0, "rgba(30,203,115,0.34)");
    gradient.addColorStop(1, "rgba(30,203,115,0)");
  } else {
    gradient.addColorStop(0, "rgba(255,106,74,0.3)");
    gradient.addColorStop(1, "rgba(255,106,74,0)");
  }

  ctx.beginPath();
  values.forEach((value, index) => {
    const x = geo.xFor(index);
    const y = geo.yFor(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(geo.xFor(values.length - 1), geo.bottomY);
  ctx.lineTo(geo.xFor(0), geo.bottomY);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  values.forEach((value, index) => {
    const x = geo.xFor(index);
    const y = geo.yFor(value);
    if (index === 0) ctx.moveTo(x, y);
    else {
      const prevX = geo.xFor(index - 1);
      const prevY = geo.yFor(values[index - 1]);
      const midX = (prevX + x) / 2;
      ctx.bezierCurveTo(midX, prevY, midX, y, x, y);
    }
  });
  ctx.strokeStyle = trend >= 0 ? "#1ecb73" : "#ff6a4a";
  ctx.lineWidth = 2.4;
  ctx.shadowColor = trend >= 0 ? "rgba(30,203,115,0.38)" : "rgba(255,106,74,0.38)";
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (let i = 0; i < values.length - 1; i += 1) {
    const barWidth = Math.max(3, geo.width / values.length / 2.4);
    const x = geo.xFor(i) - barWidth / 2;
    const barHeight = 12 + Math.abs(values[i + 1] - values[i]) * 9;
    ctx.fillStyle = values[i + 1] >= values[i] ? "rgba(30,203,115,0.28)" : "rgba(255,106,74,0.28)";
    ctx.fillRect(x, geo.bottomY - barHeight, barWidth, barHeight);
  }

  values.forEach((value, index) => {
    if (index % 5 !== 0 && index !== values.length - 1) return;
    ctx.beginPath();
    ctx.arc(geo.xFor(index), geo.yFor(value), index === values.length - 1 ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = trend >= 0 ? "#1ecb73" : "#ff6a4a";
    ctx.fill();
    ctx.strokeStyle = "#030405";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.restore();
  updatePriceMarker(canvas, model, geo);
  if (progress >= 1) renderChartEvents(agent, rect, model);
  else byId("chartEvents").innerHTML = "";
}

function drawEmptyChart(ctx, rect, message) {
  const geo = chartGeometry([-10, 0, 10], rect);
  drawChartAxes(ctx, geo, [-10, 0, 10]);
}

function setChartEmptyState(isEmpty, message = "") {
  const panel = byId("chartPanel");
  const overlay = byId("chartEmptyOverlay");
  if (!panel || !overlay) return;
  panel.classList.toggle("is-empty", isEmpty);
  overlay.hidden = !isEmpty;
  if (!isEmpty) return;
  byId("chartEmptyTitle").textContent = "Backend chart data unavailable";
  byId("chartEmptyDetail").textContent = message || "No backend time series has been recorded for this agent.";
}

function axisPctLabel(value) {
  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  const display = Math.abs(normalized) >= 10 ? Math.round(normalized) : Number(normalized.toFixed(1));
  return `${display > 0 ? "+" : ""}${display}%`;
}

function drawChartAxes(ctx, geo, values) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = "500 10px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  geo.ticks.forEach((tick) => {
    const y = geo.yFor(tick);
    ctx.strokeStyle = "rgba(255,255,255,0.055)";
    ctx.beginPath();
    ctx.moveTo(geo.left, y);
    ctx.lineTo(geo.rightX, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.fillText(axisPctLabel(tick), geo.left - 8, y);
  });

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(geo.left, geo.top);
  ctx.lineTo(geo.left, geo.bottomY);
  ctx.lineTo(geo.rightX, geo.bottomY);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.52)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("P&L %", geo.left, 8);

  const lastIndex = values.length - 1;
  const xTicks = lastIndex > 1
    ? [
      { index: 0, label: "start" },
      { index: Math.round(lastIndex / 2), label: "mid" },
      { index: lastIndex, label: "latest" },
    ]
    : [
      { index: 0, label: "start" },
      { index: lastIndex, label: "latest" },
    ];

  ctx.textBaseline = "top";
  xTicks.forEach((tick) => {
    const x = geo.xFor(tick.index);
    ctx.textAlign = tick.index === 0 ? "left" : tick.index === lastIndex ? "right" : "center";
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.fillText(tick.label, x, geo.bottomY + 9);
  });
  ctx.restore();
}

function hidePriceMarker() {
  const marker = byId("priceMarker");
  marker.hidden = true;
}

function updatePriceMarker(canvas, model, geo) {
  const marker = byId("priceMarker");
  const latest = model.values[model.values.length - 1];
  marker.hidden = false;
  marker.textContent = signedPct(latest);
  marker.style.background = latest >= 0 ? "var(--green)" : "var(--red)";
  marker.style.color = latest >= 0 ? "#03140b" : "#230702";
  marker.style.boxShadow = latest >= 0 ? "0 0 24px rgba(32, 239, 131, 0.28)" : "0 0 24px rgba(255, 106, 74, 0.26)";
  marker.style.top = `${canvas.offsetTop + geo.yFor(latest)}px`;
}

let chartAnimationFrame = 0;

function animateChart(agent) {
  window.cancelAnimationFrame(chartAnimationFrame);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    drawChart(agent);
    return;
  }

  const startedAt = performance.now();
  const duration = 920;
  const tick = (now) => {
    const linear = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - linear, 3);
    drawChart(agent, eased);
    if (linear < 1) chartAnimationFrame = window.requestAnimationFrame(tick);
  };
  chartAnimationFrame = window.requestAnimationFrame(tick);
}

function renderChartEvents(agent, rect, model = chartModel(agent)) {
  const unlocked = isUnlocked(agent);
  if (model.values.length < 2 || !model.events.length) {
    byId("chartEvents").innerHTML = "";
    return;
  }
  const geo = chartGeometry(model.values, rect);
  const eventHtml = model.events.map((event, eventIndex) => {
    const x = geo.xFor(event.index);
    const y = geo.yFor(model.values[event.index]);
    const labelY = y < 78 ? y + 28 : y - 46;
    return `
      <button
        class="event-marker ${unlocked ? "" : "locked"} ${activeEventId === event.id ? "active" : ""}"
        data-chart-event="${event.id}"
        style="left:${x}px; top:${y}px"
        aria-label="${escapeHtml(unlocked ? event.title : "Locked backend event")}"
      >E${eventIndex + 1}</button>
      <span class="event-label ${unlocked ? "" : "locked"}" style="left:${x}px; top:${labelY}px">
        ${escapeHtml(unlocked ? event.label : publicEventText(event))}
      </span>
    `;
  }).join("");
  byId("chartEvents").innerHTML = eventHtml;

  document.querySelectorAll("[data-chart-event]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isUnlocked(selectedAgent())) {
        showToast("Agent event details are open in this preview.");
        return;
      }
      openEvent(button.dataset.chartEvent);
    });
  });
}

function openEvent(eventId) {
  const agent = selectedAgent();
  if (!isUnlocked(agent)) {
    showToast("Agent event details are open in this preview.");
    return;
  }
  const event = chartModel(agent).events.find((item) => item.id === eventId);
  if (!event) return;
  activeEventId = event.id;
  renderChartEvents(agent, byId("pnlChart").getBoundingClientRect());
  renderBackendEventModal(agent, event);
  byId("eventModal").hidden = false;
}

function renderBackendEventModal(agent, event) {
  const raw = event.raw || {};
  byId("modalKicker").textContent = `${agent.name} / ${event.time}`;
  byId("modalTitle").textContent = event.title;
  byId("modalSummary").textContent = event.summary;
  byId("modalMetricLabel").textContent = raw.status_claim ? "Backend status" : "Event type";
  byId("modalMove").textContent = raw.status_claim || raw.event_type || "event";
  byId("modalMove").className = String(raw.status_claim || "").toLowerCase().includes("fail") ? "red" : "green";
  byId("modalMoveHint").textContent = raw.id || "Agent Board Ledger";
  byId("modalNetwork").textContent = backendNetwork(agent);
  byId("modalVenue").textContent = backendVenue(agent);
  byId("modalAction").textContent = event.action;
  byId("modalReason").textContent = event.reason;
  byId("modalPath").innerHTML = eventPathItems(raw).map((item, index) => `
    <span><b>${String(index + 1).padStart(2, "0")}</b>${escapeHtml(item)}</span>
  `).join("");
  renderModalSources(event, agent);
}

function eventPathItems(event) {
  return [
    event.client_event_id ? `client ${shortHash(event.client_event_id)}` : "client event",
    event.intent_id ? `intent ${shortHash(event.intent_id)}` : titleCase(event.status_claim || "status"),
    event.tx_hash ? `tx ${shortHash(event.tx_hash)}` : titleCase(event.event_type || "ledger row"),
  ];
}

function renderModalSources(event, agent) {
  const txUrl = backendTxUrl(event.raw || {}, agent);
  const container = byId("modalSources");
  container.textContent = "";
  event.sources.forEach((source) => {
    const row = document.createElement("span");
    row.textContent = source;
    container.append(row);
  });
  if (txUrl) {
    const row = document.createElement("span");
    row.textContent = "explorer: ";
    const link = document.createElement("a");
    link.href = txUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "NearBlocks";
    row.append(link);
    container.append(row);
  }
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
  byId("chartPanel").classList.add("unlocked");
  document.body.classList.add("is-unlocked");
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
  setChainState,
  showToast
};

render();
dispatchUiEvent("clawhouse:ready");
scheduleKeyMarketRefresh("initial", 0);
void loadDiscoveryAgents();
window.requestAnimationFrame(() => document.body.classList.add("ui-ready"));
animateAsciiKey();
if (query.get("event")) {
  openEvent(query.get("event"));
}
