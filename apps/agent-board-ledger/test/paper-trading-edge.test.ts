import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { KeyPair, keyToImplicitAddress } from "@near-js/crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteLedgerDb, type SqliteLedgerDb } from "../src/db";
import { canonicalAgentAuthPayload, sha256Hex } from "../src/auth";
import { canonicalPaperAuthPayload, createPaperMarketSnapshot as insertPaperMarketSnapshot } from "../src/paper-trading";
import { createApp } from "../src/server";

const adminToken = "ledger-admin-token";
const tempRoots: string[] = [];
let app: ReturnType<typeof createApp>;
let sqliteDb: SqliteLedgerDb;
let wallet: ReturnType<typeof createWallet>;
let currentNow: Date;
let currentRpcFetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
let currentHyperliquidMarkets: Record<string, HyperliquidFixtureMarket>;

type HyperliquidFixtureMarket = {
  marketType: string;
  coin: string;
  markPx: number;
  oraclePx: number | null;
  funding: number | null;
  maxLeverage: number | null;
  observedAtMs: number;
  bids: Array<{ px: number; sz: number; n: number }>;
  asks: Array<{ px: number; sz: number; n: number }>;
};

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "clawhouse-paper-edge-"));
  tempRoots.push(root);
  currentNow = new Date("2026-06-19T00:00:00.000Z");
  currentHyperliquidMarkets = {};
  currentRpcFetch = fetch;
  sqliteDb = openSqliteLedgerDb(join(root, "ledger.sqlite"));
  app = createApp({
    db: sqliteDb,
    now: () => currentNow,
    adminToken,
    rpcFetch: (...args) => currentRpcFetch(...args),
    env: {},
  });
  wallet = createWallet();
});

