import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { KeyPair, keyToImplicitAddress } from "@near-js/crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, openMigratedRuntimeLedgerDb, openRuntimeLedgerDb, openSqliteLedgerDb, type LedgerDb, type SqliteLedgerDb } from "../src/db";
import { ADMIN_TOKEN_ENV, canonicalAgentAuthPayload, canonicalAuthPayload, sha256Hex } from "../src/auth";
import { canonicalPaperAuthPayload, createPaperMarketSnapshot as insertPaperMarketSnapshot } from "../src/paper-trading";
import { createApp } from "../src/server";

const adminToken = "ledger-admin-token";
const tempRoots: string[] = [];
let app: ReturnType<typeof createApp>;
let sqliteDb: SqliteLedgerDb;
let wallet: ReturnType<typeof createWallet>;
let agentWallet: ReturnType<typeof createWallet>;
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
  const root = await mkdtemp(join(tmpdir(), "clawhouse-ledger-"));
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
  agentWallet = createWallet();
});

afterEach(async () => {
  await app.db.close();
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Agent Board Ledger local backend", () => {
  test("uses the same fixed-order canonical auth payload as the wallet tool", () => {
    expect(canonicalAuthPayload({
      method: "post",
      path: "/boards/board-1/events",
      bodyHash: "0".repeat(64),
      timestamp: "2026-06-19T00:00:00.000Z",
      nonce: "nonce-1",
      boardId: "board-1",
      agentId: "ironclaw",
      walletAddress: wallet.walletAddress,
    })).toBe(JSON.stringify({
      domain: "clawhouse.agent-board-ledger.v0",
      version: 1,
      method: "POST",
      path: "/boards/board-1/events",
      bodyHash: "0".repeat(64),
      timestamp: "2026-06-19T00:00:00.000Z",
      nonce: "nonce-1",
      boardId: "board-1",
      agentId: "ironclaw",
      walletAddress: wallet.walletAddress,
    }));
  });

  test("uses the same fixed-order canonical agent auth payload as the wallet tool", () => {
    expect(canonicalAgentAuthPayload({
      purpose: "board_registration",
      method: "post",
      path: "/boards",
      bodyHash: "0".repeat(64),
      timestamp: "2026-06-19T00:00:00.000Z",
      nonce: "agent-nonce-1",
      agentId: "ironclaw",
      agentPublicKey: agentWallet.publicKey,
      boardId: "board-1",
    })).toBe(JSON.stringify({
      domain: "clawhouse.agent-board-ledger.v0",
      version: 1,
      purpose: "board_registration",
      method: "POST",
      path: "/boards",
      bodyHash: "0".repeat(64),
      timestamp: "2026-06-19T00:00:00.000Z",
      nonce: "agent-nonce-1",
      agentId: "ironclaw",
      agentPublicKey: agentWallet.publicKey,
      boardId: "board-1",
    }));
  });

  test("registers a board", async () => {
    const board = await registerBoard();
    const persisted = sqliteDb.raw.query<Record<string, any>, []>("SELECT * FROM boards WHERE id = 'board-1'").get();
    const trackedWallet = sqliteDb.raw
      .query<Record<string, any>, []>("SELECT * FROM tracked_wallets WHERE board_id = 'board-1'")
      .get();

    expect(board.id).toBe("board-1");
    expect(board.wallet_address).toBe(wallet.walletAddress);
    expect(board.chain).toBe("near");
    expect(board.venue_namespace).toBe("near-intents");
    expect(board.tracking_started_at).toBe("2026-06-19T00:00:00.000Z");
    expect("starting_value_usd" in board).toBe(false);
    expect(persisted?.chain).toBe("near");
    expect(persisted?.venue_namespace).toBe("near-intents");
    expect(persisted?.tracking_started_at).toBe("2026-06-19T00:00:00.000Z");
    expect(trackedWallet?.wallet_address).toBe(wallet.walletAddress);
    expect(trackedWallet?.tracking_started_at).toBe("2026-06-19T00:00:00.000Z");
  });

  test("lists active public boards for agent discovery", async () => {
    await registerBoard({
      metadata: {
        name: "IronClaw",
        description: "Public paper-trading agent.",
        strategy_summary: "Hyperliquid paper perps.",
      },
    });
    await registerBoard({
      board_id: "board-holder-gated",
      agent_id: "holder-gated",
      visibility_mode: "holder_gated",
    });
    await registerBoard({
      board_id: "board-draft",
      agent_id: "draft-agent",
      public_status: "draft",
    });

    const response = await app.fetch(new Request("http://ledger.test/boards"));
    const body = await jsonOf<{
      ok: true;
      mode: string;
      count: number;
      boards: Array<{ id: string; agent_id: string; metadata?: Record<string, unknown>; metadata_json?: unknown }>;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.mode).toBe("public_active_boards");
    expect(body.count).toBe(1);
    expect(body.boards.map((board) => board.id)).toEqual(["board-1"]);
    expect(body.boards[0]?.agent_id).toBe("ironclaw");
    expect(body.boards[0]?.metadata?.name).toBe("IronClaw");
    expect("metadata_json" in (body.boards[0] ?? {})).toBe(false);
  });

  test("records a verified key-market buy report from a NEAR tx hash", async () => {
    currentRpcFetch = mockNearKeyMarketTx({
      txHash: "key-buy-tx",
      signerId: "buyer.testnet",
      methodName: "buy_key",
      side: "buy",
      agentId: "terminal_chad6",
      amount: "1",
      totalCost: "55550000000000000000000",
      payout: "0",
    });

    const report = await app.fetch(new Request("http://ledger.test/key-market/trades/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        txHash: "key-buy-tx",
        signerId: "buyer.testnet",
        agentId: "terminal_chad6",
        side: "buy",
        amount: "1",
      }),
    }));
    const reportBody = await jsonOf<{ ok: true; trade: { tx_hash: string; side: string; source: string; total_cost: string } }>(report);

    expect(report.status).toBe(201);
    expect(reportBody.trade.tx_hash).toBe("key-buy-tx");
    expect(reportBody.trade.side).toBe("buy");
    expect(reportBody.trade.source).toBe("contract_event");
    expect(reportBody.trade.total_cost).toBe("55550000000000000000000");

    const list = await app.fetch(new Request("http://ledger.test/key-market/trades?agentId=terminal_chad6"));
    const listBody = await jsonOf<{ ok: true; count: number; trades: Array<{ tx_hash: string }> }>(list);
    expect(list.status).toBe(200);
    expect(listBody.count).toBe(1);
    expect(listBody.trades[0]?.tx_hash).toBe("key-buy-tx");
  });

  test("rejects a key-market trade report when the reported side does not match the tx", async () => {
    currentRpcFetch = mockNearKeyMarketTx({
      txHash: "key-sell-tx",
      signerId: "seller.testnet",
      methodName: "sell_key",
      side: "sell",
      agentId: "terminal_chad6",
      amount: "1",
      totalCost: "0",
      payout: "46800000000000000000000",
    });

    const report = await app.fetch(new Request("http://ledger.test/key-market/trades/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        txHash: "key-sell-tx",
        signerId: "seller.testnet",
        agentId: "terminal_chad6",
        side: "buy",
        amount: "1",
      }),
    }));

    expect(report.status).toBe(400);
    expect((await jsonOf<{ error: string }>(report)).error).toContain("side");
  });

  test("rejects a key-market trade report with a mismatched reported contract before RPC lookup", async () => {
    let rpcCalled = false;
    currentRpcFetch = async () => {
      rpcCalled = true;
      return new Response("{}");
    };

    const report = await app.fetch(new Request("http://ledger.test/key-market/trades/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        txHash: "key-buy-tx",
        signerId: "buyer.testnet",
        agentId: "terminal_chad6",
        side: "buy",
        amount: "1",
        contractId: "attacker-key-market.testnet",
      }),
    }));

    expect(report.status).toBe(400);
    expect((await jsonOf<{ error: string }>(report)).error).toContain("contract_id");
    expect(rpcCalled).toBe(false);
  });

  test("migrates production accounting schema without dropping legacy rows", () => {
    const legacy = new Database(":memory:");
    legacy.exec("PRAGMA foreign_keys = ON");
    legacy.exec(`
      CREATE TABLE boards (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        public_key TEXT NOT NULL,
        starting_value_usd REAL NOT NULL,
        base_currency TEXT NOT NULL,
        public_status TEXT NOT NULL,
        visibility_mode TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO boards
        (id, agent_id, wallet_address, public_key, starting_value_usd, base_currency, public_status, visibility_mode, created_at)
        VALUES ('board-legacy', 'ironclaw', 'wallet-legacy', 'public-key-legacy', 100, 'USD', 'active', 'public', '2026-06-19T00:00:00.000Z');

      CREATE TABLE pnl_snapshots (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        starting_value_usd REAL NOT NULL,
        current_value_usd REAL NOT NULL,
        net_topups_usd REAL NOT NULL,
        net_withdrawals_usd REAL NOT NULL,
        pnl_usd REAL NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO pnl_snapshots
        (id, board_id, observed_at, starting_value_usd, current_value_usd, net_topups_usd, net_withdrawals_usd, pnl_usd, created_at)
        VALUES ('pnl-legacy', 'board-legacy', '2026-06-19T00:01:00.000Z', 100, 115, 0, 0, 15, '2026-06-19T00:01:00.000Z');
      INSERT INTO pnl_snapshots
        (id, board_id, observed_at, starting_value_usd, current_value_usd, net_topups_usd, net_withdrawals_usd, pnl_usd, created_at)
        VALUES ('pnl-legacy-drawdown', 'board-legacy', '2026-06-19T00:02:00.000Z', 100, 90, 0, 0, -10, '2026-06-19T00:02:00.000Z');

      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        event_type TEXT NOT NULL,
        client_event_id TEXT,
        tx_hash TEXT,
        intent_id TEXT,
        status_claim TEXT,
        asset_in TEXT,
        amount_in REAL,
        asset_out TEXT,
        amount_out REAL,
        reason TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO events
        (id, board_id, agent_id, wallet_address, event_type, client_event_id, tx_hash, intent_id, status_claim, asset_in, amount_in, asset_out, amount_out, reason, metadata_json, created_at)
        VALUES ('evt-legacy', 'board-legacy', 'ironclaw', 'wallet-legacy', 'agent_reported', 'client-legacy', 'tx-legacy', NULL, 'filled', 'USDC', 1, 'NEAR', 2, 'legacy reason', NULL, '2026-06-19T00:02:00.000Z');
    `);

    migrate(legacy);

    const tables = legacy
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    for (const table of ["tracked_wallets", "balance_changes", "price_snapshots", "read_access_checks", "audit_events"]) {
      expect(tables).toContain(table);
    }
    for (const table of [
      "paper_accounts",
      "paper_auth_nonces",
      "paper_market_snapshots",
      "paper_orders",
      "paper_fills",
      "paper_positions",
      "paper_risk_snapshots",
      "paper_liquidation_events",
      "paper_leaderboard_snapshots",
      "paper_audit_events",
    ]) {
      expect(tables).toContain(table);
    }
    for (const column of ["chain", "venue_namespace", "tracking_started_at", "owner_wallet_address", "funding_source"]) {
      expect(columnNames(legacy, "boards")).toContain(column);
    }
    expect(columnNames(legacy, "boards")).not.toContain("starting_value_usd");
    for (const column of ["agent_id", "holding_snapshot_id", "price_snapshot_id", "total_pnl_pct", "drawdown_pct", "staleness_status"]) {
      expect(columnNames(legacy, "pnl_snapshots")).toContain(column);
    }
    expect(columnNames(legacy, "pnl_snapshots")).not.toContain("starting_value_usd");
    expect(columnNames(legacy, "events")).toContain("reported_at");

    const board = legacy.query<Record<string, any>, []>("SELECT * FROM boards WHERE id = 'board-legacy'").get();
    const trackedWallet = legacy
      .query<Record<string, any>, []>("SELECT * FROM tracked_wallets WHERE board_id = 'board-legacy'")
      .get();
    const paperAccount = legacy
      .query<Record<string, any>, []>("SELECT * FROM paper_accounts WHERE board_id = 'board-legacy'")
      .get();
    const pnl = legacy.query<Record<string, any>, []>("SELECT * FROM pnl_snapshots WHERE id = 'pnl-legacy'").get();
    const drawdownPnl = legacy
      .query<Record<string, any>, []>("SELECT * FROM pnl_snapshots WHERE id = 'pnl-legacy-drawdown'")
      .get();
    const event = legacy.query<Record<string, any>, []>("SELECT * FROM events WHERE id = 'evt-legacy'").get();

    expect(board?.chain).toBe("near");
    expect(board?.venue_namespace).toBe("near-intents");
    expect(board?.tracking_started_at).toBe("2026-06-19T00:00:00.000Z");
    expect(trackedWallet?.wallet_address).toBe("wallet-legacy");
    expect(trackedWallet?.tracking_started_at).toBe("2026-06-19T00:00:00.000Z");
    expect(paperAccount?.starting_balance_usd).toBe(100);
    expect(paperAccount?.cash_balance_usd).toBe(100);
    expect(paperAccount?.agent_public_key).toBe("public-key-legacy");
    expect(pnl?.agent_id).toBe("ironclaw");
    expect(pnl?.total_pnl_pct).toBeCloseTo(0.15);
    expect(pnl?.high_water_mark_usd).toBe(115);
    expect(pnl?.drawdown_pct).toBe(0);
    expect(drawdownPnl?.high_water_mark_usd).toBe(115);
    expect(drawdownPnl?.drawdown_pct).toBeCloseTo((115 - 90) / 115);
    expect(pnl?.observed_trade_count).toBe(0);
    expect(pnl?.staleness_status).toBe("unknown");
    expect(event?.reported_at).toBe("2026-06-19T00:02:00.000Z");

    legacy.close();
  });

  test("health reports DB readiness without leaking local paths", async () => {
    const response = await app.fetch(new Request("http://ledger.test/health"));
    const body = await jsonOf<Record<string, unknown>>(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, service: "agent-board-ledger", db: "ready" });
    expect("dbPath" in body).toBe(false);
  });

  test("runtime DB requires a Postgres URL instead of falling back to SQLite", async () => {
    await expect(openRuntimeLedgerDb({})).rejects.toThrow(
      "Missing AGENT_BOARD_LEDGER_DATABASE_URL, DATABASE_URL, or ledgerDatabaseUrl; runtime storage must use Postgres",
    );
  });

  test("runtime DB open does not run Postgres migrations", async () => {
    const fake = createFakeLedgerDb();
    const db = await openRuntimeLedgerDb(
      { AGENT_BOARD_LEDGER_DATABASE_URL: "postgres://runtime.test/db" },
      () => fake.db,
    );

    expect(db).toBe(fake.db);
    expect(fake.runs).toEqual([]);
  });

  test("explicit migrated runtime DB open runs Postgres migrations", async () => {
    const fake = createFakeLedgerDb();
    const db = await openMigratedRuntimeLedgerDb(
      { AGENT_BOARD_LEDGER_DATABASE_URL: "postgres://runtime.test/db" },
      () => fake.db,
    );

    expect(db).toBe(fake.db);
    expect(fake.runs.length).toBeGreaterThan(0);
    expect(fake.closed).toBe(false);
  });

  test("requires service authorization for board registration", async () => {
    const response = await postJson("/boards", {
      board_id: "board-1",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
    }, { admin: false, signed: true });

    expect(response.status).toBe(401);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Missing service authorization");
  });

  test("requires board registration to be signed by the bound wallet", async () => {
    const response = await postJson("/boards", {
      board_id: "board-1",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
    });

    expect(response.status).toBe(401);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Missing x-clawhouse-wallet-address");
  });

  test("rejects board registration signed by a different wallet", async () => {
    const otherWallet = createWallet();
    const response = await postJson("/boards", {
      board_id: "board-1",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
    }, { signed: true, signer: otherWallet });

    expect(response.status).toBe(401);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Wallet does not match board registration");
  });

  test("requires board registration to be signed by a registered agent key", async () => {
    await registerAgent("ironclaw", agentWallet.publicKey);
    const body = {
      board_id: "board-1",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
    };

    const missingAgentSignature = await postJson("/boards", body, { signed: true });
    const unregisteredAgent = await postJson("/boards", {
      ...body,
      board_id: "board-rogue",
      agent_id: "rogue-agent",
    }, { signed: true, agentSigned: true });

    expect(missingAgentSignature.status).toBe(401);
    expect((await jsonOf<{ error: string }>(missingAgentSignature)).error).toBe("Missing x-clawhouse-agent-public-key");
    expect(unregisteredAgent.status).toBe(403);
    expect((await jsonOf<{ error: string }>(unregisteredAgent)).error).toBe("Agent registration not found");
  });

  test("rejects board registration when a different agent key signs the binding", async () => {
    await registerAgent("ironclaw", agentWallet.publicKey);
    const attackerAgent = createWallet();
    const body = {
      board_id: "board-1",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
    };
    const response = await postJson("/boards", body, {
      signed: true,
      agentSigned: true,
      agentSigner: attackerAgent,
    });

    expect(response.status).toBe(401);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Agent public key does not match signed agent");
  });

  test("creator onboarding registers agent board and paper account with one signed request", async () => {
    const response = await postJson("/creator-onboarding/register", {
      board_id: "board-1",
      paper_account_id: "paper-board-1",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
      starting_balance_usd: 1000000,
      allowed_markets: ["DOGE"],
      status: "paused",
      public_status: "draft",
      visibility_mode: "private",
      metadata: {
        agent_name: "IronClaw",
        agent_description: "Public paper agent.",
        avatar_reference: "avatar-ref",
        trading_strategy: "Trade Hyperliquid paper markets.",
        untrusted_extra: "must-not-persist",
      },
    }, { admin: false, signed: true, agentSigned: true });
    const body = await jsonOf<{
      backend_registered: boolean;
      agent_id: string;
      board_id: string;
      paper_account_id: string;
    }>(response);
    const discoverable = await jsonOf<{ count: number }>(await app.fetch(new Request("http://ledger.test/boards")));
    const paper = await jsonOf<{ account: { id: string; status: string; starting_balance_usd: number; allowed_markets: unknown; metadata: Record<string, unknown> } }>(
      await app.fetch(new Request("http://ledger.test/paper/accounts/paper-board-1")),
    );
    const storedBoard = sqliteDb.raw.query<{ public_status: string; visibility_mode: string; metadata_json: string | null }, []>(
      "SELECT public_status, visibility_mode, metadata_json FROM boards WHERE id = 'board-1'",
    ).get();
    const boardMetadata = JSON.parse(storedBoard?.metadata_json ?? "{}");

    expect(response.status).toBe(201);
    expect(body.backend_registered).toBe(true);
    expect(body.agent_id).toBe("ironclaw");
    expect(body.board_id).toBe("board-1");
    expect(body.paper_account_id).toBe("paper-board-1");
    expect(discoverable.count).toBe(1);
    expect(storedBoard?.public_status).toBe("active");
    expect(storedBoard?.visibility_mode).toBe("public");
    expect(paper.account.id).toBe("paper-board-1");
    expect(paper.account.status).toBe("active");
    expect(paper.account.starting_balance_usd).toBe(10000);
    expect(paper.account.allowed_markets).toEqual({ scope: "hyperliquid_supported" });
    expect(paper.account.metadata).toEqual({
      agent_name: "IronClaw",
      agent_description: "Public paper agent.",
      avatar_reference: "avatar-ref",
      trading_strategy: "Trade Hyperliquid paper markets.",
    });
    expect(boardMetadata).toEqual(paper.account.metadata);
  });

  test("creator onboarding rejects a wallet address that is not a NEAR implicit account", async () => {
    const response = await postJson("/creator-onboarding/register", {
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: `${wallet.walletAddress}82`,
      public_key: wallet.publicKey,
      metadata: {
        agent_name: "IronClaw",
        agent_description: "Public paper agent.",
        avatar_reference: "avatar-ref",
        trading_strategy: "Trade Hyperliquid paper markets.",
      },
    }, { admin: false, signed: true, agentSigned: true });

    expect(response.status).toBe(400);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("wallet_address must be a 64-character lowercase NEAR implicit account");
    expect(countRows("agent_registrations")).toBe(0);
    expect(countRows("boards")).toBe(0);
    expect(countRows("paper_accounts")).toBe(0);
  });

  test("creator onboarding rejects a wallet address that does not match public key", async () => {
    const otherWallet = createWallet();
    const response = await postJson("/creator-onboarding/register", {
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: otherWallet.walletAddress,
      public_key: wallet.publicKey,
      metadata: {
        agent_name: "IronClaw",
        agent_description: "Public paper agent.",
        avatar_reference: "avatar-ref",
        trading_strategy: "Trade Hyperliquid paper markets.",
      },
    }, { admin: false, signed: true, agentSigned: true });

    expect(response.status).toBe(400);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("wallet_address must match public_key NEAR implicit account");
    expect(countRows("agent_registrations")).toBe(0);
    expect(countRows("boards")).toBe(0);
    expect(countRows("paper_accounts")).toBe(0);
  });

  test("creator onboarding rejects an existing agent id registered under a different public key", async () => {
    const first = await postJson("/creator-onboarding/register", {
      board_id: "board-1",
      paper_account_id: "paper-board-1",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
      metadata: {
        agent_name: "IronClaw",
        agent_description: "Public paper agent.",
        avatar_reference: "avatar-ref",
        trading_strategy: "Trade Hyperliquid paper markets.",
      },
    }, { admin: false, signed: true, agentSigned: true });
    const otherWallet = createWallet();
    const response = await postJson("/creator-onboarding/register", {
      board_id: "board-2",
      paper_account_id: "paper-board-2",
      agent_id: "ironclaw",
      agent_public_key: otherWallet.publicKey,
      wallet_address: otherWallet.walletAddress,
      public_key: otherWallet.publicKey,
      metadata: {
        agent_name: "IronClaw Copy",
        agent_description: "Public paper agent.",
        avatar_reference: "avatar-ref",
        trading_strategy: "Trade Hyperliquid paper markets.",
      },
    }, { admin: false, signed: true, signer: otherWallet, agentSigned: true, agentSigner: otherWallet });

    expect(first.status).toBe(201);
    expect(response.status).toBe(409);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Agent ID is already registered to a different public key");
    expect(countRows("agent_registrations")).toBe(1);
    expect(countRows("boards")).toBe(1);
    expect(countRows("paper_accounts")).toBe(1);
  });

  test("creator onboarding is idempotent for matching backend records", async () => {
    const body = {
      board_id: "board-1",
      paper_account_id: "paper-board-1",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
      metadata: {
        agent_name: "IronClaw",
        agent_description: "Public paper agent.",
        avatar_reference: "avatar-ref",
        trading_strategy: "Trade Hyperliquid paper markets.",
      },
    };
    const first = await postJson("/creator-onboarding/register", body, { admin: false, signed: true, agentSigned: true });
    const second = await postJson("/creator-onboarding/register", body, { admin: false, signed: true, agentSigned: true });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(countRows("agent_registrations")).toBe(1);
    expect(countRows("boards")).toBe(1);
    expect(countRows("paper_accounts")).toBe(1);
  });

  test("creator onboarding assigns and reads back board and paper account ids when omitted", async () => {
    const response = await postJson("/creator-onboarding/register", {
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
      metadata: {
        agent_name: "IronClaw",
        agent_description: "Public paper agent.",
        avatar_reference: "avatar-ref",
        trading_strategy: "Trade Hyperliquid paper markets.",
      },
    }, { admin: false, signed: true, agentSigned: true });
    const body = await jsonOf<{ board_id: string; paper_account_id: string }>(response);
    const byBoard = await jsonOf<{ paper_account_id: string; account: { id: string; board_id: string } }>(
      await app.fetch(new Request(`http://ledger.test/boards/${body.board_id}/paper-account`)),
    );

    expect(response.status).toBe(201);
    expect(body.board_id).toMatch(/^board_/);
    expect(body.paper_account_id).toMatch(/^paper_/);
    expect(byBoard.paper_account_id).toBe(body.paper_account_id);
    expect(byBoard.account.id).toBe(body.paper_account_id);
    expect(byBoard.account.board_id).toBe(body.board_id);
  });

  test("creator onboarding reuses existing board paper account instead of guessing requested id", async () => {
    await registerBoard({ board_id: "board-1", paper_starting_balance_usd: 10000 });
    const response = await postJson("/creator-onboarding/register", {
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
      metadata: {
        agent_name: "IronClaw",
        agent_description: "Public paper agent.",
        avatar_reference: "avatar-ref",
        trading_strategy: "Trade any Hyperliquid paper market.",
      },
    }, { admin: false, signed: true, agentSigned: true });
    const body = await jsonOf<{ paper_account_id: string; paperAccount: { allowed_markets: unknown; metadata: Record<string, unknown> } }>(response);
    const byBoard = await jsonOf<{ paper_account_id: string }>(
      await app.fetch(new Request("http://ledger.test/boards/board-1/paper-account")),
    );

    expect(response.status).toBe(201);
    expect(body.paper_account_id).toBe("paper-board-1");
    expect(byBoard.paper_account_id).toBe("paper-board-1");
    expect(body.paperAccount.allowed_markets).toEqual({ scope: "hyperliquid_supported" });
    expect(body.paperAccount.metadata.trading_strategy).toBe("Trade any Hyperliquid paper market.");
    expect(countRows("paper_accounts")).toBe(1);
  });

  test("creator onboarding rejects an existing board that is not public active", async () => {
    await registerAgent("ironclaw", agentWallet.publicKey);
    const existingBoard = await postJson("/boards", {
      board_id: "board-1",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
      public_status: "draft",
      visibility_mode: "private",
    }, { signed: true, agentSigned: true });
    const response = await postJson("/creator-onboarding/register", {
      board_id: "board-1",
      paper_account_id: "paper-board-1",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
      metadata: {
        agent_name: "IronClaw",
        agent_description: "Public paper agent.",
        avatar_reference: "avatar-ref",
        trading_strategy: "Trade Hyperliquid paper markets.",
      },
    }, { admin: false, signed: true, agentSigned: true });

    expect(existingBoard.status).toBe(201);
    expect(response.status).toBe(409);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Existing board public_status does not match registration");
    expect(countRows("paper_accounts")).toBe(0);
  });

  test("gates holder-only reads with a service-issued read token", async () => {
    await registerBoard({ visibility_mode: "holder_gated" });
    await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-private",
      tx_hash: "tx-private",
      reason: "Holder-only reason.",
    });

    const blocked = await app.fetch(new Request("http://ledger.test/boards/board-1/events"));
    const readToken = "holder-read-token";
    const grant = await postJson("/boards/board-1/read-access/checks", {
      requester_wallet_address: "holder.testnet",
      access_level: "key_holder_detail",
      access_result: "granted",
      read_token: readToken,
      expires_at: "2026-06-20T00:00:00.000Z",
    });
    const allowed = await app.fetch(new Request("http://ledger.test/boards/board-1/events", {
      headers: { "x-clawhouse-read-token": readToken },
    }));
    const allowedBody = await jsonOf<{ events: Array<Record<string, any>> }>(allowed);
    const storedGrant = sqliteDb.raw
      .query<Record<string, any>, []>("SELECT * FROM read_access_checks WHERE board_id = 'board-1'")
      .get();

    expect(blocked.status).toBe(403);
    expect((await jsonOf<{ error: string }>(blocked)).error).toBe("Read access required");
    expect(grant.status).toBe(201);
    expect(allowed.status).toBe(200);
    expect(allowedBody.events[0].reason).toBe("Holder-only reason.");
    expect(storedGrant?.metadata_json).toContain(sha256Hex(readToken));
    expect(storedGrant?.metadata_json).not.toContain(readToken);
  });

  test("gates holder-only board summaries and rejects expired read tokens", async () => {
    await registerBoard({ visibility_mode: "holder_gated" });
    const readToken = "expired-holder-read-token";
    const grant = await postJson("/boards/board-1/read-access/checks", {
      requester_wallet_address: "holder.testnet",
      access_level: "key_holder_detail",
      access_result: "granted",
      read_token: readToken,
      expires_at: "2026-06-18T00:00:00.000Z",
    });
    const blockedWithoutToken = await app.fetch(new Request("http://ledger.test/boards/board-1"));
    const blockedExpiredToken = await app.fetch(new Request("http://ledger.test/boards/board-1", {
      headers: { "x-clawhouse-read-token": readToken },
    }));

    expect(grant.status).toBe(201);
    expect(blockedWithoutToken.status).toBe(403);
    expect((await jsonOf<{ error: string }>(blockedWithoutToken)).error).toBe("Read access required");
    expect(blockedExpiredToken.status).toBe(403);
    expect((await jsonOf<{ error: string }>(blockedExpiredToken)).error).toBe("Read access denied");
  });

  test("rejects invalid read access expiration timestamps", async () => {
    await registerBoard({ visibility_mode: "holder_gated" });

    const response = await postJson("/boards/board-1/read-access/checks", {
      requester_wallet_address: "holder.testnet",
      access_level: "key_holder_detail",
      access_result: "granted",
      read_token: "holder-read-token",
      expires_at: "not-a-date",
    });

    expect(response.status).toBe(400);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Invalid expires_at");
  });

  test("rejects granted holder read tokens with excessive expiration windows", async () => {
    await registerBoard({ visibility_mode: "holder_gated" });

    const response = await postJson("/boards/board-1/read-access/checks", {
      requester_wallet_address: "holder.testnet",
      access_level: "key_holder_detail",
      access_result: "granted",
      read_token: "long-lived-holder-read-token",
      expires_at: "2026-06-21T00:00:00.001Z",
    });

    expect(response.status).toBe(400);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("expires_at cannot exceed 24 hours for granted non-public read access");
  });

  test("defaults granted holder read tokens to a short expiration", async () => {
    await registerBoard({ visibility_mode: "holder_gated" });

    const grant = await jsonOf<{ check: Record<string, any> }>(
      await postJson("/boards/board-1/read-access/checks", {
        requester_wallet_address: "holder.testnet",
        access_level: "key_holder_detail",
        access_result: "granted",
        read_token: "default-ttl-holder-read-token",
      }),
    );

    expect(grant.check.metadata.expires_at).toBe("2026-06-19T00:10:00.000Z");
  });

  test("does not drop valid read tokens behind newer grants", async () => {
    await registerBoard({ visibility_mode: "holder_gated" });
    await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-private",
      reason: "Older grant should still read this.",
    });

    const readToken = "older-still-valid-token";
    const originalGrant = await postJson("/boards/board-1/read-access/checks", {
      requester_wallet_address: "early-holder.testnet",
      access_level: "key_holder_detail",
      access_result: "granted",
      read_token: readToken,
      expires_at: "2026-06-20T00:00:00.000Z",
    });
    expect(originalGrant.status).toBe(201);

    for (let index = 1; index <= 51; index += 1) {
      currentNow = new Date(`2026-06-19T00:${String(index).padStart(2, "0")}:00.000Z`);
      const grant = await postJson("/boards/board-1/read-access/checks", {
        requester_wallet_address: `newer-holder-${index}.testnet`,
        access_level: "key_holder_detail",
        access_result: "granted",
        read_token: `newer-token-${index}`,
        expires_at: "2026-06-20T00:00:00.000Z",
      });
      expect(grant.status).toBe(201);
    }

    currentNow = new Date("2026-06-19T00:52:00.000Z");
    const allowed = await app.fetch(new Request("http://ledger.test/boards/board-1/events", {
      headers: { "x-clawhouse-read-token": readToken },
    }));
    const allowedBody = await jsonOf<{ events: Array<Record<string, any>> }>(allowed);

    expect(allowed.status).toBe(200);
    expect(allowedBody.events[0].reason).toBe("Older grant should still read this.");
  });

  test("accepts a wallet-signed event and records transaction identifiers", async () => {
    await registerBoard();

    const response = await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-1",
      tx_hash: "tx-1",
      intent_id: "intent-1",
      status_claim: "filled",
      asset_in: "USDC",
      amount_in: 25,
      asset_out: "NEAR",
      amount_out: 10,
      reason: "Momentum improved after US session open.",
      metadata: { venue: "near-intents" },
    });
    const body = await jsonOf<{ event: Record<string, any> }>(response);

    expect(response.status).toBe(201);
    expect(body.event.tx_hash).toBe("tx-1");
    expect(body.event.intent_id).toBe("intent-1");
    expect(body.event.reported_at).toBe("2026-06-19T00:00:00.000Z");
    expect(body.event.reason).toContain("Momentum");
    expect(body.event.metadata).toEqual({ venue: "near-intents" });
  });

  test("persists the signed body hash for write audit", async () => {
    await registerBoard();
    const signed = signRequest("POST", "/boards/board-1/events", {
      client_event_id: "client-audit",
      tx_hash: "tx-audit",
    });

    const response = await app.fetch(new Request("http://ledger.test/boards/board-1/events", {
      method: "POST",
      headers: signed.headers,
      body: signed.rawBody,
    }));
    const nonce = sqliteDb.raw
      .query<{ body_hash: string | null }, [string]>("SELECT body_hash FROM auth_nonces WHERE nonce = ?")
      .get(signed.headers["x-clawhouse-nonce"]);

    expect(response.status).toBe(201);
    expect(nonce?.body_hash).toBe(sha256Hex(signed.rawBody));
  });

  test("rejects negative event amounts", async () => {
    await registerBoard();

    const response = await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-negative",
      tx_hash: "tx-negative",
      amount_in: -1,
    });

    expect(response.status).toBe(400);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("amount_in must be greater than or equal to 0");
  });

  test("rejects body tampering after signing", async () => {
    await registerBoard();
    const signed = signRequest("POST", "/boards/board-1/events", {
      client_event_id: "client-1",
      tx_hash: "tx-1",
    });

    const response = await app.fetch(new Request(`http://ledger.test/boards/board-1/events`, {
      method: "POST",
      headers: signed.headers,
      body: JSON.stringify({ client_event_id: "client-1", tx_hash: "tx-tampered" }),
    }));
    const body = await jsonOf<{ error: string }>(response);

    expect(response.status).toBe(401);
    expect(body.error).toBe("Body hash mismatch");
  });

  test("rejects nonce replay", async () => {
    await registerBoard();
    const signed = signRequest("POST", "/boards/board-1/events", {
      client_event_id: "client-1",
      tx_hash: "tx-1",
    });

    const first = await app.fetch(new Request(`http://ledger.test/boards/board-1/events`, {
      method: "POST",
      headers: signed.headers,
      body: signed.rawBody,
    }));
    const second = await app.fetch(new Request(`http://ledger.test/boards/board-1/events`, {
      method: "POST",
      headers: signed.headers,
      body: signed.rawBody,
    }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(401);
    expect((await jsonOf<{ error: string }>(second)).error).toBe("Nonce replay rejected");
  });

  test("rejects stale signed requests", async () => {
    await registerBoard();
    const staleTimestamp = String(currentNow.getTime() - 6 * 60 * 1000);
    const response = await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-stale",
      tx_hash: "tx-stale",
    }, wallet, { timestamp: staleTimestamp });

    expect(response.status).toBe(401);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Signature timestamp is stale");
  });

  test("rejects events from an unbound wallet", async () => {
    await registerBoard();
    const otherWallet = createWallet();
    const response = await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-1",
      tx_hash: "tx-1",
    }, otherWallet);

    expect(response.status).toBe(401);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Wallet is not bound to board");
  });

  test("appends signed event attachments without mutating the original event", async () => {
    await registerBoard();
    const eventResponse = await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-1",
      tx_hash: "tx-1",
      reason: "Initial reason.",
    });
    const eventId = (await jsonOf<{ event: { id: string } }>(eventResponse)).event.id;

    const attachmentResponse = await signedFetch("POST", `/boards/board-1/events/${eventId}/attachments`, {
      attachment_type: "correction",
      reason: "The first explanation missed liquidity depth.",
      metadata: { confidence: "medium" },
    });
    const eventsResponse = await serviceGet("/boards/board-1/events");
    const eventsBody = await jsonOf<{ events: Array<Record<string, any>> }>(eventsResponse);

    expect(attachmentResponse.status).toBe(201);
    expect(eventsBody.events).toHaveLength(1);
    expect(eventsBody.events[0].reason).toBe("Initial reason.");
    expect(eventsBody.events[0].attachments[0].attachment_type).toBe("correction");
  });

  test("accepts summary and operator note attachment types", async () => {
    await registerBoard();
    const eventResponse = await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-summary",
      tx_hash: "tx-summary",
      reason: "Initial reason.",
    });
    const eventId = (await jsonOf<{ event: { id: string } }>(eventResponse)).event.id;

    const summary = await signedFetch("POST", `/boards/board-1/events/${eventId}/attachments`, {
      attachment_type: "summary",
      reason: "Final summary.",
    });
    const operatorNote = await signedFetch("POST", `/boards/board-1/events/${eventId}/attachments`, {
      attachment_type: "operator_note",
      reason: "Operator checked the event.",
    });

    expect(summary.status).toBe(201);
    expect(operatorNote.status).toBe(201);
  });

  test("merges repeated transaction identifiers into the same event timeline", async () => {
    await registerBoard();

    const first = await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-merge",
      tx_hash: "tx-merge",
      reason: "First report.",
    });
    const second = await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-merge",
      tx_hash: "tx-merge",
      reason: "Duplicate report should not fork the timeline.",
    });
    const secondBody = await jsonOf<{ merged: boolean }>(second);
    const eventsBody = await jsonOf<{ events: Array<Record<string, any>> }>(
      await serviceGet("/boards/board-1/events"),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(secondBody.merged).toBe(true);
    expect(eventsBody.events).toHaveLength(1);
    expect(eventsBody.events[0].reason).toBe("First report.");
  });

  test("database enforces one event per transaction identifier per board", async () => {
    await registerBoard();
    const insertRawEvent = (id: string, clientEventId: string | null, txHash: string | null, intentId: string | null) => {
      sqliteDb.raw.query(
        `INSERT INTO events
          (id, board_id, agent_id, wallet_address, event_type, client_event_id, tx_hash, intent_id, created_at)
          VALUES (?, 'board-1', 'ironclaw', ?, 'agent_reported', ?, ?, ?, ?)`,
      ).run(id, wallet.walletAddress, clientEventId, txHash, intentId, currentNow.toISOString());
    };

    insertRawEvent("evt-db-client-source", "client-db", null, null);
    expect(() => insertRawEvent("evt-db-client-duplicate", "client-db", null, null)).toThrow(/UNIQUE constraint failed/);

    insertRawEvent("evt-db-tx-source", "client-db-tx-a", "tx-db", null);
    expect(() => insertRawEvent("evt-db-tx-duplicate", "client-db-tx-b", "tx-db", null)).toThrow(/UNIQUE constraint failed/);

    insertRawEvent("evt-db-intent-source", "client-db-intent-a", null, "intent-db");
    expect(() => insertRawEvent("evt-db-intent-duplicate", "client-db-intent-b", null, "intent-db")).toThrow(/UNIQUE constraint failed/);
  });

  test("cron discovers unreported observations and creates a reasonless timeline event", async () => {
    await registerBoard();
    await insertObservationFixture("board-1", {
      wallet_address: wallet.walletAddress,
      current_value_usd: 110,
      tx_hash: "tx-observed",
      status_claim: "observed_on_wallet",
      asset_in: "USDC",
      amount_in: 10,
      asset_out: "NEAR",
      amount_out: 4,
    });

    const tickResponse = await postJson("/cron/tick", {});
    const tickBody = await jsonOf<{ discoveredEvents: number }>(tickResponse);
    const eventsBody = await jsonOf<{ events: Array<Record<string, any>> }>(
      await serviceGet("/boards/board-1/events"),
    );

    expect(tickBody.discoveredEvents).toBe(1);
    expect(eventsBody.events).toHaveLength(1);
    expect(eventsBody.events[0].event_type).toBe("discovered_without_reason");
    expect(eventsBody.events[0].reason).toBeNull();
    expect(eventsBody.events[0].reported_at).toBeNull();

    migrate(sqliteDb.raw);
    const eventAfterMigration = sqliteDb.raw
      .query<Record<string, any>, []>("SELECT * FROM events WHERE board_id = 'board-1'")
      .get();
    expect(eventAfterMigration?.reported_at).toBeNull();
  });

  test("cron links observations to already reported events without counting a new discovery", async () => {
    await registerBoard();
    await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-observed",
      tx_hash: "tx-observed",
      reason: "Agent already reported this trade.",
    });
    await insertObservationFixture("board-1", {
      wallet_address: wallet.walletAddress,
      current_value_usd: 112,
      client_event_id: "client-observed",
      tx_hash: "tx-observed",
    });

    const tickBody = await jsonOf<{ discoveredEvents: number; linkedObservations: number }>(
      await postJson("/cron/tick", {}),
    );
    const eventsBody = await jsonOf<{ events: Array<Record<string, any>> }>(
      await serviceGet("/boards/board-1/events"),
    );

    expect(tickBody.discoveredEvents).toBe(0);
    expect(tickBody.linkedObservations).toBe(1);
    expect(eventsBody.events).toHaveLength(1);
    expect(eventsBody.events[0].reason).toBe("Agent already reported this trade.");
  });

  test("pnl excludes topups and adds withdrawals back", async () => {
    await registerBoard();
    await insertObservationFixture("board-1", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:00:00.000Z",
      current_value_usd: 120,
      topup_usd: 20,
    });
    await insertObservationFixture("board-1", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:01:00.000Z",
      current_value_usd: 130,
      withdrawal_usd: 5,
    });

    await postJson("/cron/tick", {});
    const pnlBody = await jsonOf<{ latest: Record<string, number> }>(
      await serviceGet("/boards/board-1/pnl"),
    );
    const portfolioBody = await jsonOf<{ latest: Record<string, number> }>(
      await serviceGet("/boards/board-1/portfolio"),
    );

    expect(pnlBody.latest.current_value_usd).toBe(130);
    expect(pnlBody.latest.net_topups_usd).toBe(20);
    expect(pnlBody.latest.net_withdrawals_usd).toBe(5);
    expect(pnlBody.latest.pnl_usd).toBe(15);
    expect((pnlBody.latest as Record<string, any>).completeness_status).toBe("missing_balance_changes");
    expect(portfolioBody.latest.current_value_usd).toBe(130);
  });

  test("records balance changes and prices and links them into PnL snapshots", async () => {
    await registerBoard();
    const priceBody = await jsonOf<{ prices: Array<Record<string, any>> }>(
      await postJson("/boards/board-1/prices", {
        asset_id: "native:near",
        asset_symbol: "NEAR",
        price_usd: 2,
        price_source: "test-price",
        observed_at: "2026-06-19T00:00:00.000Z",
      }),
    );
    const observationBody = await jsonOf<{ observation: Record<string, any> }>(
      await insertObservationFixture("board-1", {
        wallet_address: wallet.walletAddress,
        observed_at: "2026-06-19T00:00:00.000Z",
        current_value_usd: 110,
        tx_hash: "tx-priced",
      }),
    );
    await insertBalanceChangeFixture("board-1", {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      normalized_amount: 55,
      delta_amount: 5,
      delta_value_usd: 10,
      change_type: "trade",
      source_observation_id: observationBody.observation.id,
    });

    await postJson("/cron/tick", {});
    const pnlBody = await jsonOf<{ latest: Record<string, any> }>(
      await serviceGet("/boards/board-1/pnl"),
    );
    const changesBody = await jsonOf<{ balance_changes: Array<Record<string, any>> }>(
      await serviceGet("/boards/board-1/balance-changes"),
    );

    expect(pnlBody.latest.price_snapshot_id).toBe(priceBody.prices[0].id);
    expect(pnlBody.latest.staleness_status).toBe("fresh");
    expect(pnlBody.latest.completeness_status).toBe("complete");
    expect(changesBody.balance_changes[0].source_observation_id).toBe(observationBody.observation.id);
  });

  test("uses reconciled balance changes instead of caller supplied observation value for PnL", async () => {
    await registerBoard();
    await postJson("/boards/board-1/prices", {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      price_usd: 2,
      price_source: "test-price",
      observed_at: "2026-06-19T00:00:00.000Z",
    });
    const observationBody = await jsonOf<{ observation: Record<string, any> }>(
      await insertObservationFixture("board-1", {
        wallet_address: wallet.walletAddress,
        observed_at: "2026-06-19T00:00:00.000Z",
        current_value_usd: 999,
        tx_hash: "tx-reconciled",
      }),
    );
    await insertBalanceChangeFixture("board-1", {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      normalized_amount: 55,
      delta_amount: 5,
      change_type: "trade",
      source_observation_id: observationBody.observation.id,
    });

    await postJson("/cron/tick", {});
    const pnlBody = await jsonOf<{ latest: Record<string, any> }>(
      await serviceGet("/boards/board-1/pnl"),
    );
    const portfolioBody = await jsonOf<{ latest: Record<string, any> }>(
      await serviceGet("/boards/board-1/portfolio"),
    );

    expect(pnlBody.latest.current_value_usd).toBe(110);
    expect(pnlBody.latest.pnl_usd).toBe(10);
    expect(pnlBody.latest.completeness_status).toBe("complete");
    expect(portfolioBody.latest.current_value_usd).toBe(110);
  });

  test("watches a NEAR account through RPC and turns the balance into observation evidence", async () => {
    const seenRpcBodies: Array<Record<string, any>> = [];
    currentRpcFetch = async (_input, init) => {
      seenRpcBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: "clawhouse-agent-board-ledger",
        result: {
          amount: "200000000000000000000000000",
          locked: "0",
          block_hash: "near-block",
          block_height: 123,
          storage_usage: 456,
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    await registerBoard();

    const watchBody = await jsonOf<{ observation: Record<string, any>; balance_change: Record<string, any>; price: Record<string, any> }>(
      await postJson("/boards/board-1/watch/near-account", {
        rpc_url: "https://rpc.testnet.near.org",
        price_usd: 0.5,
        price_source: "test-near-price",
        tx_hash: "near-rpc-watch-tx",
      }),
    );
    await postJson("/cron/tick", {});
    const pnlBody = await jsonOf<{ latest: Record<string, any> }>(
      await serviceGet("/boards/board-1/pnl"),
    );
    const rpcBody = seenRpcBodies[0];

    expect(rpcBody?.method).toBe("query");
    expect(rpcBody?.params.request_type).toBe("view_account");
    expect(rpcBody?.params.account_id).toBe(wallet.walletAddress);
    expect(watchBody.observation.current_value_usd).toBe(100);
    expect(watchBody.balance_change.normalized_amount).toBe(200);
    expect(watchBody.price.asset_id).toBe("native:near");
    expect(pnlBody.latest.pnl_usd).toBe(0);
    expect(pnlBody.latest.price_snapshot_id).toBe(watchBody.price.id);
    expect(pnlBody.latest.completeness_status).toBe("complete");
  });

  test("cron watches active tracked NEAR accounts when RPC env is configured", async () => {
    const seenRpcBodies: Array<Record<string, any>> = [];
    currentRpcFetch = async (_input, init) => {
      const rpcBody = JSON.parse(String(init?.body));
      seenRpcBodies.push(rpcBody);
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: "clawhouse-agent-board-ledger",
        result: {
          amount: "150000000000000000000000000",
          locked: "0",
          block_hash: "near-cron-block",
          block_height: 456,
          storage_usage: 789,
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    app = createApp({
      db: sqliteDb,
      now: () => currentNow,
      adminToken,
      rpcFetch: (...args) => currentRpcFetch(...args),
      env: { AGENT_BOARD_LEDGER_NEAR_RPC_URL: "https://rpc.testnet.near.org" },
    });
    await registerBoard();

    const tickBody = await jsonOf<{
      status: string;
      nearAccountWatch: { status: string; attempted: number; checked: number; failed: number };
      summary: Record<string, number | boolean | string>;
    }>(await postJson("/cron/tick", {}));
    const changesBody = await jsonOf<{ balance_changes: Array<Record<string, any>> }>(
      await serviceGet("/boards/board-1/balance-changes"),
    );

    expect(tickBody.status).toBe("updated");
    expect(tickBody.nearAccountWatch).toMatchObject({
      status: "checked",
      attempted: 1,
      checked: 1,
      failed: 0,
    });
    expect(tickBody.summary.nearAccountWatchesChecked).toBe(1);
    expect(seenRpcBodies).toHaveLength(1);
    expect(seenRpcBodies[0]?.params.request_type).toBe("view_account");
    expect(seenRpcBodies[0]?.params.account_id).toBe(wallet.walletAddress);
    expect(changesBody.balance_changes).toHaveLength(1);
    expect(changesBody.balance_changes[0].asset_id).toBe("native:near");
    expect(changesBody.balance_changes[0].normalized_amount).toBe(150);
    expect(changesBody.balance_changes[0].visibility_status).toBe("missing_price");
    expect(countRows("observations")).toBe(0);
    expect(countRows("balance_changes")).toBe(1);
  });

  test("watches a NEAR fungible token through RPC and records priced PnL evidence", async () => {
    const seenRpcBodies: Array<Record<string, any>> = [];
    currentRpcFetch = async (_input, init) => {
      const rpcBody = JSON.parse(String(init?.body));
      seenRpcBodies.push(rpcBody);
      if (rpcBody.params.method_name === "ft_metadata") {
        return nearViewResponse({
          spec: "ft-1.0.0",
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
        });
      }
      if (rpcBody.params.method_name === "ft_balance_of") {
        return nearViewResponse("123450000");
      }
      return nearRpcError("Method not mocked");
    };
    await registerBoard();

    const watchBody = await jsonOf<{ observation: Record<string, any>; balance_change: Record<string, any>; price: Record<string, any> }>(
      await postJson("/boards/board-1/watch/near-ft", {
        rpc_url: "https://rpc.testnet.near.org",
        token_contract_id: "usdc.testnet",
        price_usd: 1,
        price_source: "test-usdc-price",
        tx_hash: "near-ft-watch-tx",
      }),
    );
    await postJson("/cron/tick", {});
    const pnlBody = await jsonOf<{ latest: Record<string, any> }>(
      await serviceGet("/boards/board-1/pnl"),
    );

    expect(seenRpcBodies.map((body) => body.params.method_name)).toEqual(["ft_metadata", "ft_balance_of"]);
    expect(seenRpcBodies[1]?.params.request_type).toBe("call_function");
    expect(seenRpcBodies[1]?.params.account_id).toBe("usdc.testnet");
    expect(seenRpcBodies[1]?.params.args_base64).toBe(Buffer.from(JSON.stringify({ account_id: wallet.walletAddress })).toString("base64"));
    expect(watchBody.observation.current_value_usd).toBe(123.45);
    expect(watchBody.balance_change.asset_id).toBe("ft:usdc.testnet");
    expect(watchBody.balance_change.asset_symbol).toBe("USDC");
    expect(watchBody.balance_change.normalized_amount).toBe(123.45);
    expect(watchBody.price.asset_id).toBe("ft:usdc.testnet");
    expect(pnlBody.latest.pnl_usd).toBeCloseTo(23.45);
    expect(pnlBody.latest.price_snapshot_id).toBe(watchBody.price.id);
    expect(pnlBody.latest.completeness_status).toBe("complete");
  });

  test("checks the NEAR key-market holder balance before issuing a read token", async () => {
    const seenRpcBodies: Array<Record<string, any>> = [];
    currentRpcFetch = async (_input, init) => {
      const rpcBody = JSON.parse(String(init?.body));
      seenRpcBodies.push(rpcBody);
      expect(rpcBody.params.method_name).toBe("get_balance");
      return nearViewResponse("2");
    };
    await registerBoard({ visibility_mode: "holder_gated" });
    await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-key-holder",
      tx_hash: "tx-key-holder",
      reason: "Holder-gated reason.",
    });

    const readToken = "holder-key-read-token";
    const checkBody = await jsonOf<{ access_result: string; holder_key_balance: string }>(
      await postJson("/boards/board-1/read-access/near-key-market", {
        rpc_url: "https://rpc.testnet.near.org",
        key_contract_id: "clawhouse-key.testnet",
        holder_account_id: "holder.testnet",
        read_token: readToken,
        expires_at: "2026-06-20T00:00:00.000Z",
      }),
    );
    const allowed = await app.fetch(new Request("http://ledger.test/boards/board-1/events", {
      headers: { "x-clawhouse-read-token": readToken },
    }));
    const allowedBody = await jsonOf<{ events: Array<Record<string, any>> }>(allowed);
    const rpcArgs = JSON.parse(Buffer.from(String(seenRpcBodies[0]?.params.args_base64), "base64").toString("utf8"));

    expect(checkBody.access_result).toBe("granted");
    expect(checkBody.holder_key_balance).toBe("2");
    expect(rpcArgs).toEqual({ agent_id: "ironclaw", account_id: "holder.testnet" });
    expect(seenRpcBodies).toHaveLength(2);
    expect(allowed.status).toBe(200);
    expect(allowedBody.events[0].reason).toBe("Holder-gated reason.");
  });

  test("rejects NEAR key-market read access when body agent_id does not match the board", async () => {
    currentRpcFetch = async () => nearViewResponse("2");
    await registerBoard({ visibility_mode: "holder_gated" });

    const response = await postJson("/boards/board-1/read-access/near-key-market", {
      rpc_url: "https://rpc.testnet.near.org",
      key_contract_id: "clawhouse-key.testnet",
      holder_account_id: "holder.testnet",
      agent_id: "different-agent",
      read_token: "wrong-agent-token",
    });

    expect(response.status).toBe(400);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("agent_id must match board agent_id");
  });

  test("rechecks NEAR key-market holder balance before each holder-gated read", async () => {
    let responseValue: unknown = "1";
    currentRpcFetch = async () => nearViewResponse(responseValue);
    await registerBoard({ visibility_mode: "holder_gated" });
    await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-live-key-holder",
      tx_hash: "tx-live-key-holder",
      reason: "Only current holders should see this.",
    });

    const readToken = "live-holder-key-read-token";
    const check = await jsonOf<{ access_result: string }>(
      await postJson("/boards/board-1/read-access/near-key-market", {
        rpc_url: "https://rpc.testnet.near.org",
        key_contract_id: "clawhouse-key.testnet",
        holder_account_id: "holder.testnet",
        read_token: readToken,
      }),
    );
    responseValue = "0";
    const deniedAfterSale = await app.fetch(new Request("http://ledger.test/boards/board-1/events", {
      headers: { "x-clawhouse-read-token": readToken },
    }));

    expect(check.access_result).toBe("granted");
    expect(deniedAfterSale.status).toBe(403);
    expect((await jsonOf<{ error: string }>(deniedAfterSale)).error).toBe("Read access denied");
  });

  test("denies NEAR key-market read access when holder balance is zero or null", async () => {
    let responseValue: unknown = "0";
    currentRpcFetch = async () => nearViewResponse(responseValue);
    await registerBoard({ visibility_mode: "holder_gated" });

    const zeroBalance = await jsonOf<{ access_result: string; holder_key_balance: string }>(
      await postJson("/boards/board-1/read-access/near-key-market", {
        rpc_url: "https://rpc.testnet.near.org",
        key_contract_id: "clawhouse-key.testnet",
        holder_account_id: "holder.testnet",
        read_token: "should-not-grant",
      }),
    );
    responseValue = null;
    const nullBalance = await jsonOf<{ access_result: string; holder_key_balance: string }>(
      await postJson("/boards/board-1/read-access/near-key-market", {
        rpc_url: "https://rpc.testnet.near.org",
        key_contract_id: "clawhouse-key.testnet",
        holder_account_id: "unknown-holder.testnet",
        read_token: "should-not-grant-null",
      }),
    );

    expect(zeroBalance.access_result).toBe("denied");
    expect(zeroBalance.holder_key_balance).toBe("0");
    expect(nullBalance.access_result).toBe("denied");
    expect(nullBalance.holder_key_balance).toBe("0");
  });

  test("rejects long-lived NEAR key-market holder read token grants", async () => {
    currentRpcFetch = async () => nearViewResponse("1");
    await registerBoard({ visibility_mode: "holder_gated" });

    const response = await postJson("/boards/board-1/read-access/near-key-market", {
      rpc_url: "https://rpc.testnet.near.org",
      key_contract_id: "clawhouse-key.testnet",
      holder_account_id: "holder.testnet",
      read_token: "long-lived-key-holder-token",
      expires_at: "2026-06-21T00:00:00.001Z",
    });

    expect(response.status).toBe(400);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("expires_at cannot exceed 24 hours for granted non-public read access");
  });

  test("marks fully priced periodic balance snapshots complete without a transaction id", async () => {
    await registerBoard();
    const observationBody = await jsonOf<{ observation: Record<string, any> }>(
      await insertObservationFixture("board-1", {
        wallet_address: wallet.walletAddress,
        observed_at: "2026-06-19T00:00:00.000Z",
        current_value_usd: 100,
        status_claim: "observed_on_near_rpc",
      }),
    );
    const priceBody = await jsonOf<{ prices: Array<Record<string, any>> }>(
      await postJson("/boards/board-1/prices", {
        asset_id: "native:near",
        asset_symbol: "NEAR",
        price_usd: 1,
        price_source: "test-price",
        observed_at: observationBody.observation.observed_at,
      }),
    );
    await insertBalanceChangeFixture("board-1", {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      normalized_amount: 100,
      change_type: "periodic_balance",
      source_observation_id: observationBody.observation.id,
    });

    await postJson("/cron/tick", {});
    const pnlBody = await jsonOf<{ latest: Record<string, any> }>(
      await serviceGet("/boards/board-1/pnl"),
    );

    expect(pnlBody.latest.price_snapshot_id).toBe(priceBody.prices[0].id);
    expect(pnlBody.latest.completeness_status).toBe("complete");
  });

  test("appends an investigation when an agent success claim has no wallet balance change", async () => {
    await registerBoard();
    await signedFetch("POST", "/boards/board-1/events", {
      tx_hash: "tx-conflict",
      status_claim: "filled",
      reason: "Agent claimed the swap filled.",
    });
    const observationBody = await jsonOf<{ observation: Record<string, any> }>(
      await insertObservationFixture("board-1", {
        wallet_address: wallet.walletAddress,
        observed_at: "2026-06-19T00:00:00.000Z",
        current_value_usd: 100,
        tx_hash: "tx-conflict",
        status_claim: "filled",
      }),
    );
    await insertBalanceChangeFixture("board-1", {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      normalized_amount: 100,
      delta_amount: 0,
      change_type: "no_change",
      source_observation_id: observationBody.observation.id,
    });

    await postJson("/cron/tick", {});
    const eventsBody = await jsonOf<{ events: Array<Record<string, any>> }>(
      await serviceGet("/boards/board-1/events"),
    );

    expect(eventsBody.events[0].reason).toBe("Agent claimed the swap filled.");
    expect(eventsBody.events[0].attachments[0].attachment_type).toBe("investigation");
    expect(eventsBody.events[0].attachments[0].metadata.conflict_type).toBe("success_claim_without_balance_change");
  });

  test("appends an investigation when an agent failure claim has a material wallet balance change", async () => {
    await registerBoard();
    await signedFetch("POST", "/boards/board-1/events", {
      tx_hash: "tx-failed-conflict",
      status_claim: "failed",
      reason: "Agent claimed the swap failed.",
    });
    const observationBody = await jsonOf<{ observation: Record<string, any> }>(
      await insertObservationFixture("board-1", {
        wallet_address: wallet.walletAddress,
        observed_at: "2026-06-19T00:00:00.000Z",
        current_value_usd: 105,
        tx_hash: "tx-failed-conflict",
      }),
    );
    await insertBalanceChangeFixture("board-1", {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      normalized_amount: 52.5,
      delta_amount: 2.5,
      delta_value_usd: 5,
      change_type: "trade",
      source_observation_id: observationBody.observation.id,
    });

    const tickBody = await jsonOf<{ statusConflicts: Array<Record<string, any>>; summary: Record<string, number> }>(
      await postJson("/cron/tick", {}),
    );
    const eventsBody = await jsonOf<{ events: Array<Record<string, any>> }>(
      await serviceGet("/boards/board-1/events"),
    );

    expect(tickBody.summary.statusConflicts).toBe(1);
    expect(tickBody.statusConflicts[0].conflict_type).toBe("failure_claim_with_balance_change");
    expect(eventsBody.events[0].attachments[0].metadata.conflict_type).toBe("failure_claim_with_balance_change");
  });

  test("cron does not duplicate snapshots when the latest observation was already snapshotted", async () => {
    await registerBoard();
    await insertObservationFixture("board-1", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:00:00.000Z",
      current_value_usd: 108,
      tx_hash: "tx-idempotent",
    });

    const firstTick = await jsonOf<{
      status: string;
      snapshots: Array<Record<string, any>>;
      summary: Record<string, number | boolean>;
    }>(await postJson("/cron/tick", {}));
    const secondTick = await jsonOf<{
      status: string;
      snapshots: Array<Record<string, any>>;
      alreadySnapshotted: Array<Record<string, any>>;
      summary: Record<string, number | boolean>;
    }>(await postJson("/cron/tick", {}));
    const pnlBody = await jsonOf<{ latest: Record<string, any> }>(
      await serviceGet("/boards/board-1/pnl"),
    );

    expect(firstTick.status).toBe("updated");
    expect(firstTick.snapshots).toHaveLength(1);
    expect(typeof firstTick.snapshots[0].source_observation_id).toBe("string");
    expect(firstTick.snapshots[0].holding_snapshot_id).toBe(pnlBody.latest.holding_snapshot_id);
    expect(firstTick.snapshots[0].total_pnl_pct).toBeCloseTo(0.08);
    expect(firstTick.snapshots[0].observed_trade_count).toBe(1);
    expect(firstTick.snapshots[0].reason_missing_count).toBe(1);
    expect(firstTick.snapshots[0].completeness_status).toBe("missing_balance_changes");
    expect(secondTick.status).toBe("no_new_data");
    expect(secondTick.snapshots).toHaveLength(0);
    expect(secondTick.alreadySnapshotted).toHaveLength(1);
    expect(secondTick.alreadySnapshotted[0].pnl_snapshot_id).toBe(pnlBody.latest.id);
    expect(secondTick.summary.snapshotsCreated).toBe(0);
    expect(secondTick.summary.snapshotsSkippedAlreadyCurrent).toBe(1);
    expect(countRows("holding_snapshots")).toBe(1);
    expect(countRows("pnl_snapshots")).toBe(1);
  });

  test("cron links duplicate observed transaction rows to one discovered event", async () => {
    await registerBoard();
    await insertObservationFixture("board-1", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:00:00.000Z",
      current_value_usd: 104,
      tx_hash: "tx-duplicate-observed",
    });
    await insertObservationFixture("board-1", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:01:00.000Z",
      current_value_usd: 109,
      tx_hash: "tx-duplicate-observed",
    });

    const tickBody = await jsonOf<{
      discoveredEvents: number;
      linkedObservations: number;
      summary: Record<string, number | boolean>;
    }>(await postJson("/cron/tick", {}));
    const eventsBody = await jsonOf<{ events: Array<Record<string, any>> }>(
      await serviceGet("/boards/board-1/events"),
    );

    expect(tickBody.discoveredEvents).toBe(1);
    expect(tickBody.linkedObservations).toBe(2);
    expect(tickBody.summary.snapshotsCreated).toBe(1);
    expect(eventsBody.events).toHaveLength(1);
    expect(eventsBody.events[0].tx_hash).toBe("tx-duplicate-observed");
    expect(countRows("observations")).toBe(2);
    expect(countRows("holding_snapshots")).toBe(1);
    expect(countRows("pnl_snapshots")).toBe(1);
  });

  test("cron carries high-water mark and drawdown across multiple snapshots", async () => {
    await registerBoard();
    await insertObservationFixture("board-1", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:00:00.000Z",
      current_value_usd: 130,
      tx_hash: "tx-peak",
    });
    await postJson("/cron/tick", {});

    currentNow = new Date("2026-06-19T00:02:00.000Z");
    await insertObservationFixture("board-1", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:02:00.000Z",
      current_value_usd: 110,
      tx_hash: "tx-drawdown",
    });

    const tickBody = await jsonOf<{ snapshots: Array<Record<string, any>> }>(
      await postJson("/cron/tick", {}),
    );
    const pnlBody = await jsonOf<{ latest: Record<string, any> }>(
      await serviceGet("/boards/board-1/pnl"),
    );

    expect(tickBody.snapshots).toHaveLength(1);
    expect(tickBody.snapshots[0].high_water_mark_usd).toBe(130);
    expect(tickBody.snapshots[0].drawdown_pct).toBeCloseTo((130 - 110) / 130);
    expect(pnlBody.latest.current_value_usd).toBe(110);
    expect(pnlBody.latest.high_water_mark_usd).toBe(130);
    expect(pnlBody.latest.drawdown_pct).toBeCloseTo((130 - 110) / 130);
    expect(countRows("holding_snapshots")).toBe(2);
    expect(countRows("pnl_snapshots")).toBe(2);
  });

  test("cron reports boards without observations as no new data", async () => {
    await registerBoard();

    const tickBody = await jsonOf<{
      status: string;
      boardsWithoutObservations: Array<Record<string, any>>;
      summary: Record<string, number | boolean>;
    }>(await postJson("/cron/tick", {}));

    expect(tickBody.status).toBe("no_new_data");
    expect(tickBody.boardsWithoutObservations).toEqual([{ board_id: "board-1" }]);
    expect(tickBody.summary.boardsWithoutObservations).toBe(1);
    expect(tickBody.summary.noNewData).toBe(true);
    expect(countRows("holding_snapshots")).toBe(0);
    expect(countRows("pnl_snapshots")).toBe(0);
  });

  test("removes manual observation and balance-change write routes", async () => {
    await registerBoard();

    const observation = await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      current_value_usd: 110,
    });
    const balanceChange = await postJson("/boards/board-1/balance-changes", {
      asset_id: "native:near",
      normalized_amount: 1,
    });

    expect(observation.status).toBe(404);
    expect(balanceChange.status).toBe(404);
  });

  test("requires service authorization for cron", async () => {
    const cron = await postJson("/cron/tick", {}, { admin: false });

    expect(cron.status).toBe(401);
    expect((await jsonOf<{ error: string }>(cron)).error).toBe("Missing service authorization");
  });

  test("removes manual paper market snapshot write route", async () => {
    await registerBoard();

    const response = await postJson("/paper/market-snapshots", {
      coin: "BTC",
      mark_px: 100,
      bids: [{ px: 99, sz: 1 }],
      asks: [{ px: 100, sz: 1 }],
    });

    expect(response.status).toBe(404);
  });

  test("rejects invalid production accounting numbers", async () => {
    await registerAgent("ironclaw", agentWallet.publicKey);
    const zeroStart = await postJson("/paper/accounts", {
      paper_account_id: "paper-zero",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      starting_balance_usd: 0,
    }, { agentSigned: true });
    expect(zeroStart.status).toBe(400);
    expect((await jsonOf<{ error: string }>(zeroStart)).error).toBe("starting_balance_usd must be greater than 0");

  });

  test("requires paper account creation to be signed by the registered agent", async () => {
    await registerAgent("ironclaw", agentWallet.publicKey);

    const response = await postJson("/paper/accounts", {
      paper_account_id: "paper-unsigned",
      agent_id: "ironclaw",
      agent_public_key: agentWallet.publicKey,
      starting_balance_usd: 1000,
    });

    expect(response.status).toBe(401);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Missing x-clawhouse-agent-public-key");
  });

  test("rejects paper account creation when board_id and agent identity disagree", async () => {
    await registerBoard();
    const otherAgent = createWallet();
    await registerAgent("other-agent", otherAgent.publicKey, otherAgent);

    const response = await postJson("/paper/accounts", {
      paper_account_id: "paper-wrong-agent",
      board_id: "board-1",
      agent_id: "other-agent",
      agent_public_key: otherAgent.publicKey,
      starting_balance_usd: 1000,
    }, { agentSigned: true, agentSigner: otherAgent });

    expect(response.status).toBe(400);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("paper account agent_id must match board agent_id");
  });

  test("fills a signed Hyperliquid-style IOC paper order and exposes leaderboard and replay proof", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      bids: [{ px: 99, sz: 5 }],
      asks: [{ px: 100, sz: 0.4 }, { px: 101, sz: 1 }],
    });

    const response = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "ioc-1",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 0.5,
      margin_mode: "cross",
      leverage: 10,
      max_slippage_bps: 200,
      reason: "Open a paper BTC long after strategy signal.",
    });
    const body = await jsonOf<{
      order: { id: string; status: string; avg_fill_px: number; notional_usd: number };
      fills: Array<{ px: number; size: number }>;
      risk: { leaderboard: { paper_pnl_usd: number; stale_data_status: string } };
    }>(response);

    expect(response.status).toBe(201);
    expect(body.order.status).toBe("filled");
    expect(body.order.avg_fill_px).toBeCloseTo(100.2);
    expect(body.order.notional_usd).toBeCloseTo(50.1);
    expect(body.fills).toHaveLength(2);
    expect(sqliteDb.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM paper_positions").get()?.count).toBe(1);
    expect(body.risk.leaderboard.paper_pnl_usd).toBeLessThan(0);
    expect(body.risk.leaderboard.stale_data_status).toBe("fresh");

    const leaderboard = await jsonOf<{ label: string; leaderboard: Array<{ paper_account_id: string; paper_pnl_pct: number }> }>(
      await app.fetch(new Request("http://ledger.test/paper/leaderboard")),
    );
    expect(leaderboard.label).toBe("paper");
    expect(leaderboard.leaderboard[0]?.paper_account_id).toBe("paper-1");

    const replay = await jsonOf<{ replay: { order: { id: string }; market_snapshot: { coin: string }; fills: unknown[]; audit: unknown[] } }>(
      await app.fetch(new Request(`http://ledger.test/paper/orders/${body.order.id}/replay`)),
    );
    expect(replay.replay.order.id).toBe(body.order.id);
    expect(replay.replay.market_snapshot.coin).toBe("BTC");
    expect(replay.replay.fills).toHaveLength(2);
    expect(replay.replay.audit.length).toBeGreaterThan(0);

    const activity = await jsonOf<{
      summary: { total_orders: number; filled_orders: number; rejected_orders: number; total_fills: number; latest_risk_at: string | null };
      orders: Array<{ id: string; status: string; body_hash?: string }>;
      fills: unknown[];
      risk_snapshots: Array<{ equity_usd: number; staleness_status: string }>;
      positions: unknown[];
    }>(
      await app.fetch(new Request("http://ledger.test/paper/accounts/paper-1/activity?limit=10")),
    );
    expect(activity.summary.total_orders).toBe(1);
    expect(activity.summary.filled_orders).toBe(1);
    expect(activity.summary.rejected_orders).toBe(0);
    expect(activity.summary.total_fills).toBe(2);
    expect(activity.summary.latest_risk_at).toBeTruthy();
    expect(activity.orders[0]?.id).toBe(body.order.id);
    expect(activity.orders[0]?.status).toBe("filled");
    expect(activity.orders[0]).not.toHaveProperty("body_hash");
    expect(activity.fills).toHaveLength(2);
    expect(activity.risk_snapshots).toHaveLength(1);
    expect(activity.risk_snapshots[0]?.staleness_status).toBe("fresh");
    expect(activity.positions).toHaveLength(1);
  });

  test("supports GTC resting paper orders and rejects crossing ALO post-only orders", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "ETH",
      mark_px: 2000,
      bids: [{ px: 1995, sz: 5 }],
      asks: [{ px: 2005, sz: 5 }],
    });

    const gtc = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "gtc-1",
      coin: "ETH",
      side: "buy",
      tif: "Gtc",
      limit_px: 1900,
      size: 0.1,
      margin_mode: "cross",
      leverage: 5,
      reason: "Rest a bid below current book.",
    });
    const gtcBody = await jsonOf<{ order: { status: string; remaining_size: number } }>(gtc);
    expect(gtc.status).toBe(201);
    expect(gtcBody.order.status).toBe("resting");
    expect(gtcBody.order.remaining_size).toBe(0.1);

    const alo = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "alo-cross",
      coin: "ETH",
      side: "buy",
      tif: "Alo",
      limit_px: 2005,
      size: 0.1,
      margin_mode: "cross",
      leverage: 5,
      reason: "This post-only order should not cross.",
    });
    const aloBody = await jsonOf<{ order: { status: string; reject_reason: string } }>(alo);
    expect(alo.status).toBe(201);
    expect(aloBody.order.status).toBe("rejected");
    expect(aloBody.order.reject_reason).toBe("post_only_would_cross");
  });

  test("refreshes Hyperliquid paper market snapshots from the info endpoint shape", async () => {
    currentRpcFetch = mockHyperliquidFetch({
      meta: [{ name: "BTC", maxLeverage: 40 }],
      contexts: [{ markPx: "100", oraclePx: "101", funding: "0.00001" }],
      books: {
        BTC: {
          bids: [{ px: "99", sz: "5", n: 2 }],
          asks: [{ px: "100", sz: "3", n: 4 }],
        },
      },
    });

    const response = await postJson("/paper/market-snapshots/hyperliquid", { coin: "BTC" });
    const body = await jsonOf<{ snapshots: Array<{ coin: string; source: string; mark_px: number; oracle_px: number; funding_rate: number; max_leverage: number; book: { bids: unknown[]; asks: unknown[] } }> }>(response);

    expect(response.status).toBe(201);
    expect(body.snapshots[0]?.coin).toBe("BTC");
    expect(body.snapshots[0]?.source).toBe("hyperliquid");
    expect(body.snapshots[0]?.mark_px).toBe(100);
    expect(body.snapshots[0]?.oracle_px).toBe(101);
    expect(body.snapshots[0]?.funding_rate).toBe(0.00001);
    expect(body.snapshots[0]?.max_leverage).toBe(40);
    expect(body.snapshots[0]?.book.bids).toHaveLength(1);
    expect(body.snapshots[0]?.book.asks).toHaveLength(1);
  });

  test("refreshes Hyperliquid paper spot snapshots from the spot info endpoint shape", async () => {
    currentRpcFetch = mockHyperliquidFetch({
      meta: [],
      contexts: [],
      spotMeta: [{ name: "PURR/USDC", index: 0 }],
      spotContexts: [{ markPx: "0.2", midPx: "0.2" }],
      books: {
        "PURR/USDC": {
          bids: [{ px: "0.19", sz: "100", n: 2 }],
          asks: [{ px: "0.2", sz: "100", n: 4 }],
        },
      },
    });

    const response = await postJson("/paper/market-snapshots/hyperliquid", {
      market_type: "spot",
      coin: "PURR/USDC",
    });
    const body = await jsonOf<{ snapshots: Array<{ market_type: string; coin: string; source: string; mark_px: number; funding_rate: number | null; max_leverage: number | null; book: { bids: unknown[]; asks: unknown[] } }> }>(response);

    expect(response.status).toBe(201);
    expect(body.snapshots[0]?.market_type).toBe("spot");
    expect(body.snapshots[0]?.coin).toBe("PURR/USDC");
    expect(body.snapshots[0]?.source).toBe("hyperliquid");
    expect(body.snapshots[0]?.mark_px).toBe(0.2);
    expect(body.snapshots[0]?.funding_rate).toBeNull();
    expect(body.snapshots[0]?.max_leverage).toBeNull();
    expect(body.snapshots[0]?.book.bids).toHaveLength(1);
    expect(body.snapshots[0]?.book.asks).toHaveLength(1);
  });

  test("refreshes non-PURR Hyperliquid paper spot snapshots using the spot pair index book symbol", async () => {
    currentRpcFetch = mockHyperliquidFetch({
      meta: [],
      contexts: [],
      spotMeta: [{ name: "HYPE/USDC", index: 107 }],
      spotContexts: [{ markPx: "32", midPx: "32" }],
      books: {
        "@107": {
          bids: [{ px: "31.9", sz: "10", n: 2 }],
          asks: [{ px: "32", sz: "10", n: 4 }],
        },
      },
    });

    const response = await postJson("/paper/market-snapshots/hyperliquid", {
      market_type: "spot",
      coin: "HYPE/USDC",
    });
    const body = await jsonOf<{ snapshots: Array<{ market_type: string; coin: string; mark_px: number; book: { bids: unknown[]; asks: unknown[] } }> }>(response);

    expect(response.status).toBe(201);
    expect(body.snapshots[0]?.market_type).toBe("spot");
    expect(body.snapshots[0]?.coin).toBe("HYPE/USDC");
    expect(body.snapshots[0]?.mark_px).toBe(32);
    expect(body.snapshots[0]?.book.bids).toHaveLength(1);
    expect(body.snapshots[0]?.book.asks).toHaveLength(1);
  });

  test("fills a first paper order by refreshing Hyperliquid market data on the order path", async () => {
    await registerPaperAccount({ allowed_markets: ["BTC", "ETH"] });
    currentRpcFetch = mockHyperliquidFetch({
      meta: [{ name: "BTC", maxLeverage: 40 }],
      contexts: [{ markPx: "100", oraclePx: "101", funding: "0.00001" }],
      books: {
        BTC: {
          bids: [{ px: "99", sz: "5", n: 2 }],
          asks: [{ px: "100", sz: "5", n: 4 }],
        },
      },
    });

    const order = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "first-order-refreshes-market",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 0.5,
      margin_mode: "cross",
      leverage: 10,
      max_slippage_bps: 200,
      reference_px: 100,
      max_reference_deviation_bps: 10,
      reason: "Open first BTC paper position after backend order-path refresh.",
    });
    const body = await jsonOf<{ order: { id: string; status: string; reject_reason: string | null; market_snapshot_id: string | null; reference_deviation_bps: number } }>(order);

    expect(order.status).toBe(201);
    expect(body.order.status).toBe("filled");
    expect(body.order.reject_reason).toBeNull();
    expect(body.order.market_snapshot_id).toBeTruthy();
    expect(body.order.reference_deviation_bps).toBe(0);
    expect(sqliteDb.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM paper_market_snapshots").get()?.count).toBe(1);
    expect(sqliteDb.raw.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM paper_positions").get()?.count).toBe(1);
  });

  test("allows any Hyperliquid market when a paper account has explicit Hyperliquid-supported scope", async () => {
    await registerPaperAccount({ allowed_markets: { scope: "hyperliquid_supported" } });
    currentRpcFetch = mockHyperliquidFetch({
      meta: [{ name: "SOL", maxLeverage: 20 }],
      contexts: [{ markPx: "150", oraclePx: "150", funding: "0.00001" }],
      books: {
        SOL: {
          bids: [{ px: "149", sz: "100", n: 2 }],
          asks: [{ px: "150", sz: "100", n: 4 }],
        },
      },
    });

    const order = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "unrestricted-sol",
      coin: "SOL",
      side: "buy",
      tif: "Ioc",
      size: 1,
      margin_mode: "cross",
      leverage: 5,
      max_slippage_bps: 200,
      reference_px: 150,
      max_reference_deviation_bps: 10,
      reason: "Open unrestricted SOL paper position.",
    });
    const body = await jsonOf<{ order: { status: string; reject_reason: string | null } }>(order);

    expect(order.status).toBe(201);
    expect(body.order.status).toBe("filled");
    expect(body.order.reject_reason).toBeNull();
  });

  test("fills a signed Hyperliquid spot paper order and rejects selling more than held", async () => {
    await registerPaperAccount({ allowed_markets: ["spot:PURR/USDC"] });
    await createPaperMarketSnapshot({
      market_type: "spot",
      coin: "PURR/USDC",
      mark_px: 0.2,
      maintenance_margin_rate: 0.001,
      bids: [{ px: 0.19, sz: 100 }],
      asks: [{ px: 0.2, sz: 50 }],
    });

    const buy = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "spot-buy",
      market_type: "spot",
      coin: "PURR/USDC",
      side: "buy",
      tif: "Ioc",
      size: 10,
      margin_mode: "spot",
      reason: "Open a paper spot PURR position.",
    });
    const buyBody = await jsonOf<{
      order: { id: string; market_type: string; status: string; notional_usd: number };
      fills: Array<{ market_type: string; px: number; size: number }>;
      risk: { risk: { equity_usd: number; maintenance_margin_usd: number } };
    }>(buy);

    expect(buy.status).toBe(201);
    expect(buyBody.order.market_type).toBe("spot");
    expect(buyBody.order.status).toBe("filled");
    expect(buyBody.order.notional_usd).toBeCloseTo(2);
    expect(buyBody.fills[0]?.market_type).toBe("spot");
    expect(buyBody.risk.risk.maintenance_margin_usd).toBe(0);

    const account = sqliteDb.raw.query<{ cash_balance_usd: number }, []>(
      "SELECT cash_balance_usd FROM paper_accounts WHERE id = 'paper-1'",
    ).get();
    expect(account?.cash_balance_usd).toBeCloseTo(997.9993);
    const position = sqliteDb.raw.query<{ market_type: string; margin_mode: string; signed_size: number }, []>(
      "SELECT market_type, margin_mode, signed_size FROM paper_positions WHERE paper_account_id = 'paper-1' AND coin = 'PURR/USDC'",
    ).get();
    expect(position?.market_type).toBe("spot");
    expect(position?.margin_mode).toBe("spot");
    expect(position?.signed_size).toBe(10);

    const oversell = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "spot-oversell",
      market_type: "spot",
      coin: "PURR/USDC",
      side: "sell",
      tif: "Ioc",
      size: 11,
      margin_mode: "spot",
      reason: "This should fail because the paper spot account holds only 10 PURR.",
    });
    const oversellBody = await jsonOf<{ order: { status: string; reject_reason: string } }>(oversell);
    expect(oversell.status).toBe(201);
    expect(oversellBody.order.status).toBe("rejected");
    expect(oversellBody.order.reject_reason).toBe("spot_insufficient_position");

    const replay = await jsonOf<{ replay: { order: { market_type: string }; market_snapshot: { market_type: string }; fills: unknown[] } }>(
      await app.fetch(new Request(`http://ledger.test/paper/orders/${buyBody.order.id}/replay`)),
    );
    expect(replay.replay.order.market_type).toBe("spot");
    expect(replay.replay.market_snapshot.market_type).toBe("spot");
    expect(replay.replay.fills).toHaveLength(1);
  });

  test("rejects paper orders above the Hyperliquid market max leverage", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      max_leverage: 5,
      bids: [{ px: 99, sz: 5 }],
      asks: [{ px: 100, sz: 5 }],
    });

    const response = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "leverage-too-high",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 1,
      margin_mode: "isolated",
      leverage: 10,
      reason: "This leverage should exceed the market cap.",
    });
    const body = await jsonOf<{ order: { status: string; reject_reason: string } }>(response);

    expect(response.status).toBe(201);
    expect(body.order.status).toBe("rejected");
    expect(body.order.reject_reason).toBe("leverage_exceeds_hyperliquid_max");
  });

  test("rejects malformed paper order intent fields as persisted paper orders or conflicts", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      bids: [{ px: 99, sz: 10 }],
      asks: [{ px: 100, sz: 10 }],
    });

    const missingSlippage = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "missing-slippage",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 0.1,
      margin_mode: "cross",
      leverage: 2,
      reason: "Market-like IOC should require explicit slippage.",
      __omitMaxSlippageBps: true,
    });
    const missingSlippageBody = await jsonOf<{ order: { id: string; status: string; reject_reason: string } }>(missingSlippage);
    expect(missingSlippage.status).toBe(201);
    expect(missingSlippageBody.order.status).toBe("rejected");
    expect(missingSlippageBody.order.reject_reason).toBe("max_slippage_bps_required");

    const missingReasonInput = {
      paper_account_id: "paper-1",
      client_order_id: "missing-reason",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 0.1,
      margin_mode: "cross",
      leverage: 2,
      max_slippage_bps: 50,
    };
    const missingReason = await paperSignedPost("/paper/orders", missingReasonInput);
    const missingReasonBody = await jsonOf<{ order: { status: string; reject_reason: string } }>(missingReason);
    expect(missingReason.status).toBe(201);
    expect(missingReasonBody.order.status).toBe("rejected");
    expect(missingReasonBody.order.reject_reason).toBe("reason_required");

    const missingReasonReplay = await paperSignedPost("/paper/orders", missingReasonInput);
    const missingReasonReplayBody = await jsonOf<{ idempotent: boolean; order: { status: string; reject_reason: string } }>(missingReasonReplay);
    expect(missingReasonReplay.status).toBe(201);
    expect(missingReasonReplayBody.idempotent).toBe(true);
    expect(missingReasonReplayBody.order.status).toBe("rejected");
    expect(missingReasonReplayBody.order.reject_reason).toBe("reason_required");

    const first = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "duplicate-body",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 0.1,
      margin_mode: "cross",
      leverage: 2,
      reason: "First body for idempotency key.",
    });
    expect(first.status).toBe(201);

    const changed = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "duplicate-body",
      coin: "BTC",
      side: "sell",
      tif: "Ioc",
      size: 0.2,
      margin_mode: "cross",
      leverage: 2,
      reason: "Changed body should conflict with the existing idempotency key.",
    });
    const changedBody = await jsonOf<{ error: string }>(changed);
    expect(changed.status).toBe(409);
    expect(changedBody.error).toBe("client_order_id body mismatch");

    const replay = await jsonOf<{ replay: { order: { id: string; status: string; reject_reason: string }; audit: unknown[] } }>(
      await app.fetch(new Request(`http://ledger.test/paper/orders/${missingSlippageBody.order.id}/replay`)),
    );
    expect(replay.replay.order.status).toBe("rejected");
    expect(replay.replay.order.reject_reason).toBe("max_slippage_bps_required");
    expect(replay.replay.audit.length).toBeGreaterThan(0);
  });

  test("records margin failures as rejected paper orders with replay proof", async () => {
    await registerPaperAccount({ starting_balance_usd: 10 });
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      bids: [{ px: 99, sz: 10 }],
      asks: [{ px: 100, sz: 10 }],
    });

    const isolated = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "isolated-margin-reject",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 5,
      margin_mode: "isolated",
      leverage: 2,
      reason: "Should reject as an auditable paper order instead of HTTP 400.",
    });
    const isolatedBody = await jsonOf<{ order: { id: string; status: string; reject_reason: string } }>(isolated);
    expect(isolated.status).toBe(201);
    expect(isolatedBody.order.status).toBe("rejected");
    expect(isolatedBody.order.reject_reason).toBe("insufficient_isolated_paper_margin");

    const cross = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "cross-margin-reject",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 5,
      margin_mode: "cross",
      leverage: 2,
      reason: "Should reject as an auditable paper order instead of HTTP 400.",
    });
    const crossBody = await jsonOf<{ order: { id: string; status: string; reject_reason: string } }>(cross);
    expect(cross.status).toBe(201);
    expect(crossBody.order.status).toBe("rejected");
    expect(crossBody.order.reject_reason).toBe("insufficient_cross_paper_margin");

    const replay = await jsonOf<{ replay: { order: { id: string; status: string; reject_reason: string }; audit: unknown[] } }>(
      await app.fetch(new Request(`http://ledger.test/paper/orders/${crossBody.order.id}/replay`)),
    );
    expect(replay.replay.order.status).toBe("rejected");
    expect(replay.replay.order.reject_reason).toBe("insufficient_cross_paper_margin");
    expect(replay.replay.audit.length).toBeGreaterThan(0);
  });

  test("uses each position's own mark price for multi-coin cross-margin checks", async () => {
    await registerPaperAccount({ allowed_markets: ["BTC", "ETH"] });
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      bids: [{ px: 99, sz: 10 }],
      asks: [{ px: 100, sz: 10 }],
    });
    await createPaperMarketSnapshot({
      coin: "ETH",
      mark_px: 2000,
      bids: [{ px: 1999, sz: 10 }],
      asks: [{ px: 2000, sz: 10 }],
    });

    const btc = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "cross-btc",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 1,
      margin_mode: "cross",
      leverage: 2,
      reason: "Open BTC cross position before ETH order.",
    });
    expect(btc.status).toBe(201);

    const eth = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "cross-eth",
      coin: "ETH",
      side: "buy",
      tif: "Ioc",
      size: 0.1,
      margin_mode: "cross",
      leverage: 2,
      reason: "ETH order should not value BTC position at ETH mark.",
    });
    const ethBody = await jsonOf<{ order: { status: string; reject_reason: string | null } }>(eth);
    expect(eth.status).toBe(201);
    expect(ethBody.order.status).toBe("filled");
    expect(ethBody.order.reject_reason).toBeNull();
  });

  test("blocks new cross exposure when existing cross losses consume margin", async () => {
    await registerPaperAccount({ allowed_markets: ["BTC", "ETH"] });
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      bids: [{ px: 99, sz: 20 }],
      asks: [{ px: 100, sz: 20 }],
    });
    await createPaperMarketSnapshot({
      coin: "ETH",
      mark_px: 2000,
      bids: [{ px: 1999, sz: 10 }],
      asks: [{ px: 2000, sz: 10 }],
    });

    const btc = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "loss-btc",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 10,
      margin_mode: "cross",
      leverage: 2,
      reason: "Open BTC cross long before adverse mark.",
    });
    expect(btc.status).toBe(201);

    currentNow = new Date("2026-06-19T00:00:02.000Z");
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 10,
      bids: [{ px: 9, sz: 20 }],
      asks: [{ px: 10, sz: 20 }],
    });
    await createPaperMarketSnapshot({
      coin: "ETH",
      mark_px: 2000,
      bids: [{ px: 1999, sz: 10 }],
      asks: [{ px: 2000, sz: 10 }],
    });

    const eth = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "blocked-eth",
      coin: "ETH",
      side: "buy",
      tif: "Ioc",
      size: 0.1,
      margin_mode: "cross",
      leverage: 2,
      reason: "Existing cross losses should block new exposure.",
    });
    const ethBody = await jsonOf<{ order: { status: string; reject_reason: string } }>(eth);
    expect(eth.status).toBe(201);
    expect(ethBody.order.status).toBe("rejected");
    expect(ethBody.order.reject_reason).toBe("insufficient_cross_paper_margin");
  });

  test("flips a cross paper position when an opposite IOC order exceeds open size", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      bids: [{ px: 99, sz: 5 }],
      asks: [{ px: 100, sz: 5 }],
    });

    const openShort = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "flip-open-short",
      coin: "BTC",
      side: "sell",
      tif: "Ioc",
      size: 0.1,
      margin_mode: "cross",
      leverage: 10,
      reason: "Open short before flip.",
    });
    expect(openShort.status).toBe(201);

    const flipLong = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "flip-long",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 0.2,
      margin_mode: "cross",
      leverage: 10,
      reason: "Buy more than the short size to flip long.",
    });
    const flipBody = await jsonOf<{ order: { status: string } }>(flipLong);
    expect(flipLong.status).toBe(201);
    expect(flipBody.order.status).toBe("filled");

    const position = sqliteDb.raw.query<{ status: string; signed_size: number; entry_px: number }, []>(
      "SELECT status, signed_size, entry_px FROM paper_positions WHERE paper_account_id = 'paper-1' AND coin = 'BTC' AND margin_mode = 'cross'",
    ).get();
    expect(position?.status).toBe("open");
    expect(position?.signed_size).toBeCloseTo(0.1);
    expect(position?.entry_px).toBe(100);
  });

  test("liquidates an isolated paper position when mark price breaches maintenance margin", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      bids: [{ px: 99, sz: 5 }],
      asks: [{ px: 100, sz: 5 }],
    });
    const order = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "iso-1",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 1,
      margin_mode: "isolated",
      leverage: 10,
      reason: "Open isolated paper long.",
    });
    expect(order.status).toBe(201);

    currentNow = new Date("2026-06-19T00:00:02.000Z");
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 90,
      bids: [{ px: 89, sz: 5 }],
      asks: [{ px: 90, sz: 5 }],
    });
    const liquidation = await postJson("/paper/accounts/paper-1/risk-check", {});
    const body = await jsonOf<{ liquidations: Array<{ reason: string; liquidation_px: number }>; risk: { leaderboard: { liquidation_count: number } } }>(liquidation);

    expect(liquidation.status).toBe(200);
    expect(body.liquidations).toHaveLength(1);
    expect(body.liquidations[0]?.reason).toBe("isolated_maintenance_margin_breach");
    expect(body.liquidations[0]?.liquidation_px).toBe(90);
    expect(body.risk.leaderboard.liquidation_count).toBe(1);
    const position = sqliteDb.raw.query<{ status: string; signed_size: number }, []>("SELECT status, signed_size FROM paper_positions WHERE paper_account_id = 'paper-1'").get();
    expect(position?.status).toBe("liquidated");
    expect(position?.signed_size).toBe(0);
  });

  test("risk-check liquidates breached perps without liquidating spot paper positions", async () => {
    await registerPaperAccount({ allowed_markets: ["BTC", "spot:PURR/USDC"] });
    await createPaperMarketSnapshot({
      market_type: "spot",
      coin: "PURR/USDC",
      mark_px: 0.2,
      bids: [{ px: 0.19, sz: 100 }],
      asks: [{ px: 0.2, sz: 100 }],
    });
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      bids: [{ px: 99, sz: 200 }],
      asks: [{ px: 100, sz: 200 }],
    });

    const spotOrder = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "risk-check-spot",
      market_type: "spot",
      coin: "PURR/USDC",
      side: "buy",
      tif: "Ioc",
      size: 10,
      margin_mode: "spot",
      reason: "Open spot inventory that must survive perp liquidation.",
    });
    expect(spotOrder.status).toBe(201);

    const perpOrder = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "risk-check-cross-perp",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 90,
      margin_mode: "cross",
      leverage: 10,
      reason: "Open cross-margin paper long for liquidation regression.",
    });
    expect(perpOrder.status).toBe(201);

    currentNow = new Date("2026-06-19T00:00:02.000Z");
    await createPaperMarketSnapshot({
      market_type: "spot",
      coin: "PURR/USDC",
      mark_px: 0.2,
      bids: [{ px: 0.19, sz: 100 }],
      asks: [{ px: 0.2, sz: 100 }],
    });
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 88,
      bids: [{ px: 87, sz: 200 }],
      asks: [{ px: 88, sz: 200 }],
    });

    const riskCheck = await postJson("/paper/accounts/paper-1/risk-check", {});
    const body = await jsonOf<{ liquidations: Array<{ reason: string; liquidation_px: number }> }>(riskCheck);

    expect(riskCheck.status).toBe(200);
    expect(body.liquidations).toHaveLength(1);
    expect(body.liquidations[0]?.reason).toBe("cross_maintenance_margin_breach");
    expect(body.liquidations[0]?.liquidation_px).toBe(88);

    const positions = sqliteDb.raw.query<{ market_type: string; status: string; signed_size: number }, []>(
      "SELECT market_type, status, signed_size FROM paper_positions WHERE paper_account_id = 'paper-1' ORDER BY market_type ASC",
    ).all();
    expect(positions).toEqual([
      { market_type: "perp", status: "liquidated", signed_size: 0 },
      { market_type: "spot", status: "open", signed_size: 10 },
    ]);
  });

  test("cron refreshes Hyperliquid market data and liquidates breached paper positions", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      max_leverage: 40,
      bids: [{ px: 99, sz: 5 }],
      asks: [{ px: 100, sz: 5 }],
    });
    const order = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "cron-monitor-iso",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 1,
      margin_mode: "isolated",
      leverage: 10,
      reason: "Open isolated paper long before cron monitor.",
    });
    expect(order.status).toBe(201);

    currentNow = new Date("2026-06-19T00:00:02.000Z");
    currentRpcFetch = mockHyperliquidFetch({
      meta: [{ name: "BTC", maxLeverage: 40 }],
      contexts: [{ markPx: "90", oraclePx: "90", funding: "0.00001" }],
      books: {
        BTC: {
          bids: [{ px: "89", sz: "5", n: 2 }],
          asks: [{ px: "90", sz: "5", n: 4 }],
        },
      },
    });

    const tick = await postJson("/cron/tick", {});
    const body = await jsonOf<{ paperMonitor: { status: string; accounts_checked: number; liquidations: Array<{ reason: string; liquidation_px: number }> } }>(tick);

    expect(tick.status).toBe(200);
    expect(body.paperMonitor.status).toBe("liquidations_executed");
    expect(body.paperMonitor.accounts_checked).toBe(1);
    expect(body.paperMonitor.liquidations).toHaveLength(1);
    expect(body.paperMonitor.liquidations[0]?.reason).toBe("isolated_maintenance_margin_breach");
    expect(body.paperMonitor.liquidations[0]?.liquidation_px).toBe(90);
  });

  test("cron paper liquidation monitor ignores open spot paper positions", async () => {
    await registerPaperAccount({ allowed_markets: ["spot:PURR/USDC"] });
    await createPaperMarketSnapshot({
      market_type: "spot",
      coin: "PURR/USDC",
      mark_px: 0.2,
      bids: [{ px: 0.19, sz: 100 }],
      asks: [{ px: 0.2, sz: 100 }],
    });
    const order = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "cron-monitor-spot",
      market_type: "spot",
      coin: "PURR/USDC",
      side: "buy",
      tif: "Ioc",
      size: 10,
      margin_mode: "spot",
      reason: "Open a paper spot position before cron monitor.",
    });
    expect(order.status).toBe(201);

    currentRpcFetch = async () => {
      throw new Error("cron monitor should not refresh Hyperliquid perps for spot paper positions");
    };

    const tick = await postJson("/cron/tick", {});
    const body = await jsonOf<{ paperMonitor: { status: string; accounts_checked: number; liquidations: unknown[] } }>(tick);

    expect(tick.status).toBe(200);
    expect(body.paperMonitor.status).toBe("skipped_no_open_positions");
    expect(body.paperMonitor.accounts_checked).toBe(0);
    expect(body.paperMonitor.liquidations).toHaveLength(0);
  });

  test("enforces reduce-only paper orders and reopens a closed position", async () => {
    await registerPaperAccount();
    await createPaperMarketSnapshot({
      coin: "BTC",
      mark_px: 100,
      bids: [{ px: 99, sz: 5 }],
      asks: [{ px: 100, sz: 5 }],
    });

    const open = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "reopen-open",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 1,
      margin_mode: "cross",
      leverage: 10,
      reason: "Open a cross paper long.",
    });
    expect(open.status).toBe(201);

    const increase = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "reduce-only-increase",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 0.1,
      reduce_only: true,
      margin_mode: "cross",
      leverage: 10,
      reason: "A reduce-only order cannot add to a long.",
    });
    const increaseBody = await jsonOf<{ order: { status: string; reject_reason: string } }>(increase);
    expect(increase.status).toBe(201);
    expect(increaseBody.order.status).toBe("rejected");
    expect(increaseBody.order.reject_reason).toBe("reduce_only_would_increase");

    const close = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "reduce-only-close",
      coin: "BTC",
      side: "sell",
      tif: "Ioc",
      size: 1,
      reduce_only: true,
      margin_mode: "cross",
      leverage: 10,
      reason: "Close the cross paper long.",
    });
    const closeBody = await jsonOf<{ order: { status: string } }>(close);
    expect(close.status).toBe(201);
    expect(closeBody.order.status).toBe("filled");

    const closedPosition = sqliteDb.raw.query<{ status: string; signed_size: number }, []>(
      "SELECT status, signed_size FROM paper_positions WHERE paper_account_id = 'paper-1' AND coin = 'BTC' AND margin_mode = 'cross'",
    ).get();
    expect(closedPosition?.status).toBe("closed");
    expect(closedPosition?.signed_size).toBe(0);

    const reopen = await paperSignedPost("/paper/orders", {
      paper_account_id: "paper-1",
      client_order_id: "reopen-after-close",
      coin: "BTC",
      side: "buy",
      tif: "Ioc",
      size: 0.5,
      margin_mode: "cross",
      leverage: 10,
      reason: "Reopen a cross paper long after full close.",
    });
    const reopenBody = await jsonOf<{ order: { status: string } }>(reopen);
    expect(reopen.status).toBe(201);
    expect(reopenBody.order.status).toBe("filled");

    const reopenedPosition = sqliteDb.raw.query<{ status: string; signed_size: number; count: number }, []>(
      `SELECT status, signed_size, COUNT(*) OVER () AS count
       FROM paper_positions
       WHERE paper_account_id = 'paper-1' AND coin = 'BTC' AND margin_mode = 'cross'`,
    ).get();
    expect(reopenedPosition?.status).toBe("open");
    expect(reopenedPosition?.signed_size).toBe(0.5);
    expect(reopenedPosition?.count).toBe(1);
  });
});

