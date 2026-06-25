import fs from "node:fs";
import vm from "node:vm";

const script = fs.readFileSync(new URL("../public/clawhouse-fomo-layout.js", import.meta.url), "utf8");
const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

const agents = [
  agent("terminal_chad6", "terminal_chad6", 0.12, 5),
  agent("codex_main_20260620", "codex_board", 0.25, 1),
  agent("empty_agent", "empty_board", null, 0),
  agent("ledger-lane-agent-edge-20260620-0936-a13c", "ledger-lane-ft", null, 0),
  agent("ledger-lane-agent-edge-20260620-0936-a13c", "ledger-lane-flow", null, 0),
];

const elements = new Map();
const events = new Map();
let clearCrosshairCalls = 0;
let chartTimeCoordinateOffset = 0;
let visibleLogicalRangeListener = null;
const ticketTabs = new Map();
const amountButtons = new Map();
const filterCheckboxes = new Map();
let resolveAgentDiscovery;
const agentDiscoveryResponse = new Promise((resolve) => {
  resolveAgentDiscovery = () => resolve(jsonResponse({ ok: true, agents }));
});

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  toggle(name, force) {
    if (force === true) {
      this.values.add(name);
      return true;
    }
    if (force === false) {
      this.values.delete(name);
      return false;
    }
    if (this.values.has(name)) {
      this.values.delete(name);
      return false;
    }
    this.values.add(name);
    return true;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.dataset = {};
    this.style = {
      setProperty() {},
      removeProperty() {},
    };
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.value = id === "keyAmount" ? "1" : "";
    this.checked = false;
    this.textContent = "";
    this.className = "";
    this.src = "";
    this.disabled = false;
    this.hidden = false;
    this.scrollWidth = 800;
    this.children = [];
    this.rows = new Map();
    this.chartEventButtons = new Map();
    this.clientWidth = 640;
    this.clientHeight = 320;
    this.offsetTop = 0;
    this._innerHTML = "";
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this.id === "agentList") {
      const nextRows = new Map();
      for (const match of this._innerHTML.matchAll(/<button class="agent-row[^"]*" data-agent="([^"]+)" data-agent-id="([^"]+)"[^>]*>/g)) {
        const key = match[1];
        const row = this.rows.get(key) ?? new FakeElement(`row-${key}`);
        row.dataset.agent = key;
        row.dataset.agentId = match[2];
        nextRows.set(key, row);
      }
      this.rows = nextRows;
    }
    if (this.id === "chartEvents") {
      const nextButtons = new Map();
      for (const match of this._innerHTML.matchAll(/<button[\s\S]*?data-chart-event="([^"]+)"[\s\S]*?>([\s\S]*?)<\/button>/g)) {
        const key = match[1];
        const button = this.chartEventButtons.get(key) ?? new FakeElement(`chart-event-${key}`);
        button.dataset.chartEvent = key;
        button.textContent = match[2].match(/Order\s+\d+/)?.[0] ?? match[2].replace(/<[^>]*>/g, "").trim();
        nextButtons.set(key, button);
      }
      this.chartEventButtons = nextButtons;
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append() {}

  appendChild() {}

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  click() {
    if (this.dataset.agentFilter) {
      this.checked = !this.checked;
      this.listeners.get("change")?.({ target: this });
      return;
    }
    this.listeners.get("click")?.({ target: this });
  }

  querySelector() {
    return null;
  }

  querySelectorAll(selector) {
    if (this.id === "agentList" && selector === "[data-agent]") return [...this.rows.values()];
    if (this.id === "chartEvents" && selector === "[data-chart-event]") return [...this.chartEventButtons.values()];
    return [];
  }

  getBoundingClientRect() {
    return { width: 640, height: 320, top: 0, left: 0, right: 640, bottom: 320 };
  }

  getContext() {
    return {
      clearRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fill() {},
      arc() {},
      fillText() {},
      setLineDash() {},
      createLinearGradient() {
        return { addColorStop() {} };
      },
    };
  }
}

