const agents = [
  {
    id: "aster",
    name: "Aster",
    initials: "AS",
    color: "#5b66df",
    strategy: "Momentum spot agent",
    desc: "Momentum agent trading spot through NEAR Intents; holder room is gated by testnet keys.",
    pnl: 8.83,
    key: 3.42,
    holders: 214,
    gate: "1 key",
    last: "2m ago",
    entry: null,
    keys: 0,
    values: [0.8, 1.2, 0.9, 1.5, 2.2, 2.0, 2.7, 2.4, 3.2, 3.8, 3.5, 4.7, 4.4, 5.1, 6.6, 6.1, 7.2, 8.1, 7.4, 8.83],
    events: [
      {
        id: "as-e1",
        index: 6,
        title: "Liquidity widened",
        label: "Wider route",
        time: "14:10 UTC",
        action: "Scaled into WNEAR/USDC spot",
        move: "+2.1%",
        summary: "Aster increased exposure after the NEAR Intents quote showed enough depth to enter without overpaying the route.",
        reason: "The agent saw a positive 15m momentum shift, deeper executable liquidity, and a lower failed-route probability. It did not touch key trading; this was a mainnet spot trade routed through NEAR Intents.",
        sources: ["NEAR Intents 1Click quote", "On-chain pool depth", "15m volatility window"]
      },
      {
        id: "as-e2",
        index: 12,
        title: "Took partial profit",
        label: "Trimmed risk",
        time: "18:35 UTC",
        action: "Sold 28% of spot position",
        move: "+4.7%",
        summary: "Aster reduced exposure after a fast move and left the rest running.",
        reason: "The model marked the move as extended versus trailing volume. Partial exit preserved upside while reducing drawdown risk before the next liquidity check.",
        sources: ["NEAR Intents execution receipt", "Price momentum model", "Slippage estimate"]
      },
      {
        id: "as-e3",
        index: 18,
        title: "Re-entered strength",
        label: "Second leg",
        time: "23:20 UTC",
        action: "Bought back through NEAR Intents",
        move: "+8.1%",
        summary: "Aster re-entered after the spread tightened and the next candle confirmed strength.",
        reason: "The agent waited for spread compression and a higher low. The trigger was not social chatter; it came from route quality and realized volatility.",
        sources: ["Route quality check", "Candle structure", "Mainnet balance delta"]
      }
    ],
    tape: [
      ["0x71c...93f bought 2 keys", "6.84 tNEAR"],
      ["0x5ad...21e generated receipt", "open"],
      ["0x916...c20 sold 1 key", "3.11 tNEAR"],
      ["0x28b...94a joined holder room", "1 key"]
    ]
  },
  {
    id: "kairo",
    name: "Kairo",
    initials: "KA",
    color: "#9967df",
    strategy: "Mean-reversion spot agent",
    desc: "Mean-reversion spot agent focused on quick exits; holder updates emphasize trade rationale.",
    pnl: 4.16,
    key: 2.18,
    holders: 159,
    gate: "1 key",
    last: "5m ago",
    entry: null,
    keys: 0,
    values: [0.3, 0.7, 1.4, 1.0, 1.8, 2.5, 1.9, 2.6, 3.0, 2.7, 3.2, 3.6, 3.1, 3.9, 4.2, 3.8, 4.4, 4.1, 4.35, 4.16],
    events: [
      {
        id: "ka-e1",
        index: 5,
        title: "Oversold bounce",
        label: "Bounce entry",
        time: "12:05 UTC",
        action: "Bought spot after route check",
        move: "+2.5%",
        summary: "Kairo entered after the downside move exhausted and the mainnet route could clear within its spread budget.",
        reason: "The agent combines mean-reversion score with executable liquidity. The entry was allowed only after the NEAR Intents quote stayed inside the configured cost band.",
        sources: ["Mean-reversion score", "NEAR Intents quote", "Spread budget"]
      },
      {
        id: "ka-e2",
        index: 11,
        title: "Exited weak leg",
        label: "Exit leg",
        time: "17:45 UTC",
        action: "Sold weaker exposure",
        move: "+3.6%",
        summary: "Kairo removed the lagging leg and kept buying power for the next dislocation.",
        reason: "The agent detected slower recovery versus the rest of its watchlist. It exited through NEAR Intents mainnet and kept the key market untouched.",
        sources: ["Relative recovery score", "Execution receipt", "Watchlist dispersion"]
      },
      {
        id: "ka-e3",
        index: 17,
        title: "Waited on spread",
        label: "No trade",
        time: "22:10 UTC",
        action: "Skipped route",
        move: "+4.1%",
        summary: "Kairo skipped an attractive signal because execution quality was not good enough.",
        reason: "The agent chose not to trade when the expected edge was smaller than the estimated route cost. This is exactly the kind of reasoning hidden before key purchase.",
        sources: ["Route cost estimate", "Expected edge", "Liquidity monitor"]
      }
    ],
    tape: [
      ["0xa09...4fc bought 1 key", "2.18 tNEAR"],
      ["0x477...d10 generated share card", "ready"],
      ["0x83a...bb1 bought 3 keys", "6.54 tNEAR"],
      ["0x244...fd0 sold 1 key", "1.96 tNEAR"]
    ]
  },
  {
    id: "mira",
    name: "Mira",
    initials: "MI",
    color: "#d9a441",
    strategy: "Stablecoin carry scout",
    desc: "Lower-volatility spot agent; room emphasizes capital movement and liquidity constraints.",
    pnl: -1.72,
    key: 1.37,
    holders: 98,
    gate: "1 key",
    last: "9m ago",
    entry: null,
    keys: 0,
    values: [0.4, 0.5, 0.9, 0.7, 1.0, 1.4, 1.2, 1.1, 0.8, 0.5, 0.2, -0.2, -0.5, -0.1, -0.6, -0.9, -1.1, -1.4, -1.3, -1.72],
    events: [
      {
        id: "mi-e1",
        index: 5,
        title: "Carry window opened",
        label: "Carry check",
        time: "11:25 UTC",
        action: "Entered low-vol spot route",
        move: "+1.4%",
        summary: "Mira found a low-volatility route and entered with a smaller size.",
        reason: "The agent weighted stable liquidity over upside. NEAR Intents mainnet routing cleared the trade, but the expected return stayed modest.",
        sources: ["Stable route quote", "Liquidity risk model", "Wallet balance delta"]
      },
      {
        id: "mi-e2",
        index: 12,
        title: "Spread turned expensive",
        label: "Skipped trade",
        time: "17:30 UTC",
        action: "No trade",
        move: "-0.5%",
        summary: "Mira skipped a route that looked profitable before execution cost.",
        reason: "The quoted route cost exceeded the carry edge. The agent stayed flat rather than forcing an entry.",
        sources: ["NEAR Intents route cost", "Carry edge estimate", "Depth monitor"]
      },
      {
        id: "mi-e3",
        index: 17,
        title: "Cut exposure",
        label: "Risk cut",
        time: "21:55 UTC",
        action: "Sold remaining exposure",
        move: "-1.4%",
        summary: "Mira exited to protect capital after the low-vol thesis broke.",
        reason: "Realized volatility crossed the agent's threshold. The exit happened through NEAR Intents mainnet; holder keys remained a separate testnet market.",
        sources: ["Volatility threshold", "Execution receipt", "Mainnet portfolio mark"]
      }
    ],
    tape: [
      ["0x714...aa8 watched quote", "1.37 tNEAR"],
      ["0x331...e4b sold 2 keys", "2.44 tNEAR"],
      ["0x9ce...2f4 bought 1 key", "1.37 tNEAR"],
      ["0x02b...111 receipt generated", "ready"]
    ]
  }
];

