"use client";

import type { ReactNode } from "react";
import {
  averageKeyPriceLabel,
  keyAmountLabel,
  nearLabel,
  normalizedAmountOrZero,
  wholeKeyAmount,
} from "../../lib/key-market-format";
import { legacyOnAmountChange, legacySetTradeSide } from "../../lib/legacy-bridge";
import {
  agentTitle,
  holderBalance,
  keyMarketUnavailable,
  keyPriceLabel,
  maxAmountForSide,
  quoteApplies,
  quoteInitialLoading,
  statusButtonText,
  type SelectorContext,
} from "../../lib/key-market-selectors";
import type { LegacyAgent } from "../../lib/key-market-types";
import { useKeyMarketStore } from "../../store/key-market-store";
import { useSelectedAgent, useSelectorContext } from "../../store/use-key-market";
import { BalanceValue, MaxBuyValue } from "./labels";
import { Skeleton } from "./skeleton";

const QUICK_AMOUNTS = ["1", "2", "5", "10"];

/** Trade ticket. The wallet bridge still owns #tradeButton (via capture-click) and
 *  reads #keyAmount; this renders the display + drives side/amount through the bridge. */
export function Ticket() {
  const ctx = useSelectorContext();
  const agent = useSelectedAgent();
  const tradeSide = useKeyMarketStore((s) => s.tradeSide);
  const keyAmount = useKeyMarketStore((s) => s.keyAmount);
  const setKeyAmount = useKeyMarketStore((s) => s.setKeyAmount);
  const showToast = useKeyMarketStore((s) => s.showToast);
  useKeyMarketStore((s) => s.chain);

  if (!agent) {
    return (
      <section className="panel ticket market-disabled" id="keyMarketTicket" aria-disabled="true">
        <div className="ticket-controls" aria-hidden="true">
          <button className="primary" id="tradeButton" type="button" disabled>No agent selected</button>
        </div>
      </section>
    );
  }

  const amount = normalizedAmountOrZero(keyAmount);
  const busy = Boolean(ctx.chain.pending);
  const marketUnavailable = keyMarketUnavailable(ctx, agent);
  const quote = quoteApplies(ctx, agent) ? (ctx.chain.quote as Record<string, unknown>) : null;
  const chainTotal = tradeSide === "sell" ? quote?.payout_near : quote?.total_cost_near;
  const maxAmount = maxAmountForSide(ctx, agent);

  function pickAmount(raw: string) {
    const next = raw === "max" ? maxAmount : wholeKeyAmount(raw);
    if (next === null) {
      showToast(tradeSide === "buy" ? "Connect Wallet to read max buy." : "No key balance to sell.");
      return;
    }
    setKeyAmount(String(next));
    legacyOnAmountChange();
  }

  let quotePay: ReactNode;
  let quoteReceive: ReactNode;
  let quoteAverage: ReactNode;
  if (quoteInitialLoading(ctx, agent)) {
    quotePay = <Skeleton width="88px" className="inline-skeleton align-right" />;
    quoteReceive = <Skeleton width="54px" className="inline-skeleton align-right" />;
    quoteAverage = <Skeleton width="88px" className="inline-skeleton align-right" />;
  } else if (tradeSide === "sell") {
    quotePay = keyAmountLabel(amount);
    quoteReceive = chainTotal ? nearLabel(chainTotal) : "--";
    quoteAverage = chainTotal ? averageKeyPriceLabel(chainTotal, amount) : "--";
  } else {
    quotePay = chainTotal ? nearLabel(chainTotal) : keyPriceLabel(ctx, agent);
    quoteReceive = keyAmountLabel(amount);
    quoteAverage = chainTotal ? averageKeyPriceLabel(chainTotal, amount) : amount === 1 ? keyPriceLabel(ctx, agent) : "--";
  }

  const tradeText = busy
    ? statusButtonText(ctx)
    : marketUnavailable
      ? "Key trading unavailable"
      : ctx.chain.accountId ? `${tradeSide === "buy" ? "Buy" : "Sell"} ${agentTitle(agent)} key` : "Connect Wallet";
  const sellBalance = holderBalance(ctx, agent);
  const tradeDisabled = marketUnavailable || busy || amount <= 0
    || (tradeSide === "sell" && (sellBalance === null || sellBalance <= 0));

  return (
    <section
      className={`panel ticket${marketUnavailable ? " market-disabled" : ""}`}
      id="keyMarketTicket"
      aria-disabled={marketUnavailable}
    >
      <div className="ticket-controls" aria-hidden={marketUnavailable}>
        <div className="ticket-tabs">
          <button
            className={`ticket-tab${tradeSide === "buy" ? " active buy" : ""}`}
            type="button"
            disabled={marketUnavailable || busy}
            onClick={() => legacySetTradeSide("buy")}
          >
            Buy Key
          </button>
          <button
            className={`ticket-tab${tradeSide === "sell" ? " active sell" : ""}`}
            type="button"
            disabled={marketUnavailable || busy}
            onClick={() => legacySetTradeSide("sell")}
          >
            Sell Key
          </button>
        </div>
        <div className="input-box">
          <input
            id="keyAmount"
            value={keyAmount}
            inputMode="decimal"
            aria-label="Key amount"
            disabled={marketUnavailable || busy}
            onChange={(e) => { setKeyAmount(e.target.value); legacyOnAmountChange(); }}
          />
          <span>KEY</span>
        </div>
        <div className="ticket-balance">
          <span>You own</span>
          <b><BalanceValue ctx={ctx} agent={agent} /></b>
          <span><MaxBuyValue ctx={ctx} agent={agent} /></span>
        </div>
        <div className="quick">
          {QUICK_AMOUNTS.map((q) => (
            <button key={q} type="button" disabled={marketUnavailable || busy} onClick={() => pickAmount(q)}>{q}</button>
          ))}
          <button
            id="maxAmountButton"
            type="button"
            disabled={marketUnavailable || busy || maxAmount === null}
            title={maxButtonTitle(ctx, agent, marketUnavailable, maxAmount, tradeSide)}
            onClick={() => pickAmount("max")}
          >
            Max
          </button>
        </div>
        <div className="quote">
          <div className="quote-line"><span>You pay</span><b>{quotePay}</b></div>
          <div className="quote-line"><span>You receive</span><b>{quoteReceive}</b></div>
          <div className="quote-line"><span>Average price per key</span><b>{quoteAverage}</b></div>
        </div>
        <button
          className={`${tradeSide === "buy" ? "primary" : "primary sell"}${busy ? " loading" : ""}`}
          id="tradeButton"
          type="button"
          disabled={tradeDisabled}
        >
          {tradeText}
        </button>
      </div>
      <div className="ticket-market-empty" id="keyMarketUnavailable" aria-live="polite" hidden={!marketUnavailable}>
        <div className="ticket-market-kicker">Key market inactive</div>
        <strong>Key trading is not enabled for this agent</strong>
        <span>Paper performance remains visible. Choose a key-enabled agent to buy or sell.</span>
      </div>
    </section>
  );
}

function maxButtonTitle(
  ctx: SelectorContext,
  agent: LegacyAgent,
  marketUnavailable: boolean,
  maxAmount: number | null,
  tradeSide: "buy" | "sell",
) {
  if (marketUnavailable) return "Key trading is not enabled for this agent.";
  if (ctx.chain.maxBuyLoading) return "Loading max buy.";
  if (maxAmount === null) return tradeSide === "buy" ? "Connect Wallet to read max buy." : "No key balance to sell.";
  return `Use ${keyAmountLabel(maxAmount)}`;
}