function agent(id, boardId, totalPnlPct, holders, keyMarketStatus = "unavailable") {
  const keyMarketAvailable = keyMarketStatus === "available";
  return {
    id,
    boardId,
    name: id,
    initials: id.slice(0, 2).toUpperCase(),
    strategy: `${id} / hyperliquid-paper`,
    description: "Workbench test agent.",
    gate: "1 key",
    status: "available",
    keyMarket: {
      status: keyMarketStatus,
      data: keyMarketAvailable ? { agent: { agent_id: id, name: id, supply: holders } } : undefined,
    },
    board: {
      status: "available",
      data: { id: boardId, agent_id: id },
    },
    pnl: totalPnlPct === null
      ? { status: "available", data: { ok: true, board_id: boardId, latest: null } }
      : { status: "available", data: { ok: true, board_id: boardId, latest: { total_pnl_pct: totalPnlPct } } },
  };
}

function element(id) {
  if (!elements.has(id)) elements.set(id, new FakeElement(id));
  return elements.get(id);
}

function keyActivityFixture() {
  return {
    ok: true,
    agent_id: "codex_main_20260620",
    trades: [
      {
        side: "buy",
        amount: "2",
        trader_id: "buyer.codex.testnet",
        tx_hash: "4pC5G5keyActivityTxHash",
        network_id: "testnet",
        total_cost: "150000000000000000000000",
      },
    ],
  };
}

function ticketTab(side) {
  if (!ticketTabs.has(side)) {
    const tab = new FakeElement(`ticket-${side}`);
    tab.dataset.side = side;
    ticketTabs.set(side, tab);
  }
  return ticketTabs.get(side);
}

function amountButton(amount) {
  if (!amountButtons.has(amount)) {
    const button = new FakeElement(`amount-${amount}`);
    button.dataset.amount = amount;
    amountButtons.set(amount, button);
  }
  return amountButtons.get(amount);
}

function filterCheckbox(filter) {
  if (!filterCheckboxes.has(filter)) {
    const input = new FakeElement(`filter-${filter}`);
    input.dataset.agentFilter = filter;
    filterCheckboxes.set(filter, input);
  }
  return filterCheckboxes.get(filter);
}

function paperActivityFixture() {
  const rejectedOrders = Array.from({ length: 15 }, (_, index) => ({
    id: `paper_ord_rejected_${index + 1}`,
    client_order_id: `paper-client-rejected-${index + 1}`,
    market_type: "perp",
    coin: index % 2 === 0 ? "ETH" : "BTC",
    side: index % 2 === 0 ? "sell" : "buy",
    status: "rejected",
    reject_reason: "stale_market_data",
    size: 0.01,
    margin_mode: "cross",
    leverage: 2,
    created_at: new Date(Date.parse("2026-06-23T11:11:00.000Z") + index * 60_000).toISOString(),
  }));

  return {
    ok: true,
    account: {
      id: "codex_board",
      agent_id: "codex_main_20260620",
      starting_balance_usd: 1000,
      created_at: "2026-06-23T11:00:00.000Z",
    },
    positions: [
      { coin: "BTC", signed_size: 0.01 },
      { coin: "ETH", signed_size: -0.02 },
    ],
    latest_risk: {
      equity_usd: 1002,
      total_notional_usd: 150,
      created_at: "2026-06-23T11:10:05.000Z",
    },
    risk_snapshots: [
      { equity_usd: 999, created_at: "2026-06-23T11:05:00.000Z" },
      { equity_usd: 1002, created_at: "2026-06-23T11:10:05.000Z" },
    ],
    orders: [
      {
        id: "paper_ord_first_fill",
        client_order_id: "paper-client-first-fill",
        market_type: "perp",
        coin: "BTC",
        side: "buy",
        status: "filled",
        size: 0.01,
        avg_fill_px: 100,
        margin_mode: "cross",
        leverage: 2,
        created_at: "2026-06-23T11:10:00.000Z",
      },
      ...rejectedOrders,
    ],
    fills: [{ id: "fill-1" }],
    summary: {
      total_orders: 16,
      filled_orders: 1,
      rejected_orders: 15,
      total_fills: 1,
      latest_order_at: "2026-06-23T11:25:00.000Z",
      latest_fill_at: "2026-06-23T11:10:00.000Z",
      latest_risk_at: "2026-06-23T11:10:05.000Z",
    },
  };
}

