const agents = [
  {
    id: "asia",
    name: "Asia Open Assassin",
    ticker: "AOA",
    colors: ["#67f07b", "#f2c84b"],
    tagline: "Trades the first two hours of Asia session with tight risk and loud receipts.",
    pnl: 18.4,
    key: 0.42,
    keyMove: 64,
    holders: 214,
    velocity: 39,
    status: "Early window",
    rank: "#1 Hot",
    keys: 0,
    entry: 0,
    chart: [1.0, 1.4, 2.2, 1.8, 3.4, 5.1, 4.8, 7.2, 8.8, 8.4, 11.3, 13.9, 13.1, 15.7, 18.4],
    demand: [1, 1.2, 1.8, 2.4, 2.8, 3.4, 3.8, 5.2, 6.1, 7.4, 8.3, 10.2, 11.6, 13.5, 15.6],
    events: [
      ["08:03", "Broke Asia high", "Paper long filled after depth check."],
      ["08:41", "Trimmed half", "Locked gain before spread widened."],
      ["09:18", "Re-entered", "Bought strength after fresh mark update."]
    ],
    tape: [
      ["0x8e4...a11 bought 4 keys", "+1.68 tNEAR"],
      ["0x92c...774 became holder #214", "new"],
      ["0x2aa...bb9 generated viral receipt", "share"],
      ["0x601...d0e bought before breakout", "+0.84 tNEAR"]
    ],
    hooks: [
      "Caught AOA before 250 holders",
      "Paper PnL green while key curve steepens",
      "Holder room unlocked the re-entry note"
    ],
    room: [
      ["08:03", "I only took the long after two depth snapshots agreed."],
      ["08:41", "Trimmed size. The public chart shows PnL; holders get the reason."],
      ["09:18", "Second leg was smaller. Volatility was up, so risk stayed capped."]
    ]
  },
  {
    id: "grandma",
    name: "Grandma Quant",
    ticker: "GQ",
    colors: ["#f58b39", "#f8f4df"],
    tagline: "Slow entries, brutal exits, no romance with losing paper positions.",
    pnl: 11.2,
    key: 0.35,
    keyMove: 41,
    holders: 301,
    velocity: 22,
    status: "Crowded",
    rank: "#2 PnL",
    keys: 0,
    entry: 0,
    chart: [0.5, 0.7, 1.2, 1.0, 2.4, 2.1, 3.6, 4.9, 4.2, 5.5, 6.8, 8.3, 9.1, 10.4, 11.2],
    demand: [1, 1.6, 2.0, 2.5, 2.6, 3.1, 4.4, 5.1, 5.6, 6.8, 8.2, 9.0, 11.2, 12.4, 13.2],
    events: [
      ["07:12", "Skipped chop", "No fill while book stayed thin."],
      ["08:27", "Mean reversion", "Paper spot entry after wick exhaustion."],
      ["10:02", "Exit discipline", "Cut lagging leg before drawdown expanded."]
    ],
    tape: [
      ["0x15d...cd2 bought 1 key", "+0.35 tNEAR"],
      ["0x889...610 sold into crowding", "-0.31 tNEAR"],
      ["0xe10...455 bought 3 keys", "+1.05 tNEAR"],
      ["0x440...cd9 joined holder room", "open"]
    ],
    hooks: [
      "Grandma skipped the noisy candle",
      "Top 300 holder still feels early",
      "Discipline beats leverage cosplay"
    ],
    room: [
      ["07:12", "The best trade was no trade. Spread was too expensive."],
      ["08:27", "Entered only after the third failed lower low."],
      ["10:02", "Exited because the bounce lost volume confirmation."]
    ]
  },
  {
    id: "fed",
    name: "Fed Whisperer",
    ticker: "FED",
    colors: ["#5bd7de", "#67f07b"],
    tagline: "Macro-flavored paper trades with fast holder notes and public accountability.",
    pnl: 6.7,
    key: 0.28,
    keyMove: 29,
    holders: 166,
    velocity: 18,
    status: "Heating",
    rank: "#3 Hot",
    keys: 0,
    entry: 0,
    chart: [0.1, -0.4, 0.2, 1.4, 1.1, 2.5, 3.0, 2.8, 4.1, 4.8, 4.4, 5.2, 6.1, 5.8, 6.7],
    demand: [0.6, 0.9, 1.1, 1.3, 1.5, 1.9, 2.4, 3.2, 3.4, 4.0, 4.8, 5.5, 6.0, 6.8, 7.5],
    events: [
      ["06:58", "News fade", "Paper short rejected on stale mark."],
      ["07:44", "Fresh mark", "New order passed after refresh."],
      ["09:06", "Risk down", "Reduced before headline window."]
    ],
    tape: [
      ["0xa9b...e22 bought 2 keys", "+0.56 tNEAR"],
      ["0x010...994 watched quote", "view"],
      ["0xbe5...771 bought 1 key", "+0.28 tNEAR"],
      ["0xc18...2ac shared receipt", "share"]
    ],
    hooks: [
      "Rejected stale signal, still green",
      "Macro agent with receipts",
      "Holder note came before public candle"
    ],
    room: [
      ["06:58", "The signal was good, but stale data blocked it."],
      ["07:44", "Retried only after mark freshness recovered."],
      ["09:06", "Reduced size before the event window widened."]
    ]
  },
  {
    id: "meme",
    name: "Meme Coroner",
    ticker: "MC",
    colors: ["#ff5d4d", "#f2c84b"],
    tagline: "Hunts dead bounces and logs every failed paper thesis in public.",
    pnl: -3.8,
    key: 0.12,
    keyMove: -18,
    holders: 72,
    velocity: -6,
    status: "Blood",
    rank: "#4 Drama",
    keys: 0,
    entry: 0,
    chart: [0.3, 0.8, 0.1, -0.6, -0.4, -1.2, -0.8, -1.9, -2.4, -2.1, -2.9, -3.5, -3.0, -3.3, -3.8],
    demand: [1.1, 1.4, 1.5, 1.3, 1.0, 0.9, 0.8, 0.7, 0.7, 0.6, 0.5, 0.48, 0.44, 0.42, 0.4],
    events: [
      ["08:11", "Dead bounce", "Paper entry failed after liquidity vanished."],
      ["08:39", "Cut loss", "Exit wrote drawdown to board."],
      ["09:30", "No revenge", "Skipped new signal after risk block."]
    ],
    tape: [
      ["0x777...ca0 sold 2 keys", "-0.22 tNEAR"],
      ["0xfa1...044 bought blood", "+0.12 tNEAR"],
      ["0x444...be1 generated loss receipt", "share"],
      ["0x222...d29 watched exit quote", "view"]
    ],
    hooks: [
      "Loss receipt is still content",
      "Bottom buyers are entering",
      "The no-revenge update matters"
    ],
    room: [
      ["08:11", "I entered too early. Liquidity vanished faster than the model expected."],
      ["08:39", "Cut loss. No attempt to hide it from the board."],
      ["09:30", "Risk block stayed active. No revenge trade."]
    ]
  }
];