async function registerBoard(overrides: Record<string, unknown> = {}) {
  const paperStartingBalanceUsd = Number(overrides.paper_starting_balance_usd ?? 100);
  const { paper_starting_balance_usd: _paperStartingBalanceUsd, ...boardOverrides } = overrides;
  const body = {
    board_id: "board-1",
    agent_id: "ironclaw",
    agent_public_key: agentWallet.publicKey,
    wallet_address: wallet.walletAddress,
    public_key: wallet.publicKey,
    base_currency: "USD",
    public_status: "active",
    visibility_mode: "public",
    ...boardOverrides,
  };
  await registerAgent(cleanBodyString(body.agent_id, "agent_id"), cleanBodyString(body.agent_public_key, "agent_public_key"));
  const response = await postJson("/boards", body, { signed: true, agentSigned: true });

  expect(response.status).toBe(201);
  const board = (await jsonOf<{ board: Record<string, any> }>(response)).board;
  const paperResponse = await postJson("/paper/accounts", {
    paper_account_id: `paper-${body.board_id}`,
    board_id: body.board_id,
    agent_id: body.agent_id,
    agent_public_key: body.agent_public_key,
    starting_balance_usd: paperStartingBalanceUsd,
    allowed_markets: ["BTC", "ETH"],
  }, { agentSigned: true });
  expect(paperResponse.status).toBe(201);
  return board;
}