function noFillPaperActivityFixture() {
  return {
    ok: true,
    account: {
      id: "codex_board",
      agent_id: "codex_main_20260620",
      starting_balance_usd: 1000,
      created_at: "2026-06-23T11:00:00.000Z",
    },
    positions: [],
    latest_risk: {
      equity_usd: 1001,
      total_notional_usd: 0,
      created_at: "2026-06-23T11:02:00.000Z",
    },
    risk_snapshots: [
      { equity_usd: 999, created_at: "2026-06-23T11:01:00.000Z" },
      { equity_usd: 1001, created_at: "2026-06-23T11:02:00.000Z" },
    ],
    orders: [
      {
        id: "paper_ord_no_fill_rejected",
        client_order_id: "paper-client-no-fill-rejected",
        market_type: "perp",
        coin: "BTC",
        side: "buy",
        status: "rejected",
        reject_reason: "stale_market_data",
        size: 0.01,
        margin_mode: "cross",
        leverage: 2,
        created_at: "2026-06-23T11:01:30.000Z",
      },
    ],
    fills: [],
    summary: {
      total_orders: 1,
      filled_orders: 0,
      rejected_orders: 1,
      total_fills: 0,
      latest_order_at: "2026-06-23T11:01:30.000Z",
      latest_fill_at: null,
      latest_risk_at: "2026-06-23T11:02:00.000Z",
    },
  };
}

function oldOpenPositionActivityFixture() {
  return {
    ok: true,
    account: {
      id: "codex_board",
      agent_id: "codex_main_20260620",
      starting_balance_usd: 10000,
      created_at: "2026-06-23T10:00:00.000Z",
    },
    positions: [
      {
        id: "paper_pos_old_btc",
        coin: "BTC",
        signed_size: 0.001,
        entry_px: 62449,
        leverage: 3,
        status: "open",
        market_type: "perp",
        created_at: "2026-06-23T15:58:25.175Z",
        updated_at: "2026-06-23T15:58:25.175Z",
      },
    ],
    latest_risk: {
      equity_usd: 10000.23,
      total_notional_usd: 62.7,
      created_at: "2026-06-24T01:20:00.000Z",
    },
    risk_snapshots: [
      { equity_usd: 10000.38, created_at: "2026-06-24T01:10:00.000Z" },
      { equity_usd: 10000.23, created_at: "2026-06-24T01:20:00.000Z" },
    ],
    orders: [
      {
        id: "paper_ord_old_btc",
        client_order_id: "paper-client-old-btc",
        market_type: "perp",
        coin: "BTC",
        side: "buy",
        status: "filled",
        size: 0.001,
        avg_fill_px: 62449,
        margin_mode: "cross",
        leverage: 3,
        created_at: "2026-06-23T15:58:25.175Z",
      },
    ],
    fills: [{ id: "fill-old-btc" }],
    summary: {
      total_orders: 1,
      filled_orders: 1,
      rejected_orders: 0,
      total_fills: 1,
      latest_order_at: "2026-06-23T15:58:25.175Z",
      latest_fill_at: "2026-06-23T15:58:25.175Z",
      latest_risk_at: "2026-06-24T01:20:00.000Z",
    },
  };
}

function rangeFilteredPaperActivityFixture() {
  return {
    ok: true,
    account: {
      id: "codex_board",
      agent_id: "codex_main_20260620",
      starting_balance_usd: 10000,
      created_at: "2026-06-23T10:00:00.000Z",
    },
    positions: [{ coin: "BTC", signed_size: 0.02 }],
    latest_risk: {
      equity_usd: 20966.5,
      total_notional_usd: 400,
      created_at: "2026-06-23T13:03:00.000Z",
    },
    risk_snapshots: [
      { equity_usd: 10000, created_at: "2026-06-23T12:45:00.000Z" },
      { equity_usd: 20966.5, created_at: "2026-06-23T13:03:00.000Z" },
    ],
    orders: [
      {
        id: "paper_ord_old_fill",
        client_order_id: "paper-client-old-fill",
        market_type: "perp",
        coin: "BTC",
        side: "buy",
        status: "filled",
        size: 0.01,
        avg_fill_px: 100,
        margin_mode: "cross",
        leverage: 2,
        created_at: "2026-06-23T11:10:00.000Z",
      },
      {
        id: "paper_ord_recent_fill",
        client_order_id: "paper-client-recent-fill",
        market_type: "perp",
        coin: "BTC",
        side: "buy",
        status: "filled",
        size: 0.01,
        avg_fill_px: 110,
        margin_mode: "cross",
        leverage: 2,
        created_at: "2026-06-23T12:45:00.000Z",
      },
    ],
    fills: [{ id: "fill-old" }, { id: "fill-recent" }],
    summary: {
      total_orders: 2,
      filled_orders: 2,
      rejected_orders: 0,
      total_fills: 2,
      latest_order_at: "2026-06-23T12:45:00.000Z",
      latest_fill_at: "2026-06-23T12:45:00.000Z",
      latest_risk_at: "2026-06-23T13:03:00.000Z",
    },
  };
}