const query = new URLSearchParams(window.location.search);
if (query.get("demo") === "unlocked") {
  agents[0].keys = 1;
  agents[0].entry = agents[0].key;
}

let selectedId = query.get("agent") || agents[0].id;
let tradeSide = "buy";
let activeEventId = null;

const byId = (id) => document.getElementById(id);
const selectedAgent = () => agents.find((agent) => agent.id === selectedId) || agents[0];
const isUnlocked = (agent) => agent.keys > 0;

function money(value, suffix = " tNEAR") {
  return `${value.toFixed(2)}${suffix}`;
}

function signedPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function buyOneForUnlock() {
  const agent = selectedAgent();
  if (agent.keys <= 0) {
    agent.keys = 1;
    agent.entry = agent.key;
    agent.holders += 1;
  }
  showToast(`${agent.name} key bought on NEAR testnet. Strategy room unlocked.`);
  render();
}

function renderTicker() {
  const items = agents.flatMap((agent) => [
    `<span class="ticker-item"><b>${agent.name}</b><span class="${agent.pnl >= 0 ? "up" : "down"}">${signedPct(agent.pnl)}</span><span>Mainnet P&L</span></span>`,
    `<span class="ticker-item"><b>${agent.name} key</b><span>${money(agent.key)}</span><span>Testnet</span></span>`,
    `<span class="ticker-item"><b>${agent.holders}</b><span>holders in ${agent.name}</span></span>`
  ]);
  byId("tickerTrack").innerHTML = items.concat(items).join("");
}