afterEach(async () => {
  await app.db.close();
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

// ============================================================================
// GROUP A: Input validation & malformed requests
// ============================================================================
describe("paper-trading input validation", () => {
  test("rejects non-object JSON body for paper order", async () => {
    await registerPaperAccount();
    const res = await rawPaperPost("/paper/orders", "[]");
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe("Request body must be a JSON object");
  });

  test("rejects invalid JSON body", async () => {
    await registerPaperAccount();
    const res = await rawPaperPost("/paper/orders", "{not json");
    expect(res.status).toBe(400);
  });

  test("rejects order with missing size", async () => {
    await registerPaperAccount();
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "no-size", coin: "BTC",
      side: "buy", tif: "Ioc", margin_mode: "cross", leverage: 5,
    });
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe("Missing size");
  });

  test("rejects zero and negative sizes", async () => {
    await registerPaperAccount();
    for (const size of [0, -1]) {
      const res = await paperSignedPost("/paper/orders", {
        paper_account_id: "paper-1", client_order_id: `bad-size-${size}`, coin: "BTC",
        side: "buy", tif: "Ioc", size, margin_mode: "cross", leverage: 5,
      });
      expect(res.status).toBe(400);
      expect((await json<{ error: string }>(res)).error).toBe("size must be greater than 0");
    }
  });

  test("rejects NaN / non-numeric size", async () => {
    await registerPaperAccount();
    const res = await rawPaperPost("/paper/orders", JSON.stringify({
      paper_account_id: "paper-1", client_order_id: "nan-size", coin: "BTC",
      side: "buy", tif: "Ioc", size: "not-a-number", margin_mode: "cross", leverage: 5,
    }));
    expect(res.status).toBe(400);
  });

  test("rejects invalid side", async () => {
    await registerPaperAccount();
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "bad-side", coin: "BTC",
      side: "long", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 5,
    });
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe("side must be buy or sell");
  });

  test("rejects invalid tif", async () => {
    await registerPaperAccount();
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "bad-tif", coin: "BTC",
      side: "buy", tif: "FOK", size: 1, margin_mode: "cross", leverage: 5,
    });
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe("tif must be Ioc, Gtc, or Alo");
  });

  test("requires a reference price on paper orders", async () => {
    await registerPaperAccount();
    const rawBody = JSON.stringify({
      paper_account_id: "paper-1",
      client_order_id: "missing-reference",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 1,
      margin_mode: "cross",
      leverage: 5,
      max_slippage_bps: 50,
      max_reference_deviation_bps: 50,
      reason: "Missing reference price should be rejected before market fetch.",
    });
    const res = await rawPaperPost("/paper/orders", rawBody);
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe("Missing reference_px");
  });

  test("rejects invalid market_type", async () => {
    await registerPaperAccount();
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "bad-market", market_type: "option", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 5,
    });
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe("market_type must be perp or spot");
  });

  test("rejects perp order missing leverage", async () => {
    await registerPaperAccount();
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "no-lev", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross",
    });
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe("Missing leverage");
  });

  test("rejects invalid margin_mode for perp", async () => {
    await registerPaperAccount();
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "bad-mm", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "portfolio", leverage: 5,
    });
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe("margin_mode must be cross or isolated");
  });

  test("404 for unknown paper account", async () => {
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "does-not-exist", client_order_id: "x", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 5,
    }, wallet, "does-not-exist");
    expect(res.status).toBe(404);
    expect((await json<{ error: string }>(res)).error).toBe("Paper account not found");
  });

  test("rejects starting_balance_usd <= 0 on account creation", async () => {
    await registerAgent();
    const res = await postJson("/paper/accounts", {
      paper_account_id: "paper-neg", agent_id: "ironclaw",
      agent_public_key: wallet.publicKey, starting_balance_usd: -5,
    });
    expect(res.status).toBe(400);
  });

  test("manual market snapshot write route is removed", async () => {
    const res = await postJson("/paper/market-snapshots", {
      coin: "BTC", mark_px: 100, source: "test", maintenance_margin_rate: 0.005,
      observed_at: currentNow.toISOString(), asks: [{ px: 100, sz: 1 }],
    });
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// GROUP B: Authentication & signature attacks
// ============================================================================
describe("paper-trading auth", () => {
  test("rejects order with no signature headers", async () => {
    await registerPaperAccount();
    const res = await app.fetch(new Request("http://ledger.test/paper/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paper_account_id: "paper-1", client_order_id: "unsigned", coin: "BTC",
        side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 5,
        reference_px: 100, max_reference_deviation_bps: 50,
      }),
    }));
    expect(res.status).toBe(401);
  });

  test("rejects body tampering after signing", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }] });
    const body = {
      paper_account_id: "paper-1", client_order_id: "tamper", coin: "BTC",
      side: "buy" as const, tif: "Ioc" as const, size: 1, margin_mode: "cross", leverage: 5,
    };
    const signed = signPaper("/paper/orders", body);
    const res = await app.fetch(new Request("http://ledger.test/paper/orders", {
      method: "POST", headers: signed.headers,
      body: JSON.stringify({ ...paperOrderTestBody(body), size: 100 }),
    }));
    expect(res.status).toBe(401);
    expect((await json<{ error: string }>(res)).error).toBe("Body hash mismatch");
  });

  test("rejects signature from a different key", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }] });
    const attacker = createWallet();
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "wrong-key", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 5,
    }, attacker);
    expect(res.status).toBe(401);
    expect((await json<{ error: string }>(res)).error).toBe("Invalid signature");
  });

  test("rejects nonce replay with fresh client_order_id but reused nonce", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }] });
    const body1 = {
      paper_account_id: "paper-1", client_order_id: "nonce-a", coin: "BTC",
      side: "buy" as const, tif: "Ioc" as const, size: 0.1, margin_mode: "cross", leverage: 5,
    };
    const signed1 = signPaper("/paper/orders", body1);
    const reusedNonce = signed1.headers["x-clawhouse-paper-nonce"];
    const first = await app.fetch(new Request("http://ledger.test/paper/orders", {
      method: "POST", headers: signed1.headers, body: signed1.rawBody,
    }));
    expect(first.status).toBe(201);

    const body2 = { ...body1, client_order_id: "nonce-b" };
    const signed2 = signPaper("/paper/orders", body2, wallet, "paper-1", reusedNonce);
    const second = await app.fetch(new Request("http://ledger.test/paper/orders", {
      method: "POST", headers: signed2.headers, body: signed2.rawBody,
    }));
    expect(second.status).toBe(401);
    expect((await json<{ error: string }>(second)).error).toBe("Nonce replay rejected");
  });

  test("rejects stale timestamp", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }] });
    const staleTs = String(currentNow.getTime() - 10 * 60 * 1000);
    const body = {
      paper_account_id: "paper-1", client_order_id: "stale", coin: "BTC",
      side: "buy" as const, tif: "Ioc" as const, size: 0.1, margin_mode: "cross", leverage: 5,
    };
    const signed = signPaper("/paper/orders", body, wallet, "paper-1", undefined, staleTs);
    const res = await app.fetch(new Request("http://ledger.test/paper/orders", {
      method: "POST", headers: signed.headers, body: signed.rawBody,
    }));
    expect(res.status).toBe(401);
    expect((await json<{ error: string }>(res)).error).toBe("Signature timestamp is stale");
  });

  test("rejects account-id header mismatch", async () => {
    await registerPaperAccount();
    await registerPaperAccount({ paper_account_id: "paper-2" });
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }] });
    const body = {
      paper_account_id: "paper-1", client_order_id: "hdr-mismatch", coin: "BTC",
      side: "buy" as const, tif: "Ioc" as const, size: 0.1, margin_mode: "cross", leverage: 5,
    };
    const signed = signPaper("/paper/orders", body, wallet, "paper-1");
    signed.headers["x-clawhouse-paper-account-id"] = "paper-2";
    const res = await app.fetch(new Request("http://ledger.test/paper/orders", {
      method: "POST", headers: signed.headers, body: signed.rawBody,
    }));
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// GROUP C: Market data / staleness
// ============================================================================
describe("paper-trading market data", () => {
  test("rejects order when backend cannot refresh Hyperliquid market data", async () => {
    await registerPaperAccount();
    currentRpcFetch = async () => new Response(JSON.stringify({ error: "upstream unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "no-mkt", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 5,
    });
    expect(res.status).toBe(201);
    expect((await json<{ order: { reject_reason: string } }>(res)).order.reject_reason).toBe("market_data_unavailable");
  });

  test("rejects order against stale snapshot (older than 10s)", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }],
      observed_at: new Date(currentNow.getTime() - 20_000).toISOString(),
    });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "stale-mkt", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 5,
    });
    expect((await json<{ order: { reject_reason: string } }>(res)).order.reject_reason).toBe("stale_market_data");
  });

  test("ignores degraded cached snapshot when backend order-path refresh succeeds", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }],
      staleness_status: "degraded",
    });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "degraded", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 5,
    });
    const body = await json<{ order: { status: string; reject_reason: string | null } }>(res);
    expect(body.order.status).toBe("filled");
    expect(body.order.reject_reason).toBeNull();
  });

  test("market_not_allowed when coin not in allowlist", async () => {
    await registerPaperAccount({ allowed_markets: ["ETH"] });
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }] });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "not-allowed", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 5,
    });
    expect((await json<{ order: { reject_reason: string } }>(res)).order.reject_reason).toBe("market_not_allowed");
  });

  test("rejects when reference price deviates too far from backend Hyperliquid mark", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }] });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "bad-reference", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 5,
      reference_px: 90, max_reference_deviation_bps: 10,
    });
    const body = await json<{ order: { reject_reason: string; reference_deviation_bps: number; market_snapshot_id: string } }>(res);
    expect(body.order.reject_reason).toBe("reference_price_deviation");
    expect(body.order.reference_deviation_bps).toBe(1000);
    expect(body.order.market_snapshot_id).toBeTruthy();
  });

  test("paper orders write and use a fresh order-path snapshot instead of cached snapshots", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }] });
    const latest = await createPaperMarketSnapshot({ coin: "BTC", mark_px: 200, bids: [{ px: 199, sz: 5 }], asks: [{ px: 200, sz: 5 }] });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "latest-snapshot", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    const body = await json<{ order: { avg_fill_px: number; market_snapshot_id: string } }>(res);
    expect(body.order.market_snapshot_id).not.toBe(latest.id);
    expect(body.order.avg_fill_px).toBe(200);
  });
});