async function registerPaperAccount(overrides: Record<string, unknown> = {}) {
  await registerAgent("ironclaw", agentWallet.publicKey);
  const response = await postJson("/paper/accounts", {
    paper_account_id: "paper-1",
    agent_id: "ironclaw",
    agent_public_key: agentWallet.publicKey,
    starting_balance_usd: 1000,
    allowed_markets: ["BTC", "ETH"],
    ...overrides,
  }, { agentSigned: true });
  expect(response.status).toBe(201);
  return (await jsonOf<{ account: Record<string, any> }>(response)).account;
}

async function registerAgent(agentId = "ironclaw", agentPublicKey = agentWallet.publicKey, signer = agentWallet) {
  const response = await postJson("/agents", {
    agent_id: agentId,
    agent_public_key: agentPublicKey,
    metadata: { source: "test" },
  }, { agentSigned: true, agentSigner: signer });
  expect(response.status).toBe(201);
  return (await jsonOf<{ agent: Record<string, any> }>(response)).agent;
}

async function createPaperMarketSnapshot(overrides: Record<string, unknown>) {
  rememberHyperliquidFixture(overrides);
  const result = await insertPaperMarketSnapshot(sqliteDb, {
    raw: JSON.stringify({
      source: "hyperliquid-test-fixture",
      maintenance_margin_rate: 0.005,
      observed_at: currentNow.toISOString(),
      ...overrides,
    }),
    json: {
    source: "hyperliquid-test-fixture",
    maintenance_margin_rate: 0.005,
    observed_at: currentNow.toISOString(),
    ...overrides,
    },
  }, currentNow.toISOString());
  return result.snapshot;
}