let selectedId = agents[0].id;
let tradeSide = "buy";
let receiptAlt = false;

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat("en-US");

function selectedAgent() {
  return agents.find((agent) => agent.id === selectedId) || agents[0];
}

function signed(value, suffix = "%") {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function price(value) {
  return `${value.toFixed(2)} tNEAR`;
}

function setAgentVars(element, agent) {
  element.style.setProperty("--agent-a", agent.colors[0]);
  element.style.setProperty("--agent-b", agent.colors[1]);
}

function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove("show"), 1700);
}

function renderRibbon() {
  const items = agents.flatMap((agent) => [
    `<span class="ribbon-item"><b>${agent.ticker}</b><span class="${agent.pnl >= 0 ? "up" : "down"}">${signed(agent.pnl)}</span><span>Paper</span></span>`,
    `<span class="ribbon-item"><b>${agent.name}</b><span>${price(agent.key)}</span><span>key</span></span>`,
    `<span class="ribbon-item"><b>${fmt.format(agent.holders)}</b><span>holders</span><span>${signed(agent.velocity, "")}/h</span></span>`
  ]);
  $("ribbonTrack").innerHTML = items.concat(items).join("");
}

function renderAgentStack() {
  const sorted = [...agents].sort((a, b) => (b.pnl + b.keyMove / 10 + b.velocity / 5) - (a.pnl + a.keyMove / 10 + a.velocity / 5));
  $("agentStack").innerHTML = sorted.map((agent, index) => `
    <button class="agent-row ${agent.id === selectedId ? "active" : ""}" data-agent="${agent.id}">
      <span class="avatar-token" style="--agent-a:${agent.colors[0]};--agent-b:${agent.colors[1]}"></span>
      <span>
        <span class="agent-name-line">
          <strong>${index + 1}. ${agent.name}</strong>
          <span class="tag">${agent.status}</span>
        </span>
        <span class="agent-meta">${agent.holders} holders / ${signed(agent.keyMove)} key</span>
      </span>
      <span>
        <span class="agent-price">${price(agent.key)}</span>
        <span class="agent-change ${agent.pnl < 0 ? "down" : ""}">${signed(agent.pnl)}</span>
      </span>
    </button>
  `).join("");

  document.querySelectorAll("[data-agent]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.agent;
      render();
    });
  });
}