// ============================================================================
// GROUP D: Fill mechanics / order book walking
// ============================================================================
describe("paper-trading fills", () => {
  test("IOC partial fill against thin book leaves no resting size", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 0.3 }],
    });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "ioc-partial", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10, max_slippage_bps: 500,
    });
    const body = await json<{ order: { status: string; remaining_size: number; size: number } }>(res);
    expect(body.order.remaining_size).toBe(0);
    expect(["partially_filled", "filled"]).toContain(body.order.status);
  });

  test("IOC with zero depth at limit is rejected insufficient_depth", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 105, sz: 5 }],
    });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "ioc-nodepth", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, limit_px: 100, margin_mode: "cross", leverage: 5,
    });
    expect((await json<{ order: { reject_reason: string } }>(res)).order.reject_reason).toBe("insufficient_depth");
  });

  test("GTC resting order with no fill requires limit_px", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 5 }], asks: [{ px: 100, sz: 5 }] });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "gtc-nolimit", coin: "BTC",
      side: "buy", tif: "Gtc", size: 1, margin_mode: "cross", leverage: 5,
    });
    expect((await json<{ order: { reject_reason: string } }>(res)).order.reject_reason).toBe("limit_px_required_for_resting_order");
  });

  test("avg_fill_px is volume-weighted across levels", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC", mark_px: 100,
      bids: [{ px: 99, sz: 5 }],
      asks: [{ px: 100, sz: 0.5 }, { px: 102, sz: 0.5 }],
    });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "vwap", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10, max_slippage_bps: 1000,
    });
    const body = await json<{ order: { avg_fill_px: number; notional_usd: number } }>(res);
    expect(body.order.avg_fill_px).toBeCloseTo(101);
    expect(body.order.notional_usd).toBeCloseTo(101);
  });

  test("market-like IOC respects max_slippage_bps cap", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC", mark_px: 100,
      bids: [{ px: 99, sz: 5 }],
      asks: [{ px: 100, sz: 0.5 }, { px: 110, sz: 5 }],
    });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "slippage-cap", coin: "BTC",
      side: "buy", tif: "Ioc", size: 2, margin_mode: "cross", leverage: 10, max_slippage_bps: 100,
    });
    const body = await json<{ order: { size: number; notional_usd: number } }>(res);
    expect(body.order.notional_usd).toBeCloseTo(50);
  });

  test("sell side walks bids descending (best bid first)", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC", mark_px: 100,
      bids: [{ px: 100, sz: 0.5 }, { px: 98, sz: 5 }],
      asks: [{ px: 101, sz: 5 }],
    });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "sell-short", coin: "BTC",
      side: "sell", tif: "Ioc", size: 0.5, margin_mode: "cross", leverage: 10, max_slippage_bps: 50,
    });
    const body = await json<{ order: { avg_fill_px: number } }>(res);
    expect(body.order.avg_fill_px).toBeCloseTo(100);
  });
});

// ============================================================================
// GROUP E: Position accounting (perps)
// ============================================================================
describe("paper-trading perp position accounting", () => {
  test("adding to a long averages entry price", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 99, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "add-1", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "isolated", leverage: 5,
    });
    currentNow = new Date(currentNow.getTime() + 1000);
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 110, bids: [{ px: 109, sz: 50 }], asks: [{ px: 110, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "add-2", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "isolated", leverage: 5,
    });
    const pos = position("BTC", "isolated");
    expect(pos?.signed_size).toBeCloseTo(2);
    expect(pos?.entry_px).toBeCloseTo(105);
  });

  test("partial close realizes proportional PnL and keeps remainder", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "open-2btc", coin: "BTC",
      side: "buy", tif: "Ioc", size: 2, margin_mode: "cross", leverage: 10,
    });
    currentNow = new Date(currentNow.getTime() + 1000);
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 120, bids: [{ px: 120, sz: 50 }], asks: [{ px: 120, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "close-half", coin: "BTC",
      side: "sell", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    const pos = position("BTC", "cross");
    expect(pos?.signed_size).toBeCloseTo(1);
    expect(pos?.realized_pnl_usd).toBeCloseTo(20);
  });

  test("position flip long->short sets new entry to fill px", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "flip-open", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    currentNow = new Date(currentNow.getTime() + 1000);
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 110, bids: [{ px: 110, sz: 50 }], asks: [{ px: 110, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "flip-cross", coin: "BTC",
      side: "sell", tif: "Ioc", size: 3, margin_mode: "cross", leverage: 10,
    });
    const pos = position("BTC", "cross");
    expect(pos?.signed_size).toBeCloseTo(-2);
    expect(pos?.entry_px).toBeCloseTo(110);
    expect(pos?.realized_pnl_usd).toBeCloseTo(10);
  });

  test("full close marks position closed with zero size", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "fc-open", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "fc-close", coin: "BTC",
      side: "sell", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    const pos = position("BTC", "cross");
    expect(pos?.status).toBe("closed");
    expect(pos?.signed_size).toBe(0);
  });

  test("cash conservation: open then close at same price loses only fees", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    const startCash = account().cash_balance_usd;
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "cc-open", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "cc-close", coin: "BTC",
      side: "sell", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    const endCash = account().cash_balance_usd;
    expect(startCash - endCash).toBeCloseTo(0.07, 5);
  });

  test("isolated margin is locked on open and released on close", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    const startCash = account().cash_balance_usd;
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "iso-open", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "isolated", leverage: 10,
    });
    const afterOpen = account().cash_balance_usd;
    expect(startCash - afterOpen).toBeCloseTo(10.035, 5);
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "iso-close", coin: "BTC",
      side: "sell", tif: "Ioc", size: 1, margin_mode: "isolated", leverage: 10,
    });
    const afterClose = account().cash_balance_usd;
    expect(startCash - afterClose).toBeCloseTo(0.07, 5);
  });
});