function keyStateFixture(agentId, holderBalance) {
  return {
    agent: {
      agent_id: agentId,
      supply: "11",
      reserve_near: "2.5",
    },
    holder_balance: holderBalance,
    next_buy_price: {
      total_cost_near: "0.1958",
    },
  };
}

function maxBuyFixture(agentId, accountId, amount) {
  return {
    ok: true,
    agent_id: agentId,
    account_id: accountId,
    maxBuy: {
      amount,
      quote: {
        total_cost_near: "1.3706",
      },
      attached_deposit_near: "1.3906",
    },
  };
}

function selectedBackend(boardId, totalPnlPct, paperActivity = null, leaderboard = null) {
  return {
    ok: true,
    boardId,
    board: { id: boardId },
    pnl: { latest: { total_pnl_pct: totalPnlPct } },
    paperLeaderboard: {
      leaderboard: leaderboard ?? [
        {
          paper_account_id: "codex_board",
          agent_id: "codex_main_20260620",
          equity_usd: 1250,
          paper_pnl_pct: 0.25,
          stale_data_status: "fresh",
          created_at: "2026-06-24T01:23:45.000Z",
        },
        {
          agent_id: "ledger-lane-agent-edge-20260620-0936-a13c",
          paper_pnl_pct: 0.12,
        },
      ],
    },
    paperActivity,
  };
}

function rows() {
  return [...element("agentList").innerHTML.matchAll(/<button class="agent-row" data-agent="([^"]+)" data-agent-id="([^"]+)" data-selected="([^"]+)"[\s\S]*?<span class="agent-title"[^>]*>([^<]*)<\/span>[\s\S]*?<b class="agent-change[^"]*">([^<]*)<\/b>/g)]
    .map((match) => ({ key: match[1], id: match[2], selected: match[3], title: match[4], pnl: match[5] }));
}

