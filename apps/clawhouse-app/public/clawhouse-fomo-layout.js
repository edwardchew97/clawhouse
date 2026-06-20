const agents = [
  {
    id: "terminal_chad6",
    name: "terminal_chad6",
    initials: "TC",
    color: "#3c4044",
    strategy: "terminal_chad6 / configured key-market agent",
    desc: "Reads key-market and backend ledger data from live APIs only.",
    key: null,
    holders: null,
    gate: "1 key",
    last: "checking",
    entry: null,
    keys: null,
  }
];

const query = new URLSearchParams(window.location.search);
document.body.classList.add("motion-prep");

let selectedId = query.get("agent") || agents[0].id;
if (!agents.some((agent) => agent.id === selectedId)) selectedId = agents[0].id;
let tradeSide = "buy";
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
  backend: null,
  error: null
};

const byId = (id) => document.getElementById(id);
const selectedAgent = () => agents.find((agent) => agent.id === selectedId) || agents[0];
const chainApplies = (agent) => chainState.state?.agent?.agent_id === agent.id;
const chainBalance = (agent) => {
  const value = chainState.state?.holder_balance;
  if (!chainApplies(agent) || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const holderBalance = (agent) => chainBalance(agent);
const isUnlocked = (agent) => (holderBalance(agent) ?? 0) > 0;

function dispatchUiEvent(name) {
  window.dispatchEvent(new CustomEvent(name));
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

function tradeStatus() {
  if (chainState.statusTitle || chainState.statusBody) {
    return {
      tone: chainState.statusTone || "idle",
      title: chainState.statusTitle || "Ready",
      body: chainState.statusBody || "Connect NEAR to buy or sell keys."
    };
  }
  if (chainState.pending) {
    return {
      tone: "pending",
      title: "Waiting for wallet",
      body: "Keep the NEAR wallet window open until it returns a result."
    };
  }
  if (chainState.error) {
    return {
      tone: "error",
      title: "Key market read failed",
      body: chainState.error
    };
  }
  return {
    tone: chainState.accountId ? "success" : "idle",
    title: chainState.accountId ? "Wallet ready" : "Ready",
    body: chainState.accountId ? `${shortAccount(chainState.accountId)} connected.` : "Connect NEAR to buy or sell keys."
  };
}

function hashName(name) {
  return [...name].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);
}

function agentIcon(agent) {
  const hash = hashName(agent.name);
  const accents = ["#63d8bd", "#69a7f5", "#e2b35e", "#76c989", "#e48169", "#aab6c5"];
  const accent = accents[hash % accents.length];
  const accentTwo = accents[(hash >>> 5) % accents.length];
  const rotation = hash % 360;
  const cut = 19 + (hash % 7);
  const id = `agent-${hash.toString(36)}`;
  const label = agent.name.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

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
  const supply = chainApplies(agent) ? Number(chainState.state?.agent?.supply) : NaN;
  return Number.isFinite(supply) ? supply : null;
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

function backendPnl(agent) {
  if (!backendApplies(agent) || !chainState.backend?.ok) return null;
  return normalizePct(chainState.backend?.pnl?.latest?.total_pnl_pct);
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
  byId("keyAmount").value = "1";
  showToast("Connect NEAR and confirm the key buy transaction.");
  dispatchUiEvent("clawhouse:amount-change");
}

function renderTicker() {
  const items = agents.flatMap((agent) => {
    const pnl = backendPnl(agent);
    const holders = holderCount(agent);
    return [
      `<span class="ticker-item"><b>${agent.name}</b><span class="${pnlClass(pnl)}">${pnlLabel(pnl)}</span><span>Backend P&L</span></span>`,
      `<span class="ticker-item"><b>${agent.name} key</b><span>${keyPriceLabel(agent)}</span><span>Testnet</span></span>`,
      `<span class="ticker-item"><b>${holders === null ? "--" : holders}</b><span>keys in ${agent.name}</span></span>`
    ];
  });
  byId("tickerTrack").innerHTML = items.concat(items).join("");
}

function renderAgentList() {
  byId("agentList").innerHTML = agents.map((agent, index) => {
    const pnl = backendPnl(agent);
    return `
    <button class="agent-row ${agent.id === selectedId ? "active" : ""}" data-agent="${agent.id}">
      <div class="avatar">${agentIcon(agent)}</div>
      <div class="agent-copy">
        <div class="agent-name">
          <span>${agent.name}</span>
          <span class="tag">${isUnlocked(agent) ? "open" : "locked"}</span>
        </div>
        <div class="agent-meta">${agent.strategy}</div>
        <div class="agent-stats">
          <span>${keyPriceLabel(agent)}</span>
          <span>${holderCount(agent) === null ? "--" : holderCount(agent)} keys</span>
          <b class="agent-change ${pnl === null ? "" : pnl < 0 ? "down" : ""}">${pnlLabel(pnl)}</b>
        </div>
      </div>
    </button>
  `;
  }).join("");

  document.querySelectorAll("[data-agent]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.agent;
      activeEventId = null;
      chartAnimationPending = true;
      clearQuote();
      render();
      dispatchUiEvent("clawhouse:agent-change");
      animateAgentChange();
    });
  });
}