// ============================================================================
// GROUP F: Margin enforcement (suspected weak spot)
// ============================================================================
describe("paper-trading margin enforcement", () => {
  test("isolated order exceeding cash creates no position", async () => {
    await registerPaperAccount({ starting_balance_usd: 50 });
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "iso-overmargin", coin: "BTC",
      side: "buy", tif: "Ioc", size: 10, margin_mode: "isolated", leverage: 2,
    });
    expect(countPositions()).toBe(0);
    expect(res.status).toBeLessThan(500);
  });

  test("cross order exceeding equity creates no position", async () => {
    await registerPaperAccount({ starting_balance_usd: 50 });
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 100 }], asks: [{ px: 100, sz: 100 }] });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "cross-overmargin", coin: "BTC",
      side: "buy", tif: "Ioc", size: 100, margin_mode: "cross", leverage: 2,
    });
    expect(countPositions()).toBe(0);
    expect(res.status).toBeLessThan(500);
  });

  test("margin failure leaves no orphan order, fill, or cash change", async () => {
    await registerPaperAccount({ starting_balance_usd: 50 });
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 100 }], asks: [{ px: 100, sz: 100 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "orphan-check", coin: "BTC",
      side: "buy", tif: "Ioc", size: 100, margin_mode: "isolated", leverage: 2,
    });
    expect(countFills()).toBe(0);
    expect(countPositions()).toBe(0);
    expect(account().cash_balance_usd).toBeCloseTo(50);
  });

  test("an order row is persisted for a margin-failed order (audit trail)", async () => {
    await registerPaperAccount({ starting_balance_usd: 50 });
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 100 }], asks: [{ px: 100, sz: 100 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "audit-margin", coin: "BTC",
      side: "buy", tif: "Ioc", size: 100, margin_mode: "isolated", leverage: 2,
    });
    // EXPECTATION: a rejected order should be recorded so the agent's attempt is auditable.
    expect(countOrders()).toBeGreaterThan(0);
  });
});

// ============================================================================
// GROUP G: Reduce-only
// ============================================================================
describe("paper-trading reduce-only", () => {
  test("reduce-only with no open position is rejected", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "ro-nopos", coin: "BTC",
      side: "sell", tif: "Ioc", size: 1, reduce_only: true, margin_mode: "cross", leverage: 10,
    });
    expect((await json<{ order: { reject_reason: string } }>(res)).order.reject_reason).toBe("reduce_only_position_not_open");
  });

  test("reduce-only same-direction is rejected (would increase)", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "ro-open", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "ro-increase", coin: "BTC",
      side: "buy", tif: "Ioc", size: 0.1, reduce_only: true, margin_mode: "cross", leverage: 10,
    });
    expect((await json<{ order: { reject_reason: string } }>(res)).order.reject_reason).toBe("reduce_only_would_increase");
  });

  test("reduce-only exceeding position size is rejected", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "ro-open2", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "ro-toobig", coin: "BTC",
      side: "sell", tif: "Ioc", size: 2, reduce_only: true, margin_mode: "cross", leverage: 10,
    });
    expect((await json<{ order: { reject_reason: string } }>(res)).order.reject_reason).toBe("reduce_only_exceeds_position");
  });
});

// ============================================================================
// GROUP H: Spot accounting
// ============================================================================
describe("paper-trading spot accounting", () => {
  test("spot buy requires margin_mode spot", async () => {
    await registerPaperAccount({ allowed_markets: ["spot:PURR/USDC"] });
    await createPaperMarketSnapshot({ market_type: "spot", coin: "PURR/USDC", mark_px: 0.2, bids: [{ px: 0.19, sz: 100 }], asks: [{ px: 0.2, sz: 100 }] });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "spot-cross", market_type: "spot", coin: "PURR/USDC",
      side: "buy", tif: "Ioc", size: 10, margin_mode: "cross",
    });
    expect(res.status).toBe(400);
  });

  test("spot buy insufficient cash is rejected", async () => {
    await registerPaperAccount({ starting_balance_usd: 1, allowed_markets: ["spot:PURR/USDC"] });
    await createPaperMarketSnapshot({ market_type: "spot", coin: "PURR/USDC", mark_px: 0.2, bids: [{ px: 0.19, sz: 1000 }], asks: [{ px: 0.2, sz: 1000 }] });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "spot-poor", market_type: "spot", coin: "PURR/USDC",
      side: "buy", tif: "Ioc", size: 100, margin_mode: "spot",
    });
    expect((await json<{ order: { reject_reason: string } }>(res)).order.reject_reason).toBe("spot_insufficient_cash");
  });

  test("spot reduce_only not supported", async () => {
    await registerPaperAccount({ allowed_markets: ["spot:PURR/USDC"] });
    await createPaperMarketSnapshot({ market_type: "spot", coin: "PURR/USDC", mark_px: 0.2, bids: [{ px: 0.19, sz: 100 }], asks: [{ px: 0.2, sz: 100 }] });
    const res = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "spot-ro", market_type: "spot", coin: "PURR/USDC",
      side: "sell", tif: "Ioc", size: 10, margin_mode: "spot", reduce_only: true,
    });
    expect((await json<{ order: { reject_reason: string } }>(res)).order.reject_reason).toBe("spot_reduce_only_not_supported");
  });

  test("spot buy then sell realizes pnl and conserves cash minus fees", async () => {
    await registerPaperAccount({ allowed_markets: ["spot:PURR/USDC"] });
    await createPaperMarketSnapshot({ market_type: "spot", coin: "PURR/USDC", mark_px: 1, bids: [{ px: 1, sz: 1000 }], asks: [{ px: 1, sz: 1000 }] });
    const start = account().cash_balance_usd;
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "sb", market_type: "spot", coin: "PURR/USDC",
      side: "buy", tif: "Ioc", size: 100, margin_mode: "spot",
    });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "ss", market_type: "spot", coin: "PURR/USDC",
      side: "sell", tif: "Ioc", size: 100, margin_mode: "spot",
    });
    const end = account().cash_balance_usd;
    expect(start - end).toBeCloseTo(0.07, 5);
  });
});