function chartEventPosition(eventId) {
  const match = element("chartEvents").innerHTML.match(new RegExp(`data-chart-event="${eventId}"[\\s\\S]*?style="left:([\\d.]+)px; top:([\\d.]+)px"`));
  return match ? { left: Number(match[1]), top: Number(match[2]) } : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const context = {
  console,
  URLSearchParams,
  Intl,
  Math,
  Number,
  Date: class FixedDate extends Date {
    static now() {
      return Date.parse("2026-06-24T02:00:00.000Z");
    }
  },
  setTimeout: (callback, delayMs = 0) => {
    if (delayMs >= 1000) return 1;
    callback();
    return 1;
  },
  clearTimeout() {},
  ResizeObserver: class ResizeObserver {
    observe() {}
    disconnect() {}
  },
  CustomEvent: class CustomEvent {
    constructor(type) {
      this.type = type;
    }
  },
};

context.window = {
  location: { search: "" },
  dispatchEvent(event) {
    events.get(event.type)?.forEach((listener) => listener(event));
  },
  addEventListener(type, listener) {
    const listeners = events.get(type) ?? [];
    listeners.push(listener);
    events.set(type, listeners);
  },
  requestAnimationFrame(callback) {
    callback();
    return 1;
  },
  cancelAnimationFrame() {},
  setTimeout: context.setTimeout,
  clearTimeout: context.clearTimeout,
  matchMedia() {
    return { matches: true };
  },
  ResizeObserver: context.ResizeObserver,
  LightweightCharts: {
    AreaSeries: "AreaSeries",
    ColorType: { Solid: "solid" },
    CrosshairMode: { Normal: "normal" },
    createChart() {
      const series = {
        data: [],
        setData(data) {
          this.data = data;
        },
        update() {},
        applyOptions() {},
        priceToCoordinate(value) {
          const values = this.data.map((point) => point.value).filter(Number.isFinite);
          if (values.length < 2) return 148;
          const min = Math.min(...values);
          const max = Math.max(...values);
          if (max === min) return 148;
          return 280 - ((value - min) / (max - min)) * 220;
        },
      };
      return {
        addSeries() {
          return series;
        },
        applyOptions() {},
        resize() {},
        timeScale() {
          return {
            fitContent() {},
            timeToCoordinate(value) {
              const numeric = Number(value);
              if (!Number.isFinite(numeric)) return 260 + chartTimeCoordinateOffset;
              const start = Date.parse("2026-06-23T11:10:00.000Z") / 1000;
              const end = Date.parse("2026-06-23T12:45:00.000Z") / 1000;
              const progress = (numeric - start) / (end - start);
              return 180 + progress * 90 + chartTimeCoordinateOffset;
            },
            subscribeVisibleLogicalRangeChange(listener) {
              visibleLogicalRangeListener = listener;
            },
          };
        },
        clearCrosshairPosition() {
          clearCrosshairCalls += 1;
        },
      };
    },
    createSeriesMarkers() {
      return {
        markers: [],
        setMarkers(markers) {
          this.markers = markers;
        },
      };
    },
  },
};

context.document = {
  body: new FakeElement("body"),
  createTextNode(text) {
    return { textContent: String(text) };
  },
  createElement(id) {
    return new FakeElement(id);
  },
  getElementById: element,
  querySelector(selector) {
    if (selector === ".center" || selector === ".right" || selector === ".main") {
      return element(selector.slice(1));
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === "[data-chart-event]") {
      return element("chartEvents").querySelectorAll(selector);
    }
    if (selector === ".ticket-tab") {
      return ["buy", "sell"].map(ticketTab);
    }
    if (selector === "[data-amount]") {
      return ["1", "2", "5", "10", "max"].map(amountButton);
    }
    if (selector === "[data-agent-filter]") {
      return ["last24h", "keyEnabled", "openPosition", "positivePnl"].map(filterCheckbox);
    }
    return [];
  },
};

context.fetch = async (path) => {
  const url = new URL(path, "http://localhost");
  if (url.pathname === "/api/key-market/state") {
    const agentId = url.searchParams.get("agentId");
    return jsonResponse({
      ok: true,
      state: keyStateFixture(agentId, agentId === "codex_main_20260620" ? "3" : "0"),
    });
  }
  if (url.pathname === "/api/key-market/quote") {
    const side = url.searchParams.get("side");
    return jsonResponse({
      ok: true,
      quote: side === "sell"
        ? { payout_near: "0.5874" }
        : { total_cost_near: "0.1958" },
      protection: {},
    });
  }
  if (url.pathname === "/api/key-market/activity") {
    return jsonResponse({ ok: true, agent_id: url.searchParams.get("agentId"), trades: [] });
  }
  if (url.pathname === "/api/key-market/max-buy") {
    return jsonResponse(maxBuyFixture(url.searchParams.get("agentId"), url.searchParams.get("accountId"), "7"));
  }
  if (url.pathname !== "/api/agents") throw new Error(`Unexpected fetch: ${path}`);
  return agentDiscoveryResponse;
};

function jsonResponse(body) {
  return {
    ok: true,
    async json() {
      return body;
    },
  };
}

vm.createContext(context);
const agentChange = new Promise((resolve) => {
  context.window.addEventListener("clawhouse:agent-change", resolve);
});
vm.runInContext(script, context, { filename: "clawhouse-fomo-layout.js" });
assert(element("agentList").attributes.get("aria-busy") === "true", "Agent Discovery should stay busy while /api/agents is loading.");
assert(element("agentList").innerHTML.includes("agent-row-skeleton"), "Agent Discovery should render skeleton rows while /api/agents is loading.");
assert(element("agentList").querySelectorAll("[data-agent]").length === 0, "Agent Discovery should not render real agent rows while /api/agents is loading.");
resolveAgentDiscovery();
await agentChange;

context.window.ClawHouseDemo.setChainState({ backend: null });
assert(element("chartEmptyOverlay").classList.contains("is-loading"), "Chart backend loading state should render the skeleton overlay.");
assert(element("chartPanel").classList.contains("is-loading"), "Chart panel should expose a loading class for skeleton styling.");
assert(element("agentList").attributes.get("aria-busy") === "true", "Agent Discovery should stay busy while backend readback is loading.");
assert(element("agentList").innerHTML.includes("agent-row-skeleton"), "Agent Discovery should keep skeleton rows until backend readback can filter public paper agents.");
assert(element("agentList").querySelectorAll("[data-agent]").length === 0, "Agent Discovery should not flash unfiltered agent rows before backend readback.");

context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("empty_board", 0.56, null, []) });
const emptyRow = element("agentList").querySelectorAll("[data-agent]").find((row) => row.dataset.agentId === "empty_agent");
emptyRow.click();
context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("empty_board", 0.56, null, []) });
const emptyPaperChart = context.window.ClawHouseDemo.getChartModel();
assert(emptyPaperChart.title === "Agent has not started trading yet", "Paper agents without public paper activity should say the agent has not started trading.");
assert(emptyPaperChart.message.includes("No paper trades"), "Missing paper activity should explain that no paper trades have been recorded.");
assert(element("chartEmptyKicker").textContent === "Paper trading inactive", "Missing paper activity should use the inactive chart kicker.");
let rendered = rows();
assert(rendered.length === 5, "Agent Discovery should fall back to all rows when no paper leaderboard is available.");