async function insertObservationFixture(boardId: string, data: Record<string, unknown>) {
  const board = await requireTestBoard(boardId);
  const observedAt = cleanOptionalBodyString(data.observed_at ?? data.observedAt) ?? currentNow.toISOString();
  const observation = {
    id: `obs-test-${crypto.randomUUID()}`,
    board_id: boardId,
    wallet_address: cleanOptionalBodyString(data.wallet_address ?? data.walletAddress) ?? board.wallet_address,
    observed_at: observedAt,
    current_value_usd: Number(data.current_value_usd ?? data.currentValueUsd ?? 0),
    topup_usd: Number(data.topup_usd ?? data.topupUsd ?? 0),
    withdrawal_usd: Number(data.withdrawal_usd ?? data.withdrawalUsd ?? 0),
    client_event_id: cleanOptionalBodyString(data.client_event_id ?? data.clientEventId),
    tx_hash: cleanOptionalBodyString(data.tx_hash ?? data.txHash),
    intent_id: cleanOptionalBodyString(data.intent_id ?? data.intentId),
    status_claim: cleanOptionalBodyString(data.status_claim ?? data.statusClaim),
    asset_in: cleanOptionalBodyString(data.asset_in ?? data.assetIn),
    amount_in: optionalFixtureNumber(data.amount_in ?? data.amountIn),
    asset_out: cleanOptionalBodyString(data.asset_out ?? data.assetOut),
    amount_out: optionalFixtureNumber(data.amount_out ?? data.amountOut),
    metadata_json: data.metadata === undefined ? null : JSON.stringify(data.metadata),
    event_id: null,
    created_at: currentNow.toISOString(),
  };
  await sqliteDb.run(
    `INSERT INTO observations
      (id, board_id, wallet_address, observed_at, current_value_usd, topup_usd, withdrawal_usd,
       client_event_id, tx_hash, intent_id, status_claim, asset_in, amount_in, asset_out,
       amount_out, metadata_json, event_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      observation.id,
      observation.board_id,
      observation.wallet_address,
      observation.observed_at,
      observation.current_value_usd,
      observation.topup_usd,
      observation.withdrawal_usd,
      observation.client_event_id,
      observation.tx_hash,
      observation.intent_id,
      observation.status_claim,
      observation.asset_in,
      observation.amount_in,
      observation.asset_out,
      observation.amount_out,
      observation.metadata_json,
      observation.event_id,
      observation.created_at,
    ],
  );
  return jsonResponse({ ok: true, observation: { ...observation, metadata: data.metadata ?? null } }, 201);
}

async function insertBalanceChangeFixture(boardId: string, data: Record<string, unknown>) {
  const board = await requireTestBoard(boardId);
  const walletAddress = cleanOptionalBodyString(data.wallet_address ?? data.walletAddress) ?? board.wallet_address;
  const trackedWallet = sqliteDb.raw.query<{ id: string }, [string, string]>(
    "SELECT id FROM tracked_wallets WHERE board_id = ? AND wallet_address = ?",
  ).get(boardId, walletAddress);
  const change = {
    id: `bal-test-${crypto.randomUUID()}`,
    board_id: boardId,
    tracked_wallet_id: trackedWallet?.id ?? null,
    wallet_address: walletAddress,
    observed_at: cleanOptionalBodyString(data.observed_at ?? data.observedAt) ?? currentNow.toISOString(),
    asset_id: cleanBodyString(data.asset_id ?? data.assetId, "asset_id"),
    asset_symbol: cleanOptionalBodyString(data.asset_symbol ?? data.assetSymbol),
    raw_amount: cleanOptionalBodyString(data.raw_amount ?? data.rawAmount),
    normalized_amount: optionalFixtureNumber(data.normalized_amount ?? data.normalizedAmount),
    decimals: data.decimals === undefined ? null : Number(data.decimals),
    delta_amount: optionalFixtureNumber(data.delta_amount ?? data.deltaAmount),
    delta_value_usd: optionalFixtureNumber(data.delta_value_usd ?? data.deltaValueUsd),
    change_type: cleanOptionalBodyString(data.change_type ?? data.changeType) ?? "unknown_change",
    source_observation_id: cleanOptionalBodyString(data.source_observation_id ?? data.sourceObservationId),
    source_event_id: cleanOptionalBodyString(data.source_event_id ?? data.sourceEventId),
    tx_hash: cleanOptionalBodyString(data.tx_hash ?? data.txHash),
    intent_id: cleanOptionalBodyString(data.intent_id ?? data.intentId),
    visibility_status: cleanOptionalBodyString(data.visibility_status ?? data.visibilityStatus) ?? "complete",
    metadata_json: data.metadata === undefined ? null : JSON.stringify(data.metadata),
    created_at: currentNow.toISOString(),
  };
  await sqliteDb.run(
    `INSERT INTO balance_changes
      (id, board_id, tracked_wallet_id, wallet_address, observed_at, asset_id, asset_symbol,
       raw_amount, normalized_amount, decimals, delta_amount, delta_value_usd, change_type,
       source_observation_id, source_event_id, tx_hash, intent_id, visibility_status,
       metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      change.id,
      change.board_id,
      change.tracked_wallet_id,
      change.wallet_address,
      change.observed_at,
      change.asset_id,
      change.asset_symbol,
      change.raw_amount,
      change.normalized_amount,
      change.decimals,
      change.delta_amount,
      change.delta_value_usd,
      change.change_type,
      change.source_observation_id,
      change.source_event_id,
      change.tx_hash,
      change.intent_id,
      change.visibility_status,
      change.metadata_json,
      change.created_at,
    ],
  );
  return jsonResponse({ ok: true, board_id: boardId, balance_changes: [{ ...change, metadata: data.metadata ?? null }] }, 201);
}