// ============================================================================
// GROUP I: Liquidation boundaries
// ============================================================================
describe("paper-trading liquidation", () => {
  test("position well above maintenance does NOT liquidate", async () => {
    await registerPaperAccount({ starting_balance_usd: 1000 });
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 200 }], asks: [{ px: 100, sz: 200 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "liq-open", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "isolated", leverage: 10,
    });
    currentNow = new Date(currentNow.getTime() + 1000);
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 99.9, bids: [{ px: 99.9, sz: 200 }], asks: [{ px: 99.9, sz: 200 }] });
    const res = await postJson("/paper/accounts/paper-1/risk-check", {});
    expect((await json<{ liquidations: unknown[] }>(res)).liquidations).toHaveLength(0);
  });

  test("risk-check is idempotent: a liquidated position is not liquidated twice", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 200 }], asks: [{ px: 100, sz: 200 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "liq2-open", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "isolated", leverage: 20,
    });
    currentNow = new Date(currentNow.getTime() + 1000);
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 80, bids: [{ px: 80, sz: 200 }], asks: [{ px: 80, sz: 200 }] });
    const first = await postJson("/paper/accounts/paper-1/risk-check", {});
    expect((await json<{ liquidations: unknown[] }>(first)).liquidations.length).toBeGreaterThan(0);
    const second = await postJson("/paper/accounts/paper-1/risk-check", {});
    expect((await json<{ liquidations: unknown[] }>(second)).liquidations).toHaveLength(0);
  });

  test("catastrophic drop liquidates isolated position and flattens size", async () => {
    await registerPaperAccount({ starting_balance_usd: 1000 });
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 200 }], asks: [{ px: 100, sz: 200 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "liq3-open", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "isolated", leverage: 10,
    });
    currentNow = new Date(currentNow.getTime() + 1000);
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 50, bids: [{ px: 50, sz: 200 }], asks: [{ px: 50, sz: 200 }] });
    await postJson("/paper/accounts/paper-1/risk-check", {});
    const pos = position("BTC", "isolated");
    expect(pos?.status).toBe("liquidated");
    expect(pos?.signed_size).toBe(0);
  });

  test("cross liquidation floors cash and equity at zero", async () => {
    await registerPaperAccount({ starting_balance_usd: 1000 });
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 200 }], asks: [{ px: 100, sz: 200 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "cross-bankruptcy-open", coin: "BTC",
      side: "buy", tif: "Ioc", size: 90, margin_mode: "cross", leverage: 10,
    });
    currentNow = new Date(currentNow.getTime() + 1000);
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 50, bids: [{ px: 50, sz: 200 }], asks: [{ px: 50, sz: 200 }] });
    const res = await postJson("/paper/accounts/paper-1/risk-check", {});
    const body = await json<{ risk: { risk: { cash_balance_usd: number; equity_usd: number } }; liquidations: unknown[] }>(res);
    expect(body.liquidations).toHaveLength(1);
    expect(account().cash_balance_usd).toBe(0);
    expect(body.risk.risk.cash_balance_usd).toBe(0);
    expect(body.risk.risk.equity_usd).toBe(0);
  });
});