function renderHero(agent) {
  const pnl = backendPnl(agent);
  const chart = chartModel(agent);
  byId("heroAvatar").innerHTML = agentIcon(agent);
  byId("heroName").textContent = agent.name;
  byId("heroDesc").textContent = agent.desc;
  byId("statPnl").textContent = pnl === null ? "--" : signedPct(pnl);
  byId("statPnl").className = pnl === null ? "" : pnl >= 0 ? "green" : "red";
  byId("statKey").textContent = keyPriceLabel(agent).replace(" tNEAR", "");
  const holders = holderCount(agent);
  byId("statHolders").textContent = holders === null ? "--" : holders.toLocaleString();
  byId("statUpdate").textContent = chainApplies(agent) ? "testnet live" : backendApplies(agent) && chainState.backend?.ok ? backendNetwork(agent) : agent.last;
  byId("statGate").textContent = isUnlocked(agent) ? "Unlocked" : "Locked";
  byId("priceMarker").textContent = pnl === null ? "backend" : signedPct(pnl);
  byId("priceMarker").style.background = pnl === null ? "var(--gray)" : pnl >= 0 ? "var(--green)" : "var(--red)";
  byId("miniTop").textContent = agent.name;
  byId("miniMove").textContent = pnl === null ? "--" : signedPct(pnl);
  byId("chartSub").textContent = isUnlocked(agent)
    ? `${chart.message} / ${backendNetwork(agent)}`
    : `Backend ${backendVenue(agent)} events unlock after key purchase.`;
}

