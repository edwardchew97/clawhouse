/**
 * Backend / paper event normalization, ported legacy-exact from
 * `public/clawhouse-fomo-layout.js`. Shared by the room feed and the event modal.
 * Chart-point placement (valueIndex/chartValue) is omitted here — the room feed
 * passes null points, and the chart itself still uses the delegated legacy model.
 */

import {
  asNumber,
  formatBackendAmount,
  formatBackendTime,
  formatUsd,
  shortHash,
  titleCase,
} from "./key-market-format";
import { backendNetwork, backendVenue, type SelectorContext } from "./key-market-selectors";
import type { ChartEvent } from "./legacy-bridge";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});

export function compactReason(reason: unknown) {
  const text = String(reason || "").trim().replace(/\s+/g, " ");
  if (!text) return "No reason supplied.";
  return text.length > 86 ? `${text.slice(0, 83).trim()}...` : text;
}

export function eventTag(event: { raw?: Rec; label?: string; title?: string }) {
  const raw = event.raw || {};
  const meta = eventMetadata(raw);
  const coin = String(raw.coin || meta.coin || "").toUpperCase();
  const side = String(raw.side || meta.side || event.label || "event").toLowerCase();
  if (coin) return `${coin} ${titleCase(side)}`;
  return event.title || titleCase(side);
}

export function eventMetadata(event: Rec): Rec {
  return event?.metadata && typeof event.metadata === "object" ? (event.metadata as Rec) : {};
}

export function isPaperTradeEvent(event: Rec): boolean {
  const metadata = eventMetadata(event);
  const source = String(metadata.source || "").toLowerCase();
  return event?.event_type === "paper_trade"
    || String(event?.intent_id || "").startsWith("paper_")
    || source.includes("paper")
    || metadata.venue === "hyperliquid-paper"
    || Boolean(metadata.market_type || metadata.marketType);
}

export function formatBackendAction(event: Rec): string {
  if (isPaperTradeEvent(event) && event.coin && event.size) {
    const action = titleCase(event.side || "order");
    const amount = formatBackendAmount(event.size, event.coin as string);
    if (event.status === "rejected" || event.reject_reason) {
      return `Rejected ${action.toLowerCase()} ${amount}: ${event.reject_reason || "order rejected"}`;
    }
    const px = asNumber(event.avg_fill_px);
    return px === null ? `${action} ${amount}` : `${action} ${amount} @ ${formatUsd(px)}`;
  }
  const input = formatBackendAmount(event.amount_in, event.asset_in as string);
  const output = formatBackendAmount(event.amount_out, event.asset_out as string);
  if (input && output) return `${input} -> ${output}`;
  if (output) return `Received ${output}`;
  if (input) return `Spent ${input}`;
  return titleCase(event.event_type || event.status_claim || "agent event");
}

export function eventNetwork(s: SelectorContext, event: Rec, agent: Parameters<typeof backendNetwork>[1]) {
  const metadata = eventMetadata(event);
  if (isPaperTradeEvent(event)) return "hyperliquid";
  return (metadata.network_id as string) || (metadata.networkId as string) || backendNetwork(s, agent);
}

export function eventVenue(s: SelectorContext, event: Rec, agent: Parameters<typeof backendVenue>[1]) {
  const metadata = eventMetadata(event);
  if (isPaperTradeEvent(event)) return "hyperliquid-paper";
  return (metadata.venue as string) || (metadata.venue_namespace as string) || backendVenue(s, agent);
}

export function eventReferenceLabel(event: Rec) {
  const paper = isPaperTradeEvent(event);
  if (paper && event.intent_id) return `Paper order ${shortHash(event.intent_id)}.`;
  if (paper && event.tx_hash) return `Paper receipt ${shortHash(event.tx_hash)}.`;
  if (event.tx_hash) return `Tx ${shortHash(event.tx_hash)}.`;
  if (!event.intent_id) return "";
  return `Intent ${shortHash(event.intent_id)}.`;
}

