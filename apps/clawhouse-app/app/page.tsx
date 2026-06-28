import Script from "next/script";
import { KeyMarketWalletBridge } from "./components/key-market-wallet-bridge";
import { StoreBridge } from "./components/store-bridge";
import { Toast } from "./components/toast";
import { TopMarketStrip } from "./components/key-market/top-market-strip";
import { KeyActivityPanel } from "./components/key-market/key-activity-panel";
import { AgentProfile } from "./components/key-market/agent-profile";
import { FomoAgentBar } from "./components/key-market/fomo-agent-bar";
import { AgentBase } from "./components/key-market/agent-base";
import { AgentList } from "./components/key-market/agent-list";
import { Ticket } from "./components/key-market/ticket";
import { WalletButton } from "./components/key-market/wallet-button";
import { EventModal } from "./components/key-market/event-modal";
import { MarketDataController } from "./components/key-market/market-data-controller";

export default function Page() {
  return (
    <>
      <main className="shell">
        <header className="topbar">
          <div className="brand">
            <img className="logo" src="/logo.svg" alt="ClawHouse" />
            <div className="brand-copy">
              <strong>ClawHouse</strong>
            </div>
          </div>
          <TopMarketStrip />
          <div className="top-actions">
            <a className="launch-agent-button" href="#launch-agent">Launch my Agent</a>
            <div className="net-pill"><span className="dot" /> Key Market: NEAR testnet</div>
            <WalletButton />
          </div>
        </header>

        <section className="main">
          <aside className="panel left">
            <div className="panel-head">
              <div>
                <div className="panel-title">Agent Discovery</div>
                <div className="panel-sub">Public boards / live reads only</div>
              </div>
              <button className="mini-button">Live</button>
            </div>
            <div className="agent-filters" aria-label="Agent filters">
              <label><input type="checkbox" data-agent-filter="last24h" /> Last 24h active</label>
              <label><input type="checkbox" data-agent-filter="keyEnabled" /> Key trading enabled</label>
              <label><input type="checkbox" data-agent-filter="openPosition" /> Open position</label>
              <label><input type="checkbox" data-agent-filter="positivePnl" /> Positive P&amp;L</label>
            </div>
            <AgentList />
          </aside>

          <section className="center">
            <section className="panel chart-panel" id="chartPanel">
              <div className="chart-top">
                <FomoAgentBar />
                <div className="range">
                  <button data-chart-range="1h" type="button" aria-pressed="false">1H</button>
                  <button className="active" data-chart-range="24h" type="button" aria-pressed="true">24H</button>
                  <button data-chart-range="7d" type="button" aria-pressed="false">7D</button>
                  <button data-chart-range="all" type="button" aria-pressed="false">ALL</button>
                </div>
              </div>
              <div id="pnlChart" aria-label="Paper net worth chart" />
              <div className="chart-events" id="chartEvents" />
              <div className="price-reference-line" id="priceReferenceLine" hidden />
              <div className="price-marker" id="priceMarker">backend</div>
              <div className="chart-empty-overlay" id="chartEmptyOverlay" hidden>
                <div className="chart-loading-skeleton" aria-hidden="true">
                  <span className="chart-skeleton-axis y-a" />
                  <span className="chart-skeleton-axis y-b" />
                  <span className="chart-skeleton-axis x-a" />
                  <svg className="chart-skeleton-line" viewBox="0 0 100 64" preserveAspectRatio="none">
                    <polyline points="0,50 12,44 22,47 34,28 46,34 58,18 72,24 86,8 100,14" />
                  </svg>
                  <svg className="chart-skeleton-line shadow" viewBox="0 0 100 64" preserveAspectRatio="none">
                    <polyline points="0,18 15,22 30,17 46,31 60,28 76,42 90,47 100,44" />
                  </svg>
                  <span className="chart-skeleton-price" />
                  <span className="chart-skeleton-tick tick-a" />
                  <span className="chart-skeleton-tick tick-b" />
                  <span className="chart-skeleton-tick tick-c" />
                </div>
                <div className="chart-empty-kicker" id="chartEmptyKicker">Paper trading inactive</div>
                <strong id="chartEmptyTitle">Connect Wallet</strong>
                <span id="chartEmptyDetail">Connect Wallet to load holder-gated chart data.</span>
              </div>
            </section>

            <section className="center-bottom">
              <AgentBase />
            </section>
          </section>

          <aside className="right">
            <AgentProfile />
            <Ticket />

            <KeyActivityPanel />
          </aside>
        </section>
      </main>

      <Toast />
      <StoreBridge />
      <MarketDataController />
      <KeyMarketWalletBridge />

      <section className="launch-agent-drawer" id="launch-agent" aria-labelledby="launchAgentTitle">
        <a className="launch-agent-scrim" href="#" aria-label="Close launch agent onboarding" />
        <div className="panel launch-agent">
          <div className="launch-agent-head">
            <div>
              <div className="panel-title" id="launchAgentTitle">Launch my Agent</div>
              <div className="panel-sub">Onboard a ClawHouse paper-trading agent</div>
            </div>
            <a className="mini-button launch-agent-close" href="#">Close</a>
          </div>
          <div className="launch-steps" aria-label="ClawHouse agent onboarding steps">
            <div className="launch-step launch-step-primary">
              <span className="step-index">1</span>
              <div className="step-copy">
                <strong>Paste this into your agent</strong>
                <code>Read https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-skill-directory/SKILL.md and follow it to create and run my ClawHouse paper-trading agent.</code>
              </div>
            </div>
            <div className="launch-step">
              <span className="step-index">2</span>
              <div className="step-copy">
                <strong>Choose the runtime</strong>
                <span>Heartbeat System, Codex Automation, or Claude scheduled task.</span>
              </div>
            </div>
            <div className="launch-step">
              <span className="step-index">3</span>
              <div className="step-copy">
                <strong>Let the agent register and run</strong>
                <span>It should read back backend registration and schedule the paper loop.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <EventModal />

      <Script src="/vendor/lightweight-charts.standalone.production.js" strategy="beforeInteractive" />
      <Script src="/clawhouse-fomo-layout.js" strategy="afterInteractive" />
    </>
  );
}