context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("terminal_chad6", 0.99) });
rendered = rows();
assert(rendered[0]?.id === "codex_main_20260620", "P&L sort should rank the highest row-owned P&L first.");
assert(rendered[0]?.title === "Codex Main", "Codex row should render a readable title instead of the raw id.");
assert(rendered[0]?.pnl === "+25.00%", "Codex row should render its matching Paper leaderboard P&L.");
assert(rendered.length === 1, "Agent discovery should hide rows without public paper activity.");
assert(
  element("heroBannerImage").src === "/agent-banners/default-agent-banner.png",
  "Agents without an uploaded banner should render the default banner.",
);
assert(!element("agentList").innerHTML.includes("empty_agent"), "Inactive paper agents should be hidden from Agent Discovery.");
assert(!element("agentList").innerHTML.includes("terminal_chad6"), "Rows without public paper activity should not remain visible after backend readback.");
assert(rendered[0]?.selected === "true", "The selected row should move to the first visible active paper agent.");
assert(!element("agentList").innerHTML.includes("agent-row active"), "Agent rows should not use the old active class.");
assert(!pageSource.includes("agentSort"), "Agent Discovery sort control should not be present.");
assert(!pageSource.includes("Leaderboard P&L"), "The redundant leaderboard summary should not be present.");
assert(pageSource.includes('data-agent-filter="last24h"'), "Agent Discovery should expose a Last 24h active filter.");
assert(pageSource.includes('data-agent-filter="keyEnabled"'), "Agent Discovery should expose a key trading enabled filter.");
assert(element("agentList").innerHTML.includes("Equity $1,250.00"), "Agent rows should show paper equity instead of key counts.");
assert(!element("agentList").innerHTML.includes("0 keys"), "Agent rows should not show unhelpful zero key counts.");
filterCheckbox("keyEnabled").click();
rendered = rows();
assert(rendered.length === 0, "Key trading filter should hide agents without a real key-market readback.");
assert(element("agentList").innerHTML.includes("No agents found"), "Empty filtered Agent Discovery should render a clear empty state.");
assert(element("agentList").innerHTML.includes("Clear filters"), "Empty filtered Agent Discovery should offer a filter reset action.");
filterCheckbox("keyEnabled").click();
rendered = rows();
assert(rendered.length === 1, "Clearing key trading filter should restore paper-active rows.");