function publicEventText(event) {
  return `${event.title} / holder-only detail`;
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
    const title = chainState.backend?.ok ? "No backend events yet" : "Backend events unavailable";
    const detail = chainState.backend?.ok
      ? "Agent Board Ledger has not returned any events for this board."
      : backendErrorMessage();
    renderBackendEmpty("roomFeed", title, detail);
    return;
  }

  if (!isUnlocked(agent)) {
    byId("roomFeed").innerHTML = `
      ${events.map((event) => `
        <article class="update locked">
          <div class="update-copy">
            <div class="update-title">
              <span>${escapeHtml(event.title)}</span>
              <span class="tag">locked</span>
            </div>
            <div class="update-text">${escapeHtml(formatBackendAction(event.raw || event))}</div>
          </div>
          <div class="update-time">${escapeHtml(event.time)}</div>
        </article>
      `).join("")}
      <div class="room-lock">
        <span class="lock-kicker">Holder room locked</span>
        <strong>Buy 1 ${agent.name} key to read agent updates.</strong>
        <span>V0 has no chat and no copy trading. Unlock reveals agent-generated short updates only.</span>
        <button class="unlock-cta" data-unlock-agent>Buy key to unlock</button>
      </div>
    `;
    bindUnlockButtons();
    return;
  }

  byId("roomFeed").innerHTML = events.map((event) => `
    <article class="update" data-event="${event.id}">
          <div class="update-copy">
        <div class="update-title">
          <span>${escapeHtml(event.title)}</span>
          <span class="tag">agent-only</span>
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

function renderActivity(agent) {
  const liveEvents = chartModel(agent).events;
  if (!liveEvents.length) {
    renderBackendEmpty(
      "activityList",
      chainState.backend?.ok ? "No backend tape yet" : "Backend tape unavailable",
      chainState.backend?.ok ? "No Agent Board Ledger event rows were returned." : backendErrorMessage()
    );
    return;
  }
  const rows = liveEvents.slice(0, 6).map((event) => [
    event.raw?.tx_hash || event.raw?.intent_id || event.raw?.client_event_id || event.id,
    event.raw?.status_claim || event.raw?.event_type || "event"
  ]);
  byId("activityList").innerHTML = rows.map((item) => `
    <div class="activity-row">
      <span><b>${escapeHtml(shortHash(String(item[0])))}</b> ${escapeHtml(titleCase(item[1]))}</span>
      <span class="side">${escapeHtml(item[1])}</span>
    </div>
  `).join("");
}

function renderTicket(agent) {
  const amount = Math.max(Number(byId("keyAmount").value || 1), 0);
  const balance = holderBalance(agent);
  const busy = Boolean(chainState.pending);
  const quote = chainApplies(agent) && chainState.quoteSide === tradeSide ? chainState.quote : null;
  const chainTotal = tradeSide === "sell" ? quote?.payout_near : quote?.total_cost_near;
  byId("quotePrice").textContent = chainTotal ? nearLabel(chainTotal) : keyPriceLabel(agent);
  byId("quoteTotal").textContent = chainTotal ? nearLabel(chainTotal) : "--";
  byId("quoteUnlock").textContent = isUnlocked(agent) ? "Additional room weight" : "Strategy + holder room";
  byId("tradeButton").textContent = busy
    ? statusButtonText()
    : `${chainState.accountId ? (tradeSide === "buy" ? "Buy" : "Sell") : "Connect NEAR to"} ${agent.name} key`;
  byId("tradeButton").className = `${tradeSide === "buy" ? "primary" : "primary sell"}${busy ? " loading" : ""}`;
  byId("tradeButton").disabled = busy || (tradeSide === "sell" && (balance === null || balance <= 0));
  document.querySelectorAll(".ticket-tab, [data-amount], [data-unlock-agent]").forEach((button) => {
    button.disabled = busy;
  });
  byId("keyAmount").disabled = busy;
  byId("posKeys").textContent = balance === null ? "--" : balance.toString();
  byId("posEntry").textContent = "-";
  byId("posExit").textContent = "-";
  byId("posExit").className = "";
  byId("shareTitle").textContent = isUnlocked(agent)
    ? `I unlocked ${agent.name}'s strategy room.`
    : `Buy a key to unlock ${agent.name}.`;
  setTextWithOptionalLink(
    byId("shareBody"),
    isUnlocked(agent)
      ? `${balance} key${balance === 1 ? "" : "s"} held / room open / receipt ready after testnet confirmation.`
      : chainState.accountId ? "No key balance returned yet / event reasoning hidden / holder room locked." : "Connect NEAR to read key balance.",
    isUnlocked(agent) && chainState.lastTxHash ? chainState.explorerUrl : null
  );
  byId("shareButton").disabled = !isUnlocked(agent);
  byId("gateButton").textContent = isUnlocked(agent) ? "Room open" : "Gate: 1 key";
  const walletButton = byId("walletButton");
  if (walletButton) {
    walletButton.textContent = chainState.accountId ? shortAccount(chainState.accountId) : "Connect NEAR";
    walletButton.classList.toggle("connected", Boolean(chainState.accountId));
    walletButton.disabled = busy;
  }
  renderTradeStatus();
  renderBackendStatus();
}

function statusButtonText() {
  if (chainState.phase === "connecting") return "Opening wallet...";
  if (chainState.phase === "quoting") return "Refreshing quote...";
  if (chainState.phase === "signing") return "Confirm in wallet...";
  if (chainState.phase === "refreshing") return "Refreshing balance...";
  return "Working...";
}

function renderTradeStatus() {
  const status = tradeStatus();
  const container = byId("tradeStatus");
  if (!container) return;
  container.className = `trade-status ${status.tone}`;
  byId("tradeStatusTitle").textContent = status.title;
  setTextWithOptionalLink(
    byId("tradeStatusBody"),
    status.body,
    status.tone === "success" && chainState.lastTxHash ? chainState.explorerUrl : null
  );
}