// ============================================================================
// GROUP J: Idempotency & precision
// ============================================================================
describe("paper-trading idempotency & precision", () => {
  test("persists raw atom fields while keeping numeric report fields derived", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    const response = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "raw-atoms", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    expect(response.status).toBe(201);

    const rawRows = rawAtomRows();
    expect(rawRows.account.starting_balance_raw).toBe("100000000000");
    expect(rawRows.account.cash_balance_raw).toBe("99996500000");
    expect(rawRows.market.mark_px_raw).toBe("10000000000");
    expect(rawRows.order.size_raw).toBe("100000000");
    expect(rawRows.order.notional_raw).toBe("10000000000");
    expect(rawRows.order.fee_raw).toBe("3500000");
    expect(rawRows.fill.px_raw).toBe("10000000000");
    expect(rawRows.fill.size_raw).toBe("100000000");
    expect(rawRows.position.signed_size_raw).toBe("100000000");
    expect(rawRows.position.entry_px_raw).toBe("10000000000");
    expect(rawRows.position.fee_raw).toBe("3500000");
    expect(rawRows.risk.equity_raw).toBe("99996500000");
    expect(rawRows.leaderboard.paper_pnl_raw).toBe("-3500000");
  });

  test("duplicate client_order_id returns idempotent result, no double fill", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    const body = {
      paper_account_id: "paper-1", client_order_id: "idem-1", coin: "BTC",
      side: "buy" as const, tif: "Ioc" as const, size: 1, margin_mode: "cross", leverage: 10,
    };
    const r1 = await paperSignedPost("/paper/orders", body);
    expect(r1.status).toBe(201);
    const r2 = await paperSignedPost("/paper/orders", body);
    const b2 = await json<{ idempotent: boolean }>(r2);
    expect(b2.idempotent).toBe(true);
    expect(countFills()).toBe(1);
    const pos = position("BTC", "cross");
    expect(pos?.signed_size).toBeCloseTo(1);
  });

  test("tiny residual sizes round to zero (no float dust position)", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "dust-a", coin: "BTC",
      side: "buy", tif: "Ioc", size: 0.1, margin_mode: "cross", leverage: 10,
    });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "dust-b", coin: "BTC",
      side: "buy", tif: "Ioc", size: 0.2, margin_mode: "cross", leverage: 10,
    });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "dust-close", coin: "BTC",
      side: "sell", tif: "Ioc", size: 0.3, margin_mode: "cross", leverage: 10,
    });
    const pos = position("BTC", "cross");
    expect(pos?.status).toBe("closed");
    expect(Math.abs(pos?.signed_size ?? 1)).toBeLessThan(1e-9);
  });

  test("replay endpoint reproduces order + fills + audit", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    const r = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "replay-x", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    const orderId = (await json<{ order: { id: string } }>(r)).order.id;
    const replay = await app.fetch(new Request(`http://ledger.test/paper/orders/${orderId}/replay`));
    const body = await json<{ replay: { fills: unknown[]; audit: unknown[] } }>(replay);
    expect(body.replay.fills.length).toBe(1);
    expect(body.replay.audit.length).toBeGreaterThan(0);
  });

  test("audit hash chain is linked (previous_hash of N = event_hash of N-1)", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "chain-1", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    const rows = sqliteDb.raw.query<{ event_hash: string; previous_hash: string | null }, []>(
      "SELECT event_hash, previous_hash FROM paper_audit_events ORDER BY COALESCE(ingest_sequence, 0) ASC, created_at ASC, id ASC",
    ).all();
    expect(rows.length).toBeGreaterThan(1);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].previous_hash).toBe(rows[i - 1].event_hash);
    }
  });

  test("latest risk snapshot uses ingestion order when created_at ties", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({ coin: "BTC", mark_px: 100, bids: [{ px: 100, sz: 50 }], asks: [{ px: 100, sz: 50 }] });
    await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1", client_order_id: "risk-source-open", coin: "BTC",
      side: "buy", tif: "Ioc", size: 1, margin_mode: "cross", leverage: 10,
    });
    const latest = await createPaperMarketSnapshot({ coin: "BTC", mark_px: 101, bids: [{ px: 101, sz: 50 }], asks: [{ px: 101, sz: 50 }] });
    await postJson("/paper/accounts/paper-1/risk-check", {});
    const res = await app.fetch(new Request("http://ledger.test/paper/accounts/paper-1"));
    const body = await json<{ latest_risk: { source_market_snapshot_id: string } }>(res);
    expect(body.latest_risk.source_market_snapshot_id).toBe(latest.id);
  });
});

// ============================================================================
// Helpers
// ============================================================================
async function registerPaperAccount(overrides: Record<string, unknown> = {}) {
  await registerAgent();
  const res = await postJson("/paper/accounts", {
    paper_account_id: "paper-1", agent_id: "ironclaw", agent_public_key: wallet.publicKey,
    starting_balance_usd: 1000, allowed_markets: ["BTC", "ETH"], ...overrides,
  });
  expect(res.status).toBe(201);
  return (await json<{ account: Record<string, any> }>(res)).account;
}