const codexRow = element("agentList").querySelectorAll("[data-agent]").find((row) => row.dataset.agentId === "codex_main_20260620");
codexRow.click();
context.window.ClawHouseDemo.setChainState({
  accountId: "buyer.testnet",
  state: keyStateFixture("codex_main_20260620", "3"),
  maxBuy: maxBuyFixture("codex_main_20260620", "buyer.testnet", "7"),
  backend: selectedBackend("codex_board", 0.25, paperActivityFixture()),
  activity: keyActivityFixture(),
});
filterCheckbox("last24h").click();
filterCheckbox("keyEnabled").click();
filterCheckbox("openPosition").click();
filterCheckbox("positivePnl").click();
rendered = rows();
assert(rendered.length === 1, "Agent Discovery filters should work as a multi-select AND filter.");
assert(rendered[0]?.id === "codex_main_20260620", "The active key-enabled open-position positive-P&L filter set should keep the matching agent.");
filterCheckbox("last24h").click();
filterCheckbox("keyEnabled").click();
filterCheckbox("openPosition").click();
filterCheckbox("positivePnl").click();
assert(element("activityPanelTitle").textContent === "Key Trading Activity", "Paper agents should keep the key trading activity header.");
assert(element("activityPanelSub").textContent === "NEAR testnet key market", "Key activity header should stay on the NEAR key market source.");
assert(element("keyActivityList").innerHTML.includes("2 keys"), "Key activity list should render the bought key amount.");
assert(element("keyActivityList").innerHTML.includes("buyer.codex.testnet"), "Key activity list should render the buyer account.");
assert(element("keyActivityList").innerHTML.includes("https://testnet.nearblocks.io/txns/4pC5G5keyActivityTxHash"), "Key activity list should link to the key trade transaction.");
assert(!element("keyActivityList").innerHTML.includes("0.01 BTC"), "Key activity list should not be replaced by paper order size and coin.");
assert(!element("keyActivityList").innerHTML.includes("$100.00"), "Key activity list should not be replaced by paper order fill price.");
assert(!element("keyActivityList").innerHTML.includes("REJ"), "Key activity list should hide rejected paper orders.");
assert(!element("keyActivityList").innerHTML.includes("stale_market_data"), "Key activity list should hide rejected paper order reasons.");
assert(element("ticketOwnedKeys").textContent === "3 Key", "Trade ticket should show the holder key balance for a paper-backed agent.");
assert(element("ticketMaxBuy").textContent === "Max buy 7 Key", "Buy ticket should show the maximum buy amount read from the wallet balance quote.");
ticketTab("sell").click();
amountButton("max").click();
assert(element("keyAmount").value === "3", "Sell Max should fill the current holder key balance.");
assert(element("ticketMaxBuy").textContent === "Sellable 3 Key", "Sell ticket should label the max amount as the sellable key balance.");
ticketTab("buy").click();
amountButton("max").click();
assert(element("keyAmount").value === "7", "Buy Max should fill the computed maximum buy amount.");
assert(!pageSource.includes("positionTitle"), "The position panel should not be present in the page markup.");
assert(element("chartSub").textContent.includes("paper net worth"), "Paper chart subtitle should identify the paper net worth source.");
const paperChart = context.window.ClawHouseDemo.getChartModel();
assert(paperChart.valueKind === "usd", "Paper chart should use USD net worth values instead of percent values.");
assert(paperChart.values[0] === 1000, "Paper chart should begin at the account starting balance.");
assert(paperChart.values[1] === 1000, "Paper chart should stay flat until the first filled order.");
assert(paperChart.values.at(-1) === 1002, "Paper chart should use post-fill equity_usd net worth after the first fill.");
assert(!paperChart.values.includes(999), "Paper chart should ignore risk snapshots before the first filled order.");
assert(paperChart.points.every((point, index) => index === 0 || point.time > paperChart.points[index - 1].time), "Paper chart points should be strictly time-ordered.");
assert(paperChart.events.some((event) => event.raw?.id === "paper_ord_first_fill" && event.raw?.status === "filled"), "Paper chart should keep the first filled order marker even after many later rejected orders.");
assert(paperChart.events.length === 1, "Paper chart should hide rejected paper order markers.");
assert(paperChart.events.every((event) => event.raw?.status !== "rejected"), "Paper chart events should not include rejected paper orders.");
const paperOrderButton = element("chartEvents").querySelectorAll("[data-chart-event]")[0];
assert(paperOrderButton?.textContent.includes("Order 1"), "Paper chart should render a visible clickable order marker.");
assert(element("priceReferenceLine").hidden === false, "Paper chart should render the current net worth reference line.");
assert(element("priceReferenceLine").style.top === element("priceMarker").style.top, "Current net worth line should align with the price marker.");
element("eventModal").hidden = true;
paperOrderButton.click();
assert(element("eventModal").hidden === false, "Clicking a paper order marker should open the order detail modal.");

