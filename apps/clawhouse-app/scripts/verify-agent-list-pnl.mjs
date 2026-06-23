import fs from "node:fs";
import vm from "node:vm";

const script = fs.readFileSync(new URL("../public/clawhouse-fomo-layout.js", import.meta.url), "utf8");

const agents = [
  agent("terminal_chad6", "terminal_chad6", 0.12, 5),
  agent("codex_main_20260620", "codex_board", 0.25, 1),
  agent("empty_agent", "empty_board", null, 0),
  agent("ledger-lane-agent-edge-20260620-0936-a13c", "ledger-lane-ft", null, 0),
  agent("ledger-lane-agent-edge-20260620-0936-a13c", "ledger-lane-flow", null, 0),
];

const elements = new Map();
const events = new Map();

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
        button.textContent = match[2].replace(/<[^>]*>/g, "").trim();
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

function agent(id, boardId, totalPnlPct, holders) {
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
      status: "available",
      data: { agent: { agent_id: id, name: id, supply: holders } },
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

function selectedBackend(boardId, totalPnlPct, paperActivity = null) {
  return {
    ok: true,
    boardId,
    board: { id: boardId },
    pnl: { latest: { total_pnl_pct: totalPnlPct } },
    paperLeaderboard: {
      leaderboard: [
        {
          paper_account_id: "codex_board",
          agent_id: "codex_main_20260620",
          paper_pnl_pct: 0.25,
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const context = {
  console,
  URLSearchParams,
  Intl,
  Math,
  Number,
  Date,
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
        priceToCoordinate() {
          return 148;
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
            timeToCoordinate() {
              return 260;
            },
          };
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
      return ["buy", "sell"].map((side) => {
        const tab = new FakeElement(`ticket-${side}`);
        tab.dataset.side = side;
        return tab;
      });
    }
    if (selector === "[data-amount]") {
      return ["1", "2", "5", "10"].map((amount) => {
        const button = new FakeElement(`amount-${amount}`);
        button.dataset.amount = amount;
        return button;
      });
    }
    return [];
  },
};

context.fetch = async (path) => {
  if (path !== "/api/agents") throw new Error(`Unexpected fetch: ${path}`);
  return {
    ok: true,
    async json() {
      return { ok: true, agents };
    },
  };
};

vm.createContext(context);
const agentChange = new Promise((resolve) => {
  context.window.addEventListener("clawhouse:agent-change", resolve);
});
vm.runInContext(script, context, { filename: "clawhouse-fomo-layout.js" });
await agentChange;

context.window.ClawHouseDemo.setChainState({ backend: null });
assert(element("chartEmptyOverlay").classList.contains("is-loading"), "Chart backend loading state should render the skeleton overlay.");
assert(element("chartPanel").classList.contains("is-loading"), "Chart panel should expose a loading class for skeleton styling.");

context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("terminal_chad6", 0.99) });
let rendered = rows();
assert(rendered[0]?.id === "codex_main_20260620", "P&L sort should rank the highest row-owned P&L first.");
assert(rendered[0]?.title === "Codex Main", "Codex row should render a readable title instead of the raw id.");
assert(rendered[0]?.pnl === "+25.00%", "Codex row should render its matching Paper leaderboard P&L.");
assert(rendered[1]?.id === "terminal_chad6", "Terminal row should remain second after the Paper P&L row.");
assert(rendered[1]?.title === "Terminal Chad6", "Terminal row should render a readable title instead of the raw id.");
assert(rendered[1]?.pnl === "--", "Backend detail P&L must not be shown as list-row P&L.");
assert(rendered[2]?.id === "empty_agent" && rendered[2]?.pnl === "--", "Rows without actual P&L should render --.");
assert(
  element("heroBannerImage").src === "/agent-banners/default-agent-banner.png",
  "Agents without an uploaded banner should render the default banner.",
);
assert(rendered.filter((row) => row.id === "ledger-lane-agent-edge-20260620-0936-a13c").every((row) => row.pnl === "--"), "Ambiguous Paper P&L must not be copied across duplicate agent ids.");
assert(rendered[1]?.selected === "true", "The selected row should use the data-selected marker.");
assert(!element("agentList").innerHTML.includes("agent-row active"), "Agent rows should not use the old active class.");

const emptyRow = element("agentList").querySelectorAll("[data-agent]").find((row) => row.dataset.agentId === "empty_agent");
emptyRow.click();
context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("empty_board", 0.56) });
rendered = rows();
assert(rendered[0]?.id === "codex_main_20260620" && rendered[0]?.pnl === "+25.00%", "Selecting another row must not change P&L sorting.");
assert(rendered[1]?.id === "terminal_chad6" && rendered[1]?.pnl === "--", "Unselected backend detail P&L should stay out of list rows.");
assert(rendered[2]?.id === "empty_agent" && rendered[2]?.pnl === "--", "Selected detail P&L must not be borrowed by an empty list row.");
assert(rendered[2]?.selected === "true", "Clicking a row should move the data-selected marker.");