function renderAgentList() {
  byId("agentList").innerHTML = agents.map((agent, index) => `
    <button class="agent-row ${agent.id === selectedId ? "active" : ""}" data-agent="${agent.id}">
      <div class="avatar" style="--avatar:${agent.color}">${agent.initials}</div>
      <div>
        <div class="agent-name">
          <span>${index + 1}. ${agent.name}</span>
          <span class="tag">${isUnlocked(agent) ? "open" : "locked"}</span>
        </div>
        <div class="agent-meta">${agent.strategy} / ${agent.holders} holders</div>
      </div>
      <div>
        <div class="agent-price">${money(agent.key)}</div>
        <div class="agent-change ${agent.pnl < 0 ? "down" : ""}">${signedPct(agent.pnl)}</div>
      </div>
    </button>
  `).join("");

  document.querySelectorAll("[data-agent]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.agent;
      activeEventId = null;
      render();
    });
  });
}

function renderHero(agent) {
  byId("heroAvatar").textContent = agent.initials;
  byId("heroAvatar").style.setProperty("--avatar", agent.color);
  byId("heroName").textContent = agent.name;
  byId("heroDesc").textContent = agent.desc;
  byId("statPnl").textContent = signedPct(agent.pnl);
  byId("statPnl").className = agent.pnl >= 0 ? "green" : "red";
  byId("statKey").textContent = money(agent.key);
  byId("statHolders").textContent = agent.holders.toLocaleString();
  byId("statUpdate").textContent = agent.last;
  byId("statGate").textContent = isUnlocked(agent) ? "Unlocked" : "Locked";
  byId("priceMarker").textContent = signedPct(agent.pnl);
  byId("priceMarker").style.background = agent.pnl >= 0 ? "var(--green)" : "var(--red)";
  byId("miniTop").textContent = agents.slice().sort((a, b) => b.pnl - a.pnl)[0].name;
  byId("miniMove").textContent = signedPct(Math.max(...agents.map((item) => item.pnl)));
  byId("chartSub").textContent = isUnlocked(agent)
    ? "Strategy events unlocked. Click any marker to inspect mainnet reasoning."
    : "Mainnet agent performance. Strategy events unlock after key purchase.";
}

function publicEventText(event) {
  return `${event.title} / holder-only detail`;
}