context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("codex_board", 0, noFillPaperActivityFixture()), activity: null });
const noFillPaperChart = context.window.ClawHouseDemo.getChartModel();
assert(noFillPaperChart.valueKind === "usd", "No-fill paper chart should still use USD net worth values.");
assert(noFillPaperChart.values.length === 2, "No-fill paper chart should render a two-point flat line.");
assert(noFillPaperChart.values.every((value) => value === 1000), "No-fill paper chart should stay at the starting balance instead of risk snapshot values.");
assert(noFillPaperChart.events.length === 0, "No-fill paper chart should not render paper order markers.");
assert(element("keyActivityList").innerHTML.includes("No verified key trades yet"), "Rejected-only paper activity should keep the key-trade empty state.");
assert(!element("keyActivityList").innerHTML.includes("stale_market_data"), "Rejected-only paper activity should keep rejected paper order reasons out of key activity.");

context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("codex_board", 0, oldOpenPositionActivityFixture()) });
const oldOpenPositionChart = context.window.ClawHouseDemo.getChartModel();
const oldOpenPositionEvent = oldOpenPositionChart.events.find((event) => event.raw?.event_type === "paper_position");
assert(oldOpenPositionEvent, "Paper chart should explain net worth movement from an already-open position.");
assert(oldOpenPositionEvent.title === "BTC Position", "Open-position marker should identify the positioned coin.");
assert(oldOpenPositionEvent.timeValue === Date.parse("2026-06-24T01:10:00.000Z") / 1000, "Open-position marker should be pinned to the first visible risk point.");

context.window.ClawHouseDemo.setChartRange("1h");
context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("codex_board", 0.25, rangeFilteredPaperActivityFixture()) });
let rangeChart = context.window.ClawHouseDemo.getChartModel();
assert(rangeChart.events.length === 1, "1H paper chart should only include order markers inside the active range.");
assert(rangeChart.events[0]?.raw?.id === "paper_ord_recent_fill", "1H paper chart should not carry old filled orders into marker rendering.");
assert(!element("chartEvents").innerHTML.includes("paper_ord_old_fill"), "Rendered 1H chart markers should not include old order ids.");
const clearCrosshairBeforeRangeSwitch = clearCrosshairCalls;
context.window.ClawHouseDemo.setChartRange("24h");
assert(clearCrosshairCalls > clearCrosshairBeforeRangeSwitch, "Switching chart ranges should clear the stale crosshair marker.");
rangeChart = context.window.ClawHouseDemo.getChartModel();
assert(rangeChart.events.some((event) => event.raw?.id === "paper_ord_old_fill"), "24H paper chart may include old order markers after recalculating the range.");
assert(rangeChart.events.some((event) => event.raw?.id === "paper_ord_recent_fill"), "24H paper chart should include recent order markers after recalculating the range.");
assert(rangeChart.events.find((event) => event.raw?.id === "paper_ord_recent_fill")?.chartValue === 10000, "Paper order markers should use the net worth at or before the order time instead of snapping to a later high-water point.");
assert(rangeChart.events.find((event) => event.raw?.id === "paper_ord_recent_fill")?.timeValue === Date.parse("2026-06-23T12:45:00.000Z") / 1000, "Paper order markers should render at the order time instead of the matched net worth point time.");
assert(chartEventPosition("paper_ord_recent_fill"), "Recent 24H paper order marker should render after recalculating the range.");
const markerBeforeZoom = chartEventPosition("paper_ord_recent_fill");
chartTimeCoordinateOffset = 44;
visibleLogicalRangeListener?.({ from: 2, to: 8 });
const markerAfterZoom = chartEventPosition("paper_ord_recent_fill");
assert(markerAfterZoom?.left === markerBeforeZoom.left + 44, "Paper order marker x position should refresh when chart zoom or pan changes the visible range.");
assert(markerAfterZoom?.top === markerBeforeZoom.top, "Paper order marker y position should stay pinned to the same net worth line after chart zoom or pan.");

console.log("agent discovery row P&L harness passed");