export function backendEventSources(s: SelectorContext, event: Rec, agent: Parameters<typeof backendNetwork>[1]): string[] {
  const sources = [`network: ${eventNetwork(s, event, agent)}`, `venue: ${eventVenue(s, event, agent)}`];
  if (event.status_claim) sources.push(`status_claim: ${event.status_claim}`);
  if (event.tx_hash) sources.push(`tx_hash: ${event.tx_hash}`);
  if (event.intent_id) sources.push(`${isPaperTradeEvent(event) ? "paper_order_id" : "intent_id"}: ${event.intent_id}`);
  if (event.client_event_id) sources.push(`client_event_id: ${event.client_event_id}`);
  if (event.wallet_address) sources.push(`wallet: ${event.wallet_address}`);
  if (eventMetadata(event).source) sources.push(`source: ${eventMetadata(event).source}`);
  return sources;
}

export function formatBackendSummary(s: SelectorContext, event: Rec, agent: Parameters<typeof backendNetwork>[1]) {
  const action = formatBackendAction(event);
  const status = event.status_claim ? `Status: ${event.status_claim}.` : "";
  const venue = `${eventNetwork(s, event, agent)} / ${eventVenue(s, event, agent)}`;
  const reference = eventReferenceLabel(event);
  return [action, status, venue, reference].filter(Boolean).join(" ");
}

/** Normalize a paper order into a room/feed event (legacy normalizePaperOrderEvent, null point). */
export function normalizePaperOrderEvent(
  s: SelectorContext,
  order: Rec,
  index: number,
  agent: Parameters<typeof backendNetwork>[1],
): ChartEvent {
  const status = (order.status as string) || "paper_order";
  const coin = String(order.coin || "").toUpperCase();
  const side = String(order.side || "order").toLowerCase();
  const orderTime = Date.parse(String(order.observed_at || order.reported_at || order.created_at || ""));
  const raw: Rec = {
    ...order,
    event_type: "paper_trade",
    status_claim: status,
    metadata: {
      source: "paper_orders",
      venue: "hyperliquid-paper",
      market_type: order.market_type,
      coin,
      side,
      leverage: order.leverage,
    },
  };
  const title = `${coin || "Paper"} ${titleCase(side)}`;
  const action = formatBackendAction(raw);
  const reject = order.reject_reason ? ` Reject: ${order.reject_reason}.` : "";
  return {
    id: (order.id as string) || `paper-order-${index}`,
    index: 0,
    timeValue: Number.isFinite(orderTime) ? Math.floor(orderTime / 1000) : null,
    chartValue: null,
    title,
    label: status,
    time: formatBackendTime(order.created_at),
    action,
    move: status,
    summary: `${action}. Backend paper order status: ${status}.${reject}`,
    reason: (order.reason as string) || (order.reject_reason as string) || "No paper order reason was supplied.",
    sources: backendEventSources(s, raw, agent),
    raw,
    backend: true,
    public: true,
  };
}

// --- Event modal (readable detail) ----------------------------------------

export function eventMarketType(event: Rec): string {
  const metadata = eventMetadata(event);
  const rawMarket = metadata.market_type || metadata.marketType || event.market_type || event.marketType;
  if (rawMarket) return String(rawMarket).toLowerCase();
  const reason = String(event.reason || "").toLowerCase();
  if (reason.includes("perp")) return "perp";
  if (reason.includes("spot")) return "spot";
  return "";
}

export function eventCoin(event: Rec): string {
  const metadata = eventMetadata(event);
  const direct = metadata.coin || event.coin;
  if (direct) return String(direct).toUpperCase();
  const assetOut = String(event.asset_out || "").toUpperCase();
  const assetIn = String(event.asset_in || "").toUpperCase();
  if (assetOut && assetOut !== "USD") return assetOut;
  if (assetIn && assetIn !== "USD") return assetIn;
  const match = String(event.reason || "").match(/\b(BTC|ETH|SOL|USDC|USDT|PURR)\b/i);
  return match ? match[1].toUpperCase() : "";
}