function renderBackendStatus() {
  const backend = backendLabel();
  byId("backendStatus").textContent = backend.status;
  byId("backendUrl").textContent = backend.url;
}

function chartGeometry(values, rect) {
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = Math.max(1, maxValue - minValue);
  const min = minValue - spread * 0.18;
  const max = maxValue + spread * 0.18;
  const pad = 22;
  const width = rect.width - pad * 2;
  const height = rect.height - pad * 2;
  return {
    pad,
    width,
    height,
    yFor: (value) => pad + (1 - (value - min) / (max - min)) * height,
    xFor: (index) => pad + (index / (values.length - 1)) * width
  };
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
    byId("chartEvents").innerHTML = "";
    return;
  }

  const geo = chartGeometry(values, rect);
  const zeroY = geo.yFor(0);
  const trend = values[values.length - 1] - values[0];

  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(geo.pad, zeroY);
  ctx.lineTo(rect.width - geo.pad, zeroY);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, rect.width * Math.max(0, Math.min(1, progress)), rect.height);
  ctx.clip();

  const gradient = ctx.createLinearGradient(0, geo.pad, 0, rect.height - geo.pad);
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
  ctx.lineTo(geo.xFor(values.length - 1), rect.height - geo.pad);
  ctx.lineTo(geo.xFor(0), rect.height - geo.pad);
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
    ctx.fillRect(x, rect.height - geo.pad - barHeight, barWidth, barHeight);
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
  if (progress >= 1) renderChartEvents(agent, rect, model);
  else byId("chartEvents").innerHTML = "";
}

function drawEmptyChart(ctx, rect, message) {
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i += 1) {
    const y = (rect.height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(18, y);
    ctx.lineTo(rect.width - 18, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.fillText("Backend chart data unavailable", 22, 36);
  ctx.fillStyle = "rgba(255,255,255,0.44)";
  ctx.font = "500 11px system-ui, sans-serif";
  wrapCanvasText(ctx, message || "No backend time series has been recorded for this agent.", 22, 56, rect.width - 44, 16);
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/);
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
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
        showToast("Buy this agent key to reveal strategy event details.");
        return;
      }
      openEvent(button.dataset.chartEvent);
    });
  });
}

function openEvent(eventId) {
  const agent = selectedAgent();
  if (!isUnlocked(agent)) {
    showToast("Buy this agent key to unlock holder-only reasoning.");
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
  renderActivity(agent);
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
    dispatchUiEvent("clawhouse:side-change");
  });
});

document.querySelectorAll("[data-amount]").forEach((button) => {
  button.addEventListener("click", () => {
    byId("keyAmount").value = button.dataset.amount;
    clearQuote();
    renderTicket(selectedAgent());
    dispatchUiEvent("clawhouse:amount-change");
  });
});

byId("keyAmount").addEventListener("input", () => {
  clearQuote();
  renderTicket(selectedAgent());
  dispatchUiEvent("clawhouse:amount-change");
});

byId("tradeButton").addEventListener("click", () => {
  const agent = selectedAgent();
  const amount = Math.max(Number(byId("keyAmount").value || 1), 0);
  if (amount <= 0) {
    showToast("Enter a key amount first.");
    return;
  }

  if (tradeSide === "sell") {
    if (holderBalance(agent) <= 0) {
      showToast(`No ${agent.name} key to sell.`);
      return;
    }
    showToast("Confirm the sell transaction in your NEAR wallet.");
    return;
  }

  showToast("Confirm the buy transaction in your NEAR wallet.");
});

byId("shareButton").addEventListener("click", () => {
  const agent = selectedAgent();
  if (!isUnlocked(agent)) {
    showToast("Buy a key before generating a receipt card.");
    return;
  }
  showToast("Share card generated from the latest testnet key receipt.");
});

byId("modalClose").addEventListener("click", closeModal);
byId("eventModal").addEventListener("click", (event) => {
  if (event.target === byId("eventModal")) closeModal();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});
window.addEventListener("resize", syncContentColumns);

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
window.requestAnimationFrame(() => document.body.classList.add("ui-ready"));
animateAsciiKey();
if (query.get("event")) {
  openEvent(query.get("event"));
}