const ledgerFlowRow = element("agentList").querySelectorAll("[data-agent]").find((row) => row.dataset.agent === "ledger-lane-flow");
ledgerFlowRow.click();
rendered = rows();
const selectedRows = rendered.filter((row) => row.selected === "true");
assert(selectedRows.length === 1 && selectedRows[0]?.key === "ledger-lane-flow", "Rows with the same agent id should not all become selected.");

const codexRow = element("agentList").querySelectorAll("[data-agent]").find((row) => row.dataset.agentId === "codex_main_20260620");
codexRow.click();
context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("codex_board", 0.25, paperActivityFixture()) });
assert(element("activityPanelTitle").textContent === "Paper Trading Activity", "Paper agents should render paper trading activity instead of key-market empty state.");
assert(element("activityPanelSub").textContent.includes("1/16 filled orders"), "Paper activity header should expose filled/total order count.");
assert(element("keyActivityList").innerHTML.includes("0.01 BTC"), "Paper activity list should render recent paper order size and coin.");
assert(element("keyActivityList").innerHTML.includes("$100.00"), "Paper activity list should render filled paper order price.");
assert(!element("keyActivityList").innerHTML.includes("REJ"), "Paper activity list should hide rejected paper orders.");
assert(!element("keyActivityList").innerHTML.includes("stale_market_data"), "Paper activity list should hide rejected paper order reasons.");
assert(element("positionTitle").textContent === "Paper Positions", "Paper agents should render paper positions instead of key balance position.");
assert(element("positionSub").textContent.includes("2026-06-23T11:10:05Z"), "Paper position subtitle should render latest risk UTC time.");
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
assert(paperOrderButton?.textContent === "Order 1", "Paper chart should render a visible clickable order marker.");
assert(element("priceReferenceLine").hidden === false, "Paper chart should render the current net worth reference line.");
assert(element("priceReferenceLine").style.top === element("priceMarker").style.top, "Current net worth line should align with the price marker.");
element("eventModal").hidden = true;
paperOrderButton.click();
assert(element("eventModal").hidden === false, "Clicking a paper order marker should open the order detail modal.");

context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("codex_board", 0, noFillPaperActivityFixture()) });
const noFillPaperChart = context.window.ClawHouseDemo.getChartModel();
assert(noFillPaperChart.valueKind === "usd", "No-fill paper chart should still use USD net worth values.");
assert(noFillPaperChart.values.length === 2, "No-fill paper chart should render a two-point flat line.");
assert(noFillPaperChart.values.every((value) => value === 1000), "No-fill paper chart should stay at the starting balance instead of risk snapshot values.");
assert(noFillPaperChart.events.length === 0, "No-fill paper chart should not render paper order markers.");
assert(element("keyActivityList").innerHTML.includes("No filled paper orders yet"), "Rejected-only paper activity should render the no-filled-orders empty state.");
assert(!element("keyActivityList").innerHTML.includes("stale_market_data"), "Rejected-only paper activity should hide rejected paper order reasons.");

console.log("agent discovery row P&L harness passed");