async function requireTestBoard(boardId: string) {
  const board = sqliteDb.raw.query<{ wallet_address: string }, [string]>(
    "SELECT wallet_address FROM boards WHERE id = ?",
  ).get(boardId);
  if (!board) throw new Error(`Missing test board ${boardId}`);
  return board;
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rememberHyperliquidFixture(overrides: Record<string, unknown>) {
  const marketType = String(overrides.market_type ?? overrides.marketType ?? "perp");
  const coin = cleanBodyString(overrides.coin, "coin").toUpperCase();
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

async function postJson(
  path: string,
  body: Record<string, unknown>,
  options: { admin?: boolean; signed?: boolean; signer?: ReturnType<typeof createWallet>; agentSigned?: boolean; agentSigner?: ReturnType<typeof createWallet> } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.admin !== false) {
    headers.authorization = `Bearer ${adminToken}`;
  }
  if (options.signed) {
    Object.assign(headers, signRequest("POST", path, body, options.signer ?? wallet, {
      boardId: path === "/creator-onboarding/register"
        ? cleanOptionalBodyString(body.board_id ?? body.boardId) ?? ""
        : cleanBodyString(body.board_id ?? body.boardId, "board_id"),
      agentId: cleanBodyString(body.agent_id ?? body.agentId, "agent_id"),
    }).headers);
  }
  if (options.agentSigned) {
    const purpose = path === "/agents"
      ? "agent_registration"
      : path === "/paper/accounts"
        ? "paper_account_registration"
        : path === "/creator-onboarding/register"
          ? "creator_onboarding_registration"
        : "board_registration";
    const boardId = path === "/agents"
      ? null
      : path === "/paper/accounts"
        ? cleanOptionalBodyString(body.board_id ?? body.boardId)
        : path === "/creator-onboarding/register"
          ? cleanOptionalBodyString(body.board_id ?? body.boardId)
          : cleanBodyString(body.board_id ?? body.boardId, "board_id");
    Object.assign(headers, signAgentRequest("POST", path, body, options.agentSigner ?? agentWallet, {
      purpose,
      boardId,
      agentId: cleanBodyString(body.agent_id ?? body.agentId, "agent_id"),
      agentPublicKey: cleanBodyString(body.agent_public_key ?? body.agentPublicKey, "agent_public_key"),
    }).headers);
  }

  return await app.fetch(new Request(`http://ledger.test${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }));
}

async function signedFetch(
  method: string,
  path: string,
  body: Record<string, unknown>,
  signer = wallet,
  options: { timestamp?: string } = {},
) {
  const signed = signRequest(method, path, body, signer, options);
  return await app.fetch(new Request(`http://ledger.test${path}`, {
    method,
    headers: signed.headers,
    body: signed.rawBody,
  }));
}