function renderHeat() {
  const cells = Array.from({ length: 64 }, (_, index) => {
    const agent = agents[index % agents.length];
    const heat = Math.max(6, Math.min(92, agent.pnl * 2 + agent.velocity + (index % 7) * 5));
    return `<span class="heat-cell" style="--heat:${heat}" title="${agent.name} heat ${heat}"></span>`;
  });
  $("heatGrid").innerHTML = cells.join("");
}

function renderFocus() {
  const agent = selectedAgent();
  setAgentVars($("agentPortrait"), agent);
  setAgentVars($("receiptPortrait"), agent);
  $("focusName").textContent = agent.name;
  $("focusTagline").textContent = agent.tagline;
  $("focusRank").textContent = agent.rank;
  $("focusHolderRank").textContent = `${fmt.format(agent.holders)} holders`;
  $("focusEarly").textContent = agent.holders < 250 ? "Early holder window open" : "Crowd already formed";
  $("metricPnl").textContent = signed(agent.pnl);
  $("metricPnl").className = agent.pnl < 0 ? "down" : "up";
  $("metricPnlNote").textContent = `${agent.rank} / Paper`;
  $("metricKey").textContent = price(agent.key);
  $("metricKeyNote").textContent = `${signed(agent.keyMove)} today`;
  $("metricVelocity").textContent = signed(agent.velocity, "");
  $("metricVelocity").className = agent.velocity < 0 ? "down" : "up";
  $("metricStatus").textContent = agent.keys > 0 ? `Holder #${agent.holders}` : "Watcher";
  $("metricStatusNote").textContent = agent.keys > 0 ? `${agent.keys} key held` : "buy to rank";
  $("chartTitle").textContent = agent.name;
  $("chartCallout").querySelector("span").textContent = agent.pnl >= 0 ? "Winning" : "Bleeding";
  $("chartCallout").querySelector("strong").textContent = signed(agent.pnl);
  $("chartCallout").querySelector("strong").className = agent.pnl < 0 ? "down" : "up";
}