async function registerAgent() {
  const body = {
    agent_id: "ironclaw",
    agent_public_key: wallet.publicKey,
    metadata: { source: "paper-edge-test" },
  };
  const rawBody = JSON.stringify(body);
  const timestamp = currentNow.getTime().toString();
  const nonce = crypto.randomUUID();
  const bodyHash = sha256Hex(rawBody);
  const payload = canonicalAgentAuthPayload({
    purpose: "agent_registration",
    method: "POST",
    path: "/agents",
    bodyHash,
    timestamp,
    nonce,
    agentId: "ironclaw",
    agentPublicKey: wallet.publicKey,
    boardId: null,
  });
  const signature = wallet.keyPair.sign(new TextEncoder().encode(payload)).signature;
  const res = await app.fetch(new Request("http://ledger.test/agents", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken}`,
      "x-clawhouse-agent-public-key": wallet.publicKey,
      "x-clawhouse-agent-timestamp": timestamp,
      "x-clawhouse-agent-nonce": nonce,
      "x-clawhouse-agent-body-sha256": bodyHash,
      "x-clawhouse-agent-signature": Buffer.from(signature).toString("base64url"),
    },
    body: rawBody,
  }));
  expect(res.status).toBe(201);
}

async function createPaperMarketSnapshot(overrides: Record<string, unknown>) {
  rememberHyperliquidFixture(overrides);
  const body = {
    source: "test-fixture",
    maintenance_margin_rate: 0.005,
    observed_at: currentNow.toISOString(),
    ...overrides,
  };
  const result = await insertPaperMarketSnapshot(sqliteDb, {
    raw: JSON.stringify(body),
    json: body,
  }, currentNow.toISOString());
  return result.snapshot;
}

function rememberHyperliquidFixture(overrides: Record<string, unknown>) {
  const marketType = String(overrides.market_type ?? overrides.marketType ?? "perp");
  const coin = requiredBodyString(overrides.coin, "coin").toUpperCase();
  currentHyperliquidMarkets[coin] = {
    marketType,
    coin,
    markPx: Number(overrides.mark_px ?? overrides.markPx),
    oraclePx: optionalFixtureNumber(overrides.oracle_px ?? overrides.oraclePx),
    funding: optionalFixtureNumber(overrides.funding_rate ?? overrides.fundingRate),
    maxLeverage: optionalFixtureNumber(overrides.max_leverage ?? overrides.maxLeverage),
    observedAtMs: Date.parse(String(overrides.observed_at ?? overrides.observedAt ?? currentNow.toISOString())),
    bids: fixtureLevels(overrides.bids),
    asks: fixtureLevels(overrides.asks),
  };
  currentRpcFetch = mockHyperliquidFetchFromFixtures;
}

function fixtureLevels(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const level = item as Record<string, unknown>;
    return {
      px: Number(level.px),
      sz: Number(level.sz),
      n: typeof level.n === "number" ? level.n : 1,
    };
  });
}

function optionalFixtureNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}

async function mockHyperliquidFetchFromFixtures(_request: string | URL | Request, init?: RequestInit) {
  const body = JSON.parse(String(init?.body ?? "{}")) as { type?: string; coin?: string };
  if (body.type === "metaAndAssetCtxs") {
    const perps = Object.values(currentHyperliquidMarkets).filter((market) => market.marketType !== "spot");
    return new Response(JSON.stringify([
      { universe: perps.map((market) => ({ name: market.coin, maxLeverage: market.maxLeverage ?? 40 })) },
      perps.map((market) => ({
        markPx: String(market.markPx),
        oraclePx: String(market.oraclePx ?? market.markPx),
        funding: String(market.funding ?? 0),
      })),
    ]), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (body.type === "spotMetaAndAssetCtxs") {
    const spots = Object.values(currentHyperliquidMarkets).filter((market) => market.marketType === "spot");
    return new Response(JSON.stringify([
      { universe: spots.map((market, index) => ({ name: market.coin, index })) },
      spots.map((market) => ({
        markPx: String(market.markPx),
        midPx: String(market.markPx),
        oraclePx: String(market.oraclePx ?? market.markPx),
      })),
    ]), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (body.type === "l2Book" && body.coin) {
    const market = currentHyperliquidMarkets[body.coin.toUpperCase()];
    if (!market) {
      return new Response(JSON.stringify({ error: `missing book for ${body.coin}` }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      coin: body.coin.toUpperCase(),
      time: market.observedAtMs,
      levels: [
        market.bids.map((level) => ({ px: String(level.px), sz: String(level.sz), n: level.n })),
        market.asks.map((level) => ({ px: String(level.px), sz: String(level.sz), n: level.n })),
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ error: "unsupported hyperliquid fixture request" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

async function postJson(path: string, body: Record<string, unknown>) {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${adminToken}` };
  if (path === "/paper/accounts") {
    const timestamp = currentNow.getTime().toString();
    const nonce = crypto.randomUUID();
    const bodyHash = sha256Hex(rawBody);
    const payload = canonicalAgentAuthPayload({
      purpose: "paper_account_registration",
      method: "POST",
      path,
      bodyHash,
      timestamp,
      nonce,
      agentId: requiredBodyString(body.agent_id ?? body.agentId, "agent_id"),
      agentPublicKey: requiredBodyString(body.agent_public_key ?? body.agentPublicKey, "agent_public_key"),
      boardId: optionalBodyString(body.board_id ?? body.boardId),
    });
    const signature = wallet.keyPair.sign(new TextEncoder().encode(payload)).signature;
    headers["x-clawhouse-agent-public-key"] = wallet.publicKey;
    headers["x-clawhouse-agent-timestamp"] = timestamp;
    headers["x-clawhouse-agent-nonce"] = nonce;
    headers["x-clawhouse-agent-body-sha256"] = bodyHash;
    headers["x-clawhouse-agent-signature"] = Buffer.from(signature).toString("base64url");
  }
  return await app.fetch(new Request(`http://ledger.test${path}`, {
    method: "POST",
    headers,
    body: rawBody,
  }));
}

function requiredBodyString(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing ${name} in test body`);
  return value.trim();
}

function optionalBodyString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

async function rawPaperPost(path: string, rawBody: string) {
  const timestamp = currentNow.getTime().toString();
  const nonce = crypto.randomUUID();
  const bodyHash = sha256Hex(rawBody);
  const payload = canonicalPaperAuthPayload({
    method: "POST", path, bodyHash, timestamp, nonce, paperAccountId: "paper-1", agentId: "ironclaw",
  });
  const signature = wallet.keyPair.sign(new TextEncoder().encode(payload)).signature;
  return await app.fetch(new Request(`http://ledger.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-clawhouse-paper-account-id": "paper-1",
      "x-clawhouse-agent-id": "ironclaw",
      "x-clawhouse-paper-timestamp": timestamp,
      "x-clawhouse-paper-nonce": nonce,
      "x-clawhouse-paper-body-sha256": bodyHash,
      "x-clawhouse-paper-signature": Buffer.from(signature).toString("base64url"),
    },
    body: rawBody,
  }));
}