async function serviceGet(path: string) {
  return await app.fetch(new Request(`http://ledger.test${path}`, {
    headers: { authorization: `Bearer ${adminToken}` },
  }));
}

async function paperSignedPost(path: string, body: Record<string, unknown>, signer = agentWallet) {
  const signedBody = paperOrderTestBody(body);
  const rawBody = JSON.stringify(signedBody);
  const timestamp = currentNow.getTime().toString();
  const nonce = crypto.randomUUID();
  const bodyHash = sha256Hex(rawBody);
  const paperAccountId = cleanBodyString(signedBody.paper_account_id ?? signedBody.paperAccountId, "paper_account_id");
  const payload = canonicalPaperAuthPayload({
    method: "POST",
    path,
    bodyHash,
    timestamp,
    nonce,
    paperAccountId,
    agentId: "ironclaw",
  });
  const signature = signer.keyPair.sign(new TextEncoder().encode(payload)).signature;

  return await app.fetch(new Request(`http://ledger.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-clawhouse-paper-account-id": paperAccountId,
      "x-clawhouse-agent-id": "ironclaw",
      "x-clawhouse-paper-timestamp": timestamp,
      "x-clawhouse-paper-nonce": nonce,
      "x-clawhouse-paper-body-sha256": bodyHash,
      "x-clawhouse-paper-signature": Buffer.from(signature).toString("base64url"),
    },
    body: rawBody,
  }));
}

function paperOrderTestBody(body: Record<string, unknown>) {
  const next = { ...body };
  const coin = String(next.coin ?? "BTC").toUpperCase();
  const omitMaxSlippage = next.__omitMaxSlippageBps === true;
  delete next.__omitMaxSlippageBps;

  const tif = cleanBodyString(next.tif ?? next.timeInForce ?? next.time_in_force ?? next.orderType ?? next.order_type ?? "Ioc", "tif")
    .toLowerCase();
  const hasLimitPx = next.limitPx !== undefined || next.limit_px !== undefined;
  const hasMaxSlippage = next.maxSlippageBps !== undefined || next.max_slippage_bps !== undefined;
  if (!omitMaxSlippage && !hasLimitPx && !hasMaxSlippage && (tif === "ioc" || tif === "market")) {
    next.max_slippage_bps = 50;
  }
  if (next.reference_px === undefined && next.referencePx === undefined) {
    next.reference_px = defaultReferencePx(coin);
  }
  if (next.max_reference_deviation_bps === undefined && next.maxReferenceDeviationBps === undefined) {
    next.max_reference_deviation_bps = 100;
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

function signRequest(
  method: string,
  path: string,
  body: Record<string, unknown>,
  signer = wallet,
  options: { timestamp?: string; boardId?: string; agentId?: string } = {},
) {
  const rawBody = JSON.stringify(body);
  const timestamp = options.timestamp ?? currentNow.getTime().toString();
  const nonce = crypto.randomUUID();
  const bodyHash = sha256Hex(rawBody);
  const payload = canonicalAuthPayload({
    method,
    path,
    bodyHash,
    timestamp,
    nonce,
    boardId: options.boardId ?? "board-1",
    agentId: options.agentId ?? "ironclaw",
    walletAddress: signer.walletAddress,
  });
  const signature = signer.keyPair.sign(new TextEncoder().encode(payload)).signature;

  return {
    rawBody,
    headers: {
      "content-type": "application/json",
      "x-clawhouse-wallet-address": signer.walletAddress,
      "x-clawhouse-public-key": signer.publicKey,
      "x-clawhouse-timestamp": timestamp,
      "x-clawhouse-nonce": nonce,
      "x-clawhouse-body-sha256": bodyHash,
      "x-clawhouse-signature": Buffer.from(signature).toString("base64url"),
    },
  };
}

function signAgentRequest(
  method: string,
  path: string,
  body: Record<string, unknown>,
  signer = agentWallet,
  options: {
    purpose: "agent_registration" | "board_registration" | "paper_account_registration" | "creator_onboarding_registration";
    boardId: string | null;
    agentId: string;
    agentPublicKey: string;
    timestamp?: string;
  },
) {
  const rawBody = JSON.stringify(body);
  const timestamp = options.timestamp ?? currentNow.getTime().toString();
  const nonce = crypto.randomUUID();
  const bodyHash = sha256Hex(rawBody);
  const payload = canonicalAgentAuthPayload({
    purpose: options.purpose,
    method,
    path,
    bodyHash,
    timestamp,
    nonce,
    boardId: options.boardId,
    agentId: options.agentId,
    agentPublicKey: options.agentPublicKey,
  });
  const signature = signer.keyPair.sign(new TextEncoder().encode(payload)).signature;

  return {
    rawBody,
    headers: {
      "x-clawhouse-agent-public-key": signer.publicKey,
      "x-clawhouse-agent-timestamp": timestamp,
      "x-clawhouse-agent-nonce": nonce,
      "x-clawhouse-agent-body-sha256": bodyHash,
      "x-clawhouse-agent-signature": Buffer.from(signature).toString("base64url"),
    },
  };
}

function cleanBodyString(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing ${name} in test body`);
  return value.trim();
}

function cleanOptionalBodyString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function createWallet() {
  const keyPair = KeyPair.fromRandom("ed25519");
  const publicKey = keyPair.getPublicKey().toString();

  return {
    keyPair,
    publicKey,
    walletAddress: keyToImplicitAddress(keyPair.getPublicKey()),
  };
}

function mockNearKeyMarketTx(input: {
  txHash: string;
  signerId: string;
  methodName: "buy_key" | "sell_key";
  side: "buy" | "sell";
  agentId: string;
  amount: string;
  totalCost: string;
  payout: string;
}) {
  return async (_request: string | URL | Request, init?: RequestInit) => {
    const rpcBody = JSON.parse(String(init?.body ?? "{}")) as { params?: unknown[] };
    expect(rpcBody.params).toEqual([input.txHash, input.signerId]);
    const args = {
      agent_id: input.agentId,
      amount: input.amount,
      ...(input.methodName === "buy_key" ? { max_price: input.totalCost } : { min_payout: input.payout }),
    };
    const trade = {
      agent_id: input.agentId,
      side: input.side,
      trader_id: input.signerId,
      amount: input.amount,
      supply_after: input.side === "buy" ? "2" : "1",
      trader_balance_after: input.side === "buy" ? "1" : "0",
      reserve_after: input.side === "buy" ? "50500000000000000000000" : "3700000000000000000000",
      price: "50500000000000000000000",
      protocol_fee: "2525000000000000000000",
      creator_fee: "2525000000000000000000",
      total_cost: input.totalCost,
      payout: input.payout,
    };

    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      result: {
        status: { SuccessValue: Buffer.from(JSON.stringify(trade)).toString("base64") },
        transaction: {
          signer_id: input.signerId,
          receiver_id: "clawhouse-key-20260619125948.testnet",
          actions: [{
            FunctionCall: {
              method_name: input.methodName,
              args: Buffer.from(JSON.stringify(args)).toString("base64"),
            },
          }],
        },
        transaction_outcome: {
          id: input.txHash,
          block_hash: "block-hash-1",
          outcome: { logs: [] },
        },
        receipts_outcome: [{
          id: "receipt-1",
          block_hash: "block-hash-1",
          outcome: {
            logs: [
              `EVENT_JSON:${JSON.stringify({
                standard: "clawhouse-key-market",
                version: "1.0.0",
                event: "key_trade",
                data: [trade],
              })}`,
            ],
          },
        }],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

async function jsonOf<T>(response: Response) {
  return (await response.json()) as T;
}

function columnNames(db: Database, table: string) {
  return db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function countRows(
  table:
    | "agent_registrations"
    | "boards"
    | "paper_accounts"
    | "holding_snapshots"
    | "pnl_snapshots"
    | "events"
    | "observations"
    | "balance_changes",
) {
  return sqliteDb.raw.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0;
}

function createFakeLedgerDb() {
  const runs: string[] = [];
  const state = { closed: false };
  const db: LedgerDb = {
    provider: "postgres",
    async get<T>() {
      return undefined as T | undefined;
    },
    async all<T>() {
      return [] as T[];
    },
    async run(sql: string) {
      runs.push(sql);
      return { changes: 0 };
    },
    async transaction<T>(callback: (tx: LedgerDb) => Promise<T>) {
      return await callback(db);
    },
    close() {
      state.closed = true;
    },
  };

  return {
    db,
    runs,
    get closed() {
      return state.closed;
    },
  };
}

function mockHyperliquidFetch(input: {
  meta: Array<{ name: string; maxLeverage: number }>;
  contexts: Array<{ markPx: string; oraclePx: string; funding: string }>;
  spotMeta?: Array<{ name: string; index: number }>;
  spotContexts?: Array<{ markPx?: string; midPx?: string; oraclePx?: string }>;
  books: Record<string, { bids: Array<{ px: string; sz: string; n: number }>; asks: Array<{ px: string; sz: string; n: number }> }>;
}) {
  return async (_request: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { type?: string; coin?: string };
    if (body.type === "metaAndAssetCtxs") {
      return new Response(JSON.stringify([{ universe: input.meta }, input.contexts]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (body.type === "spotMetaAndAssetCtxs") {
      return new Response(JSON.stringify([{ universe: input.spotMeta ?? [] }, input.spotContexts ?? []]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (body.type === "l2Book" && body.coin) {
      const book = input.books[body.coin.toUpperCase()];
      if (!book) {
        return new Response(JSON.stringify({ error: `missing book for ${body.coin}` }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        coin: body.coin.toUpperCase(),
        time: currentNow.getTime(),
        levels: [book.bids, book.asks],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "unsupported hyperliquid mock request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };
}

function nearViewResponse(value: unknown) {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: "clawhouse-agent-board-ledger",
    result: {
      block_hash: "near-block",
      block_height: 123,
      logs: [],
      result: Array.from(Buffer.from(JSON.stringify(value))),
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function nearRpcError(message: string) {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: "clawhouse-agent-board-ledger",
    error: { message },
  }), { status: 200, headers: { "content-type": "application/json" } });
}
