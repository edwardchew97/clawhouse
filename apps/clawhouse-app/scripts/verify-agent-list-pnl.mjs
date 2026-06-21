import fs from "node:fs";
import vm from "node:vm";

const script = fs.readFileSync(new URL("../public/clawhouse-fomo-layout.js", import.meta.url), "utf8");

const agents = [
  agent("terminal_chad6", "terminal_chad6", 0.12, 5),
  agent("codex_main_20260620", "codex_board", 0.25, 1),
  agent("empty_agent", "empty_board", null, 0),
];

const elements = new Map();
const events = new Map();

class FakeClassList {
  add() {}
  remove() {}
  toggle() {}
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
    this._innerHTML = "";
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
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
    if (this.id !== "agentList" || selector !== "[data-agent]") return [];
    return [...this.innerHTML.matchAll(/<button class="agent-row[^"]*" data-agent="([^"]+)">/g)]
      .map((match) => {
        const row = new FakeElement(`row-${match[1]}`);
        row.dataset.agent = match[1];
        return row;
      });
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
    strategy: `${id} / near-intents`,
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

function selectedBackend(boardId, totalPnlPct) {
  return {
    ok: true,
    boardId,
    board: { id: boardId },
    pnl: { latest: { total_pnl_pct: totalPnlPct } },
    paperLeaderboard: { leaderboard: [] },
  };
}

function rows() {
  return [...element("agentList").innerHTML.matchAll(/data-agent="([^"]+)"[\s\S]*?<b class="agent-change[^"]*">([^<]*)<\/b>/g)]
    .map((match) => ({ id: match[1], pnl: match[2] }));
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
  setTimeout: (callback) => {
    callback();
    return 1;
  },
  clearTimeout() {},
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
  querySelector() {
    return null;
  },
  querySelectorAll(selector) {
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

context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("terminal_chad6", 0.99) });
let rendered = rows();
assert(rendered[0]?.id === "codex_main_20260620", "P&L sort should rank the highest row-owned P&L first.");
assert(rendered[0]?.pnl === "+25.00%", "Codex row should render its discovery P&L.");
assert(rendered[1]?.id === "terminal_chad6", "Terminal row should remain second by row-owned P&L.");
assert(rendered[1]?.pnl === "+12.00%", "Selected backend fallback must not overwrite the list row P&L.");
assert(rendered[2]?.id === "empty_agent" && rendered[2]?.pnl === "--", "Rows without actual P&L should render --.");
assert(
  element("heroBannerImage").src === "/agent-banners/default-agent-banner.png",
  "Agents without an uploaded banner should render the default banner.",
);

const emptyRow = element("agentList").querySelectorAll("[data-agent]").find((row) => row.dataset.agent === "empty_agent");
emptyRow.click();
context.window.ClawHouseDemo.setChainState({ backend: selectedBackend("empty_board", 0.56) });
rendered = rows();
assert(rendered[0]?.id === "codex_main_20260620" && rendered[0]?.pnl === "+25.00%", "Selecting another row must not change P&L sorting.");
assert(rendered[1]?.id === "terminal_chad6" && rendered[1]?.pnl === "+12.00%", "Unselected row P&L should remain available after selection changes.");
assert(rendered[2]?.id === "empty_agent" && rendered[2]?.pnl === "--", "Selected detail P&L must not be borrowed by an empty list row.");

console.log("agent discovery row P&L harness passed");