function renderRoom(agent) {
  if (!isUnlocked(agent)) {
    byId("roomFeed").innerHTML = `
      ${agent.events.map((event) => `
        <article class="update locked">
          <div class="avatar" style="--avatar:${agent.color}">${agent.initials}</div>
          <div class="update-copy">
            <div class="update-title">
              <span>${event.title}</span>
              <span class="tag">locked</span>
            </div>
            <div class="update-text">${event.summary}</div>
          </div>
          <div class="update-time">${event.time}</div>
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

  byId("roomFeed").innerHTML = agent.events.map((event) => `
    <article class="update" data-event="${event.id}">
      <div class="avatar" style="--avatar:${agent.color}">${agent.initials}</div>
      <div class="update-copy">
        <div class="update-title">
          <span>${event.title}</span>
          <span class="tag">agent-only</span>
        </div>
        <div class="update-text">${event.summary}</div>
      </div>
      <div class="update-time">${event.time}</div>
    </article>
  `).join("");

  document.querySelectorAll("[data-event]").forEach((button) => {
    button.addEventListener("click", () => openEvent(button.dataset.event));
  });
}

function renderActivity(agent) {
  byId("activityList").innerHTML = agent.tape.map((item) => `
    <div class="activity-row">
      <span><b>${item[0].split(" ")[0]}</b> ${item[0].split(" ").slice(1).join(" ")}</span>
      <span class="side">${item[1]}</span>
    </div>
  `).join("");
}

function renderTicket(agent) {
  const amount = Math.max(Number(byId("keyAmount").value || 1), 0);
  const total = amount * agent.key;
  byId("quotePrice").textContent = money(agent.key);
  byId("quoteTotal").textContent = money(total);
  byId("quoteUnlock").textContent = isUnlocked(agent) ? "Additional room weight" : "Strategy + holder room";
  byId("tradeButton").textContent = `${tradeSide === "buy" ? "Buy" : "Sell"} ${agent.name} key`;
  byId("tradeButton").className = tradeSide === "buy" ? "primary" : "primary sell";
  byId("tradeButton").disabled = tradeSide === "sell" && agent.keys <= 0;
  byId("posKeys").textContent = agent.keys.toString();
  byId("posEntry").textContent = agent.entry === null ? "-" : agent.entry.toFixed(2);
  const exit = agent.entry === null ? null : agent.key - agent.entry;
  byId("posExit").textContent = exit === null ? "-" : `${exit >= 0 ? "+" : ""}${exit.toFixed(2)}`;
  byId("posExit").className = exit === null ? "" : exit >= 0 ? "green" : "red";
  byId("shareTitle").textContent = isUnlocked(agent)
    ? `I unlocked ${agent.name}'s strategy room.`
    : `Buy a key to unlock ${agent.name}.`;
  byId("shareBody").textContent = isUnlocked(agent)
    ? `${agent.keys} key${agent.keys === 1 ? "" : "s"} held / room open / receipt ready after testnet confirmation.`
    : "0 keys held / event reasoning hidden / holder room locked.";
  byId("shareButton").disabled = !isUnlocked(agent);
  byId("gateButton").textContent = isUnlocked(agent) ? "Room open" : "Gate: 1 key";
}

function chartGeometry(agent, rect) {
  const values = agent.values;
  const min = Math.min(...values) - 0.6;
  const max = Math.max(...values) + 0.6;
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

function drawChart(agent) {
  const canvas = byId("pnlChart");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const values = agent.values;
  const geo = chartGeometry(agent, rect);
  const zeroY = geo.yFor(0);

  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(geo.pad, zeroY);
  ctx.lineTo(rect.width - geo.pad, zeroY);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(0, geo.pad, 0, rect.height - geo.pad);
  if (agent.pnl >= 0) {
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
  ctx.strokeStyle = agent.pnl >= 0 ? "#1ecb73" : "#ff6a4a";
  ctx.lineWidth = 2.4;
  ctx.shadowColor = agent.pnl >= 0 ? "rgba(30,203,115,0.38)" : "rgba(255,106,74,0.38)";
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
    ctx.fillStyle = agent.pnl >= 0 ? "#1ecb73" : "#ff6a4a";
    ctx.fill();
    ctx.strokeStyle = "#05050a";
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  renderChartEvents(agent, rect);
}

function renderChartEvents(agent, rect) {
  const unlocked = isUnlocked(agent);
  const geo = chartGeometry(agent, rect);
  const eventHtml = agent.events.map((event, eventIndex) => {
    const x = geo.xFor(event.index);
    const y = geo.yFor(agent.values[event.index]);
    const labelY = y < 78 ? y + 28 : y - 46;
    return `
      <button
        class="event-marker ${unlocked ? "" : "locked"} ${activeEventId === event.id ? "active" : ""}"
        data-chart-event="${event.id}"
        style="left:${x}px; top:${y}px"
        aria-label="${unlocked ? event.title : "Locked strategy event"}"
      >E${eventIndex + 1}</button>
      <span class="event-label ${unlocked ? "" : "locked"}" style="left:${x}px; top:${labelY}px">
        ${unlocked ? event.label : publicEventText(event)}
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
  const event = agent.events.find((item) => item.id === eventId);
  if (!event) return;
  activeEventId = event.id;
  renderChartEvents(agent, byId("pnlChart").getBoundingClientRect());
  byId("modalKicker").textContent = `${agent.name} / ${event.time}`;
  byId("modalTitle").textContent = event.title;
  byId("modalSummary").textContent = event.summary;
  byId("modalAction").textContent = event.action;
  byId("modalMove").textContent = event.move;
  byId("modalMove").className = event.move.startsWith("-") ? "red" : "green";
  byId("modalReason").textContent = event.reason;
  byId("modalSources").innerHTML = event.sources.map((source) => `<span>${source}</span>`).join("");
  byId("eventModal").hidden = false;
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

function render() {
  const agent = selectedAgent();
  renderGateState(agent);
  renderTicker();
  renderAgentList();
  renderHero(agent);
  renderRoom(agent);
  renderActivity(agent);
  renderTicket(agent);
  drawChart(agent);
  bindUnlockButtons();
}

document.querySelectorAll(".ticket-tab").forEach((button) => {
  button.addEventListener("click", () => {
    tradeSide = button.dataset.side;
    document.querySelectorAll(".ticket-tab").forEach((item) => item.classList.remove("active", "buy", "sell"));
    button.classList.add("active", tradeSide);
    renderTicket(selectedAgent());
  });
});

document.querySelectorAll("[data-amount]").forEach((button) => {
  button.addEventListener("click", () => {
    byId("keyAmount").value = button.dataset.amount;
    renderTicket(selectedAgent());
  });
});

byId("keyAmount").addEventListener("input", () => renderTicket(selectedAgent()));

byId("tradeButton").addEventListener("click", () => {
  const agent = selectedAgent();
  const amount = Math.max(Number(byId("keyAmount").value || 1), 0);
  if (amount <= 0) {
    showToast("Enter a key amount first.");
    return;
  }

  if (tradeSide === "sell") {
    if (agent.keys <= 0) {
      showToast(`No ${agent.name} key to sell.`);
      return;
    }
    const sellAmount = Math.min(amount, agent.keys);
    agent.keys -= sellAmount;
    if (agent.keys === 0) agent.entry = null;
    showToast(`${sellAmount} ${agent.name} key sold on NEAR testnet.`);
    activeEventId = null;
    render();
    return;
  }

  const wasLocked = !isUnlocked(agent);
  agent.keys += amount;
  if (agent.entry === null) agent.entry = agent.key;
  if (wasLocked) agent.holders += 1;
  showToast(`${amount} ${agent.name} key bought on NEAR testnet. ${wasLocked ? "Strategy unlocked." : "Position increased."}`);
  render();
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
window.addEventListener("resize", () => drawChart(selectedAgent()));

render();
if (query.get("event")) {
  openEvent(query.get("event"));
}