export function eventLeverage(event: Rec): string {
  const metadata = eventMetadata(event);
  const value = asNumber(metadata.leverage ?? event.leverage);
  if (value !== null) return `${Number.isInteger(value) ? value.toFixed(0) : String(value)}x`;
  const match = String(event.reason || "").match(/\b(\d+(?:\.\d+)?)\s*x\b/i);
  return match ? `${match[1]}x` : "";
}

export function readableTradeSide(event: Rec): string {
  const metadata = eventMetadata(event);
  const text = [event.reason, event.client_event_id, metadata.side, metadata.direction, metadata.position_side, metadata.positionSide]
    .filter(Boolean).join(" ").toLowerCase();
  if (/\blong\b/.test(text)) return "long";
  if (/\bshort\b/.test(text)) return "short";
  const side = String(metadata.side || event.side || "").toLowerCase();
  const market = eventMarketType(event);
  if (side === "buy" && market === "perp") return "long";
  if (side === "sell" && market === "perp") return "short";
  if (side === "buy" || side === "sell") return side;
  const eventId = String(event.client_event_id || "").toLowerCase();
  if (eventId.includes("-buy-")) return market === "perp" ? "long" : "buy";
  if (eventId.includes("-sell-")) return market === "perp" ? "short" : "sell";
  const assetIn = String(event.asset_in || "").toUpperCase();
  const assetOut = String(event.asset_out || "").toUpperCase();
  if (assetIn === "USD" && assetOut && assetOut !== "USD") return market === "perp" ? "long" : "buy";
  if (assetOut === "USD" && assetIn && assetIn !== "USD") return market === "perp" ? "short" : "sell";
  return "";
}

export function readableTradeDirection(event: Rec): string {
  const side = readableTradeSide(event);
  const coin = eventCoin(event);
  const leverage = eventLeverage(event);
  if (side === "long" || side === "short") {
    return [leverage, coin, side].filter(Boolean).join(" ") || titleCase(side);
  }
  if (side) return [titleCase(side), coin].filter(Boolean).join(" ");
  return coin || "--";
}

export function readableTradeType(event: Rec): string {
  if (!isPaperTradeEvent(event)) return titleCase(event.event_type || "Backend event");
  const market = eventMarketType(event);
  if (market === "spot") return "Paper spot order";
  if (market === "perp") return "Paper perp order";
  return "Paper trade";
}

function readableTradeSummary(event: Rec, action: string, tradeType: string, statusText: string, venue: string): string {
  if (isPaperTradeEvent(event)) {
    return `${tradeType} on ${venue}: ${action}. Backend recorded ${statusText.toLowerCase()}.`;
  }
  return `${tradeType}: ${action}. Backend recorded ${statusText.toLowerCase()}.`;
}

export type ReadableEventModel = {
  title: string;
  summary: string;
  receipt: string;
  direction: string;
  venue: string;
  action: string;
};

export function readableEventModel(
  s: SelectorContext,
  event: ChartEvent,
  agent: Parameters<typeof backendVenue>[1],
): ReadableEventModel {
  const raw = (event.raw as Rec) || {};
  const tradeType = readableTradeType(raw);
  const venue = eventVenue(s, raw, agent);
  const action = formatBackendAction(raw);
  const direction = readableTradeDirection(raw);
  const receipt = raw.id ? `Receipt ${shortHash(raw.id)}` : eventReferenceLabel(raw) || "Agent Board Ledger";
  const status = raw.status_claim || raw.event_type || "event";
  const statusText = titleCase(status);
  return {
    title: event.title || tradeType,
    summary: readableTradeSummary(raw, action, tradeType, statusText, venue),
    receipt,
    direction,
    venue,
    action,
  };
}