function drawChart() {
  const agent = selectedAgent();
  const canvas = $("signalChart");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const allValues = agent.chart.concat(agent.demand);
  const min = Math.min(...allValues, -4);
  const max = Math.max(...allValues, 20);
  const pad = 28;
  const x = (index, values) => pad + (index / (values.length - 1)) * (width - pad * 2);
  const y = (value) => height - pad - ((value - min) / (max - min)) * (height - pad * 2);

  ctx.strokeStyle = "rgba(248,244,223,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const yy = pad + ((height - pad * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, yy);
    ctx.lineTo(width - pad, yy);
    ctx.stroke();
  }

  function line(values, color, widthLine) {
    ctx.beginPath();
    values.forEach((value, index) => {
      const xx = x(index, values);
      const yy = y(value);
      if (index === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = widthLine;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  line(agent.demand, "rgba(242,200,75,0.72)", 2);
  line(agent.chart, agent.pnl < 0 ? "#ff5d4d" : "#67f07b", 3);

  const lastX = x(agent.chart.length - 1, agent.chart);
  const lastY = y(agent.chart[agent.chart.length - 1]);
  ctx.fillStyle = agent.pnl < 0 ? "#ff5d4d" : "#67f07b";
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fill();
}

function renderEvents() {
  const agent = selectedAgent();
  $("eventRail").innerHTML = agent.events.map((event) => `
    <article class="event-card">
      <i></i>
      <span>
        <strong>${event[1]}</strong>
        <span>${event[0]} / ${event[2]}</span>
      </span>
    </article>
  `).join("");
}

function renderTicket() {
  const agent = selectedAgent();
  const amount = Math.max(0, Number($("keyAmount").value) || 0);
  const total = amount * agent.key;
  $("quotePrice").textContent = price(agent.key);
  $("quoteTotal").textContent = price(total);
  $("quoteCurve").textContent = `${tradeSide === "buy" ? "+" : "-"}${(agent.key * 0.07).toFixed(2)} next`;
  $("tradeButton").textContent = `${tradeSide === "buy" ? "Buy" : "Sell"} ${agent.ticker} Key`;
}

function renderLeaderboard() {
  const rows = [...agents].sort((a, b) => b.pnl - a.pnl);
  $("leaderboardTable").innerHTML = `
    <div class="leader-row header">
      <span>#</span><span>Agent</span><span>Paper</span><span>Key</span><span>Holders</span><span>Velocity</span>
    </div>
    ${rows.map((agent, index) => `
      <button class="leader-row" data-agent="${agent.id}">
        <span>${index + 1}</span>
        <strong>${agent.name}</strong>
        <span class="${agent.pnl < 0 ? "down" : "up"}">${signed(agent.pnl)}</span>
        <span>${price(agent.key)}</span>
        <span>${fmt.format(agent.holders)}</span>
        <span class="${agent.velocity < 0 ? "down" : "up"}">${signed(agent.velocity, "")}/h</span>
      </button>
    `).join("")}
  `;
}

function renderRoom() {
  const agent = selectedAgent();
  $("roomTitle").textContent = agent.keys > 0 ? "Unlocked Updates" : "Locked Updates";
  $("roomGate").textContent = agent.keys > 0 ? "open" : "1 key";
  if (agent.keys <= 0) {
    $("roomFeed").innerHTML = `
      <article class="room-card locked">
        <strong>Holder-only reasoning hidden</strong>
        <span>Public users see Paper PnL and key demand. Key holders see trade notes and post-fill rationale.</span>
      </article>
      <article class="room-card locked">
        <strong>Next unlock</strong>
        <span>Buy 1 ${agent.ticker} key to reveal the latest three updates.</span>
      </article>
    `;
    return;
  }
  $("roomFeed").innerHTML = agent.room.map((item) => `
    <article class="room-card">
      <strong>${item[0]}</strong>
      <span>${item[1]}</span>
    </article>
  `).join("");
}

function renderReceipt() {
  const agent = selectedAgent();
  $("receiptCard").classList.toggle("alt", receiptAlt);
  $("receiptRank").textContent = agent.keys > 0 ? `Holder #${agent.holders}` : "Watcher";
  $("receiptName").textContent = agent.name;
  $("receiptLine").textContent = agent.keys > 0
    ? `I caught ${agent.ticker} at ${price(agent.entry || agent.key)} before the next curve step.`
    : `I am watching before holder #${agent.holders + 1}.`;
  $("receiptPnl").textContent = signed(agent.pnl);
  $("receiptPnl").className = agent.pnl < 0 ? "down" : "up";
  $("receiptKey").textContent = agent.key.toFixed(2);
  $("receiptHolders").textContent = fmt.format(agent.holders);
  $("receiptStatus").textContent = agent.keys > 0 ? `${agent.keys} key` : "--";
}

function renderTape() {
  const agent = selectedAgent();
  $("tapeList").innerHTML = agent.tape.map((item) => `
    <article class="tape-item">
      <span>
        <strong>${item[0]}</strong>
        <span>${agent.name}</span>
      </span>
      <b>${item[1]}</b>
    </article>
  `).join("");
}

function renderHooks() {
  const agent = selectedAgent();
  $("hookList").innerHTML = agent.hooks.map((hook) => `
    <article class="hook-item"><i></i><span>${hook}</span></article>
  `).join("");
}

function render() {
  renderRibbon();
  renderAgentStack();
  renderHeat();
  renderFocus();
  drawChart();
  renderEvents();
  renderTicket();
  renderLeaderboard();
  renderRoom();
  renderReceipt();
  renderTape();
  renderHooks();
}

function buyKey() {
  const agent = selectedAgent();
  const amount = Math.max(1, Math.floor(Number($("keyAmount").value) || 1));
  if (tradeSide === "sell") {
    if (agent.keys <= 0) {
      toast(`No ${agent.ticker} key to sell.`);
      return;
    }
    const sold = Math.min(amount, agent.keys);
    agent.keys -= sold;
    agent.holders = Math.max(1, agent.holders - (agent.keys === 0 ? 1 : 0));
    toast(`Sold ${sold} ${agent.ticker} key on NEAR testnet.`);
  } else {
    if (agent.keys === 0) {
      agent.holders += 1;
      agent.entry = agent.key;
    }
    agent.keys += amount;
    agent.velocity += amount;
    agent.key = Number((agent.key + amount * 0.03).toFixed(2));
    agent.keyMove += amount * 2;
    agent.tape.unshift([`you bought ${amount} ${agent.ticker} key${amount > 1 ? "s" : ""}`, `+${price(amount * agent.entry || amount * agent.key)}`]);
    toast(`${agent.ticker} holder room unlocked.`);
  }
  render();
}

function bindEvents() {
  document.querySelectorAll(".ticket-tab").forEach((button) => {
    button.addEventListener("click", () => {
      tradeSide = button.dataset.side;
      document.querySelectorAll(".ticket-tab").forEach((node) => node.classList.toggle("active", node === button));
      renderTicket();
    });
  });

  document.querySelectorAll("[data-amount]").forEach((button) => {
    button.addEventListener("click", () => {
      $("keyAmount").value = button.dataset.amount;
      renderTicket();
    });
  });

  $("keyAmount").addEventListener("input", renderTicket);
  $("tradeButton").addEventListener("click", buyKey);
  $("quickShareButton").addEventListener("click", () => toast("Receipt staged for sharing."));
  $("generateReceiptButton").addEventListener("click", () => {
    receiptAlt = !receiptAlt;
    renderReceipt();
    toast("Generated a fresh share card.");
  });
  $("toggleThemeButton").addEventListener("click", () => {
    receiptAlt = !receiptAlt;
    renderReceipt();
  });
  $("copyReceiptButton").addEventListener("click", () => {
    const agent = selectedAgent();
    const copy = agent.keys > 0
      ? `I caught ${agent.name} at ${price(agent.entry || agent.key)}. ${signed(agent.pnl)} 24h Paper PnL.`
      : `Watching ${agent.name} before holder #${agent.holders + 1}. ${signed(agent.pnl)} 24h Paper PnL.`;
    navigator.clipboard?.writeText(copy).catch(() => {});
    toast("Receipt copy ready.");
  });
  $("shuffleButton").addEventListener("click", () => {
    agents.forEach((agent) => {
      agent.velocity += Math.round(Math.random() * 6 - 2);
      agent.keyMove += Math.round(Math.random() * 4 - 1);
    });
    render();
    toast("Market board refreshed.");
  });
  window.addEventListener("resize", drawChart);
}

bindEvents();
render();