function signPaper(
  path: string,
  body: Record<string, unknown>,
  signer = wallet,
  paperAccountId = "paper-1",
  nonceOverride?: string,
  timestampOverride?: string,
) {
  const signedBody = paperOrderTestBody(body);
  const rawBody = JSON.stringify(signedBody);
  const timestamp = timestampOverride ?? currentNow.getTime().toString();
  const nonce = nonceOverride ?? crypto.randomUUID();
  const bodyHash = sha256Hex(rawBody);
  const payload = canonicalPaperAuthPayload({
    method: "POST", path, bodyHash, timestamp, nonce, paperAccountId, agentId: "ironclaw",
  });
  const signature = signer.keyPair.sign(new TextEncoder().encode(payload)).signature;
  return {
    rawBody,
    headers: {
      "content-type": "application/json",
      "x-clawhouse-paper-account-id": paperAccountId,
      "x-clawhouse-agent-id": "ironclaw",
      "x-clawhouse-paper-timestamp": timestamp,
      "x-clawhouse-paper-nonce": nonce,
      "x-clawhouse-paper-body-sha256": bodyHash,
      "x-clawhouse-paper-signature": Buffer.from(signature).toString("base64url"),
    } as Record<string, string>,
  };
}

function paperOrderTestBody(body: Record<string, unknown>) {
  const next = { ...body };
  const coin = String(next.coin ?? "BTC").toUpperCase();
  const tif = String(next.tif ?? next.timeInForce ?? next.time_in_force ?? next.orderType ?? next.order_type ?? "Ioc").toLowerCase();
  const hasLimitPx = next.limitPx !== undefined || next.limit_px !== undefined;
  const hasMaxSlippage = next.maxSlippageBps !== undefined || next.max_slippage_bps !== undefined;
  if (!hasLimitPx && !hasMaxSlippage && (tif === "ioc" || tif === "market")) {
    next.max_slippage_bps = 50;
  }
  if (next.reference_px === undefined && next.referencePx === undefined) {
    next.reference_px = defaultReferencePx(coin);
  }
  if (next.max_reference_deviation_bps === undefined && next.maxReferenceDeviationBps === undefined) {
    next.max_reference_deviation_bps = 100;
  }
  if (next.reason === undefined) {
    next.reason = "Paper trading edge test order.";
  }
  return next;
}

function defaultReferencePx(coin: string) {
  const market = currentHyperliquidMarkets[coin];
  if (market) return market.markPx;
  if (coin === "ETH") return 2000;
  if (coin === "PURR/USDC") return 0.2;
  return 100;
}

async function paperSignedPost(
  path: string,
  body: Record<string, unknown>,
  signer = wallet,
  paperAccountId = "paper-1",
) {
  const signed = signPaper(path, body, signer, paperAccountId);
  return await app.fetch(new Request(`http://ledger.test${path}`, {
    method: "POST", headers: signed.headers, body: signed.rawBody,
  }));
}

function account() {
  return sqliteDb.raw.query<{ cash_balance_usd: number; starting_balance_usd: number }, []>(
    "SELECT cash_balance_usd, starting_balance_usd FROM paper_accounts WHERE id = 'paper-1'",
  ).get()!;
}

function position(coin: string, marginMode: string) {
  return sqliteDb.raw.query<{ signed_size: number; entry_px: number; realized_pnl_usd: number; status: string; isolated_margin_usd: number }, [string, string]>(
    "SELECT signed_size, entry_px, realized_pnl_usd, status, isolated_margin_usd FROM paper_positions WHERE paper_account_id = 'paper-1' AND coin = ? AND margin_mode = ?",
  ).get(coin, marginMode);
}

function countPositions() {
  return sqliteDb.raw.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM paper_positions").get()?.c ?? 0;
}
function countFills() {
  return sqliteDb.raw.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM paper_fills").get()?.c ?? 0;
}
function countOrders() {
  return sqliteDb.raw.query<{ c: number }, []>("SELECT COUNT(*) AS c FROM paper_orders").get()?.c ?? 0;
}

function rawAtomRows() {
  return {
    account: sqliteDb.raw.query<{ starting_balance_raw: string; cash_balance_raw: string }, []>(
      "SELECT starting_balance_raw, cash_balance_raw FROM paper_accounts WHERE id = 'paper-1'",
    ).get()!,
    market: sqliteDb.raw.query<{ mark_px_raw: string }, []>(
      "SELECT mark_px_raw FROM paper_market_snapshots WHERE coin = 'BTC' ORDER BY created_at DESC LIMIT 1",
    ).get()!,
    order: sqliteDb.raw.query<{ size_raw: string; notional_raw: string; fee_raw: string }, []>(
      "SELECT size_raw, notional_raw, fee_raw FROM paper_orders WHERE client_order_id = 'raw-atoms'",
    ).get()!,
    fill: sqliteDb.raw.query<{ px_raw: string; size_raw: string }, []>(
      "SELECT px_raw, size_raw FROM paper_fills WHERE paper_account_id = 'paper-1' ORDER BY created_at DESC LIMIT 1",
    ).get()!,
    position: sqliteDb.raw.query<{ signed_size_raw: string; entry_px_raw: string; fee_raw: string }, []>(
      "SELECT signed_size_raw, entry_px_raw, fee_raw FROM paper_positions WHERE paper_account_id = 'paper-1'",
    ).get()!,
    risk: sqliteDb.raw.query<{ equity_raw: string }, []>(
      "SELECT equity_raw FROM paper_risk_snapshots WHERE paper_account_id = 'paper-1' ORDER BY created_at DESC LIMIT 1",
    ).get()!,
    leaderboard: sqliteDb.raw.query<{ paper_pnl_raw: string }, []>(
      "SELECT paper_pnl_raw FROM paper_leaderboard_snapshots WHERE paper_account_id = 'paper-1' ORDER BY created_at DESC LIMIT 1",
    ).get()!,
  };
}

function createWallet() {
  const keyPair = KeyPair.fromRandom("ed25519");
  return { keyPair, publicKey: keyPair.getPublicKey().toString(), walletAddress: keyToImplicitAddress(keyPair.getPublicKey()) };
}

async function json<T>(response: Response) {
  return (await response.json()) as T;
}
