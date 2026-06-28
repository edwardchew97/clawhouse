import { describe, expect, test } from "bun:test";
import { initialChainState } from "../app/store/key-market-store";
import type { DemoChainState, LegacyAgent } from "../app/lib/key-market-types";
import type { ChartEvent } from "../app/lib/legacy-bridge";
import {
  eventCoin,
  eventLeverage,
  formatBackendAction,
  isPaperTradeEvent,
  normalizePaperOrderEvent,
  readableEventModel,
  readableTradeDirection,
  readableTradeSide,
  readableTradeType,
} from "../app/lib/key-market-events";

const agent: LegacyAgent = { id: "a1", name: "Agent", boardId: "b1" };
function ctx(chain: Partial<DemoChainState> = {}) {
  return { chain: { ...initialChainState, ...chain }, agents: [agent], tradeSide: "buy" as const, activeDiscoveryFilters: new Set<string>() };
}

describe("event classification + action", () => {
  test("isPaperTradeEvent via event_type / metadata", () => {
    expect(isPaperTradeEvent({ event_type: "paper_trade" })).toBe(true);
    expect(isPaperTradeEvent({ metadata: { venue: "hyperliquid-paper" } })).toBe(true);
    expect(isPaperTradeEvent({ event_type: "swap" })).toBe(false);
  });

  test("formatBackendAction for paper fills and swaps", () => {
    expect(formatBackendAction({ event_type: "paper_trade", coin: "SOL", size: 2, side: "buy", avg_fill_px: 150 }))
      .toBe("Buy 2.00 SOL @ $150.00");
    expect(formatBackendAction({ event_type: "paper_trade", coin: "SOL", size: 1, side: "sell", status: "rejected", reject_reason: "no margin" }))
      .toBe("Rejected sell 1.00 SOL: no margin");
    expect(formatBackendAction({ amount_in: 100, asset_in: "USD", amount_out: 1, asset_out: "ETH" }))
      .toBe("100 USD -> 1.00 ETH"); // legacy: >=100 -> toFixed(0)
  });
});

describe("readable trade direction/side", () => {
  test("perp buy => long with leverage + coin", () => {
    const ev = { metadata: { market_type: "perp", side: "buy", leverage: 5, coin: "BTC" } };
    expect(readableTradeSide(ev)).toBe("long");
    expect(eventCoin(ev)).toBe("BTC");
    expect(eventLeverage(ev)).toBe("5x");
    expect(readableTradeDirection(ev)).toBe("5x BTC long");
  });

  test("spot buy stays buy; readableTradeType reflects market", () => {
    const ev = { event_type: "paper_trade", metadata: { market_type: "spot", side: "buy", coin: "SOL" } };
    expect(readableTradeSide(ev)).toBe("buy");
    expect(readableTradeType(ev)).toBe("Paper spot order");
  });
});

describe("normalizePaperOrderEvent + readableEventModel", () => {
  const order = { id: "ord-1", coin: "eth", side: "buy", status: "filled", created_at: "2026-06-01T00:00:00Z", market_type: "perp", leverage: 3, reason: "momentum" };

  test("normalizes a paper order into a public feed event", () => {
    const ev = normalizePaperOrderEvent(ctx(), order, 0, agent);
    expect(ev.id).toBe("ord-1");
    expect(ev.title).toBe("ETH Buy");
    expect(ev.public).toBe(true);
    expect(ev.label).toBe("filled");
    expect(ev.reason).toBe("momentum");
  });

  test("readableEventModel renders title/direction/venue/receipt", () => {
    const ev = normalizePaperOrderEvent(ctx(), order, 0, agent) as ChartEvent;
    const model = readableEventModel(ctx(), ev, agent);
    expect(model.title).toBe("ETH Buy");
    expect(model.venue).toBe("hyperliquid-paper");
    expect(model.direction).toContain("long"); // perp buy => long
    expect(model.receipt).toContain("Receipt");
  });
});
