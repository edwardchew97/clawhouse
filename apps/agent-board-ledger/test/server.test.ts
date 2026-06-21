import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { KeyPair, keyToImplicitAddress } from "@near-js/crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, openRuntimeLedgerDb, openSqliteLedgerDb, type SqliteLedgerDb } from "../src/db";
import { ADMIN_TOKEN_ENV, canonicalAuthPayload, sha256Hex } from "../src/auth";
import { canonicalPaperAuthPayload } from "../src/paper-trading";
import { createApp } from "../src/server";
import { CRON_SECRET_ENV, handleVercelLedgerRequest } from "../src/vercel";

const adminToken = "ledger-admin-token";
const tempRoots: string[] = [];
let app: ReturnType<typeof createApp>;
let sqliteDb: SqliteLedgerDb;
let wallet: ReturnType<typeof createWallet>;
let currentNow: Date;
let currentRpcFetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "clawhouse-ledger-"));
  tempRoots.push(root);
  currentNow = new Date("2026-06-19T00:00:00.000Z");
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

  test("runtime DB requires a Neon/Postgres URL instead of falling back to SQLite", async () => {
    await expect(openRuntimeLedgerDb({})).rejects.toThrow(
      "Missing AGENT_BOARD_LEDGER_DATABASE_URL, DATABASE_URL, or ledgerDatabaseUrl; runtime storage must use Neon/Postgres",
    );
  });

  test("requires service authorization for board registration", async () => {
    const response = await postJson("/boards", {
      board_id: "board-1",
      agent_id: "ironclaw",
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
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
    }, { signed: true, signer: otherWallet });

    expect(response.status).toBe(401);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Wallet does not match board registration");
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
    const eventsResponse = await app.fetch(new Request("http://ledger.test/boards/board-1/events"));
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
      await app.fetch(new Request("http://ledger.test/boards/board-1/events")),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(secondBody.merged).toBe(true);
    expect(eventsBody.events).toHaveLength(1);
    expect(eventsBody.events[0].reason).toBe("First report.");
  });

  test("cron discovers unreported observations and creates a reasonless timeline event", async () => {
    await registerBoard();
    await postJson("/boards/board-1/observations", {
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
      await app.fetch(new Request("http://ledger.test/boards/board-1/events")),
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
    await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      current_value_usd: 112,
      client_event_id: "client-observed",
      tx_hash: "tx-observed",
    });

    const tickBody = await jsonOf<{ discoveredEvents: number; linkedObservations: number }>(
      await postJson("/cron/tick", {}),
    );
    const eventsBody = await jsonOf<{ events: Array<Record<string, any>> }>(
      await app.fetch(new Request("http://ledger.test/boards/board-1/events")),
    );

    expect(tickBody.discoveredEvents).toBe(0);
    expect(tickBody.linkedObservations).toBe(1);
    expect(eventsBody.events).toHaveLength(1);
    expect(eventsBody.events[0].reason).toBe("Agent already reported this trade.");
  });

  test("pnl excludes topups and adds withdrawals back", async () => {
    await registerBoard();
    await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:00:00.000Z",
      current_value_usd: 120,
      topup_usd: 20,
    });
    await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:01:00.000Z",
      current_value_usd: 130,
      withdrawal_usd: 5,
    });

    await postJson("/cron/tick", {});
    const pnlBody = await jsonOf<{ latest: Record<string, number> }>(
      await app.fetch(new Request("http://ledger.test/boards/board-1/pnl")),
    );
    const portfolioBody = await jsonOf<{ latest: Record<string, number> }>(
      await app.fetch(new Request("http://ledger.test/boards/board-1/portfolio")),
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
      await postJson("/boards/board-1/observations", {
        wallet_address: wallet.walletAddress,
        observed_at: "2026-06-19T00:00:00.000Z",
        current_value_usd: 110,
        tx_hash: "tx-priced",
      }),
    );
    await postJson("/boards/board-1/balance-changes", {
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
      await app.fetch(new Request("http://ledger.test/boards/board-1/pnl")),
    );
    const changesBody = await jsonOf<{ balance_changes: Array<Record<string, any>> }>(
      await app.fetch(new Request("http://ledger.test/boards/board-1/balance-changes")),
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
      await postJson("/boards/board-1/observations", {
        wallet_address: wallet.walletAddress,
        observed_at: "2026-06-19T00:00:00.000Z",
        current_value_usd: 999,
        tx_hash: "tx-reconciled",
      }),
    );
    await postJson("/boards/board-1/balance-changes", {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      normalized_amount: 55,
      delta_amount: 5,
      change_type: "trade",
      source_observation_id: observationBody.observation.id,
    });

    await postJson("/cron/tick", {});
    const pnlBody = await jsonOf<{ latest: Record<string, any> }>(
      await app.fetch(new Request("http://ledger.test/boards/board-1/pnl")),
    );
    const portfolioBody = await jsonOf<{ latest: Record<string, any> }>(
      await app.fetch(new Request("http://ledger.test/boards/board-1/portfolio")),
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
      await app.fetch(new Request("http://ledger.test/boards/board-1/pnl")),
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
      await app.fetch(new Request("http://ledger.test/boards/board-1/balance-changes")),
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
      await app.fetch(new Request("http://ledger.test/boards/board-1/pnl")),
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
      await postJson("/boards/board-1/observations", {
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
    await postJson("/boards/board-1/balance-changes", {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      normalized_amount: 100,
      change_type: "periodic_balance",
      source_observation_id: observationBody.observation.id,
    });

    await postJson("/cron/tick", {});
    const pnlBody = await jsonOf<{ latest: Record<string, any> }>(
      await app.fetch(new Request("http://ledger.test/boards/board-1/pnl")),
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
      await postJson("/boards/board-1/observations", {
        wallet_address: wallet.walletAddress,
        observed_at: "2026-06-19T00:00:00.000Z",
        current_value_usd: 100,
        tx_hash: "tx-conflict",
        status_claim: "filled",
      }),
    );
    await postJson("/boards/board-1/balance-changes", {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      normalized_amount: 100,
      delta_amount: 0,
      change_type: "no_change",
      source_observation_id: observationBody.observation.id,
    });

    await postJson("/cron/tick", {});
    const eventsBody = await jsonOf<{ events: Array<Record<string, any>> }>(
      await app.fetch(new Request("http://ledger.test/boards/board-1/events")),
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
      await postJson("/boards/board-1/observations", {
        wallet_address: wallet.walletAddress,
        observed_at: "2026-06-19T00:00:00.000Z",
        current_value_usd: 105,
        tx_hash: "tx-failed-conflict",
      }),
    );
    await postJson("/boards/board-1/balance-changes", {
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
      await app.fetch(new Request("http://ledger.test/boards/board-1/events")),
    );

    expect(tickBody.summary.statusConflicts).toBe(1);
    expect(tickBody.statusConflicts[0].conflict_type).toBe("failure_claim_with_balance_change");
    expect(eventsBody.events[0].attachments[0].metadata.conflict_type).toBe("failure_claim_with_balance_change");
  });

  test("cron does not duplicate snapshots when the latest observation was already snapshotted", async () => {
    await registerBoard();
    await postJson("/boards/board-1/observations", {
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
      await app.fetch(new Request("http://ledger.test/boards/board-1/pnl")),
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
    await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:00:00.000Z",
      current_value_usd: 104,
      tx_hash: "tx-duplicate-observed",
    });
    await postJson("/boards/board-1/observations", {
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
      await app.fetch(new Request("http://ledger.test/boards/board-1/events")),
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
    await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:00:00.000Z",
      current_value_usd: 130,
      tx_hash: "tx-peak",
    });
    await postJson("/cron/tick", {});

    currentNow = new Date("2026-06-19T00:02:00.000Z");
    await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:02:00.000Z",
      current_value_usd: 110,
      tx_hash: "tx-drawdown",
    });

    const tickBody = await jsonOf<{ snapshots: Array<Record<string, any>> }>(
      await postJson("/cron/tick", {}),
    );
    const pnlBody = await jsonOf<{ latest: Record<string, any> }>(
      await app.fetch(new Request("http://ledger.test/boards/board-1/pnl")),
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

  test("requires service authorization for observations and cron", async () => {
    await registerBoard();

    const observation = await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      current_value_usd: 110,
    }, { admin: false });
    const cron = await postJson("/cron/tick", {}, { admin: false });

    expect(observation.status).toBe(401);
    expect((await jsonOf<{ error: string }>(observation)).error).toBe("Missing service authorization");
    expect(cron.status).toBe(401);
    expect((await jsonOf<{ error: string }>(cron)).error).toBe("Missing service authorization");
  });

  test("normalizes Vercel /api routes before calling the ledger app", async () => {
    const response = await handleVercelLedgerRequest(
      new Request("http://ledger.test/api/ledger?ledgerPath=/health"),
      { db: sqliteDb, env: { [ADMIN_TOKEN_ENV]: adminToken } },
    );

    expect(response.status).toBe(200);
    expect(await jsonOf<{ ok: true; service: string; db: string }>(response)).toEqual({ ok: true, service: "agent-board-ledger", db: "ready" });
  });

  test("normalizes Vercel wildcard rewrites without breaking board registration", async () => {
    const body = {
      board_id: "board-1",
      agent_id: "ironclaw",
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
      base_currency: "USD",
      public_status: "active",
      visibility_mode: "public",
    };
    const signed = signRequest("POST", "/boards", body, wallet, { timestamp: Date.now().toString() });
    const response = await handleVercelLedgerRequest(
      new Request("http://ledger.test/api/ledger?ledgerPath=/boards/", {
        method: "POST",
        headers: {
          ...signed.headers,
          authorization: `Bearer ${adminToken}`,
        },
        body: signed.rawBody,
      }),
      { db: sqliteDb, env: { [ADMIN_TOKEN_ENV]: adminToken } },
    );

    expect(response.status).toBe(201);
  });

  test("normalizes Vercel paper trading rewrites", async () => {
    const response = await handleVercelLedgerRequest(
      new Request("http://ledger.test/api/ledger?ledgerPath=/paper/accounts/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          paper_account_id: "paper-vercel",
          agent_id: "ironclaw",
          agent_public_key: wallet.publicKey,
          starting_balance_usd: 1000,
        }),
      }),
      { db: sqliteDb, env: { [ADMIN_TOKEN_ENV]: adminToken } },
    );
    expect(response.status).toBe(201);

    const read = await handleVercelLedgerRequest(
      new Request("http://ledger.test/api/ledger?ledgerPath=/paper/accounts/paper-vercel/"),
      { db: sqliteDb, env: { [ADMIN_TOKEN_ENV]: adminToken } },
    );
    const body = await jsonOf<{ account: { id: string } }>(read);

    expect(read.status).toBe(200);
    expect(body.account.id).toBe("paper-vercel");
  });

  test("rejects Vercel cron requests without the cron secret", async () => {
    const response = await handleVercelLedgerRequest(
      new Request("http://ledger.test/api/cron", {
        headers: { authorization: "Bearer wrong" },
      }),
      {
        db: sqliteDb,
        env: {
          [ADMIN_TOKEN_ENV]: adminToken,
          [CRON_SECRET_ENV]: "cron-secret",
        },
      },
    );

    expect(response.status).toBe(401);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Unauthorized cron request");
  });

  test("lets Vercel cron GET trigger the existing service-authorized cron tick", async () => {
    await registerBoard();
    await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      current_value_usd: 110,
      tx_hash: "tx-vercel-cron",
      status_claim: "observed_on_wallet",
    });

    const response = await handleVercelLedgerRequest(
      new Request("http://ledger.test/api/cron", {
        headers: { authorization: "Bearer cron-secret" },
      }),
      {
        db: sqliteDb,
        env: {
          [ADMIN_TOKEN_ENV]: adminToken,
          [CRON_SECRET_ENV]: "cron-secret",
        },
      },
    );
    const body = await jsonOf<{ discoveredEvents: number }>(response);

    expect(response.status).toBe(200);
    expect(body.discoveredEvents).toBe(1);
    expect(countRows("events")).toBe(1);
  });

  test("passes Vercel env into the cron NEAR account watcher", async () => {
    const seenRpcBodies: Array<Record<string, any>> = [];
    await registerBoard();

    const response = await handleVercelLedgerRequest(
      new Request("http://ledger.test/api/cron", {
        headers: { authorization: "Bearer cron-secret" },
      }),
      {
        db: sqliteDb,
        env: {
          [ADMIN_TOKEN_ENV]: adminToken,
          [CRON_SECRET_ENV]: "cron-secret",
          AGENT_BOARD_LEDGER_NEAR_RPC_URL: "https://rpc.testnet.near.org",
        },
        rpcFetch: async (_input, init) => {
          const rpcBody = JSON.parse(String(init?.body));
          seenRpcBodies.push(rpcBody);
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: "clawhouse-agent-board-ledger",
            result: {
              amount: "175000000000000000000000000",
              locked: "0",
              block_hash: "near-vercel-cron-block",
              block_height: 789,
              storage_usage: 101,
            },
          }), { status: 200, headers: { "content-type": "application/json" } });
        },
      },
    );
    const body = await jsonOf<{
      nearAccountWatch: { status: string; attempted: number; checked: number; failed: number };
    }>(response);

    expect(response.status).toBe(200);
    expect(body.nearAccountWatch).toMatchObject({
      status: "checked",
      attempted: 1,
      checked: 1,
      failed: 0,
    });
    expect(seenRpcBodies).toHaveLength(1);
    expect(seenRpcBodies[0]?.params.account_id).toBe(wallet.walletAddress);
    expect(countRows("balance_changes")).toBe(1);
  });

  test("requires an explicit observation wallet address", async () => {
    await registerBoard();

    const response = await postJson("/boards/board-1/observations", {
      current_value_usd: 110,
    });

    expect(response.status).toBe(400);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Missing wallet_address");
  });

  test("rejects future observations beyond the allowed clock skew", async () => {
    await registerBoard();

    const response = await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      observed_at: "2026-06-19T00:02:01.000Z",
      current_value_usd: 110,
    });

    expect(response.status).toBe(400);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("observed_at cannot be more than 60 seconds in the future");
  });

  test("rejects invalid production accounting numbers", async () => {
    const zeroStart = await postJson("/paper/accounts", {
      paper_account_id: "paper-zero",
      agent_id: "ironclaw",
      agent_public_key: wallet.publicKey,
      starting_balance_usd: 0,
    });
    expect(zeroStart.status).toBe(400);
    expect((await jsonOf<{ error: string }>(zeroStart)).error).toBe("starting_balance_usd must be greater than 0");

    await registerBoard();
    const negativeCurrentValue = await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      current_value_usd: -1,
    });
    const negativeTopup = await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      current_value_usd: 110,
      topup_usd: -1,
    });
    const negativeWithdrawal = await postJson("/boards/board-1/observations", {
      wallet_address: wallet.walletAddress,
      current_value_usd: 110,
      withdrawal_usd: -1,
    });

    expect(negativeCurrentValue.status).toBe(400);
    expect((await jsonOf<{ error: string }>(negativeCurrentValue)).error).toBe("current_value_usd must be greater than or equal to 0");
    expect(negativeTopup.status).toBe(400);
    expect((await jsonOf<{ error: string }>(negativeTopup)).error).toBe("topup_usd must be greater than or equal to 0");
    expect(negativeWithdrawal.status).toBe(400);
    expect((await jsonOf<{ error: string }>(negativeWithdrawal)).error).toBe("withdrawal_usd must be greater than or equal to 0");
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
    wallet_address: wallet.walletAddress,
    public_key: wallet.publicKey,
    base_currency: "USD",
    public_status: "active",
    visibility_mode: "public",
    ...boardOverrides,
  };
  const response = await postJson("/boards", body, { signed: true });

  expect(response.status).toBe(201);
  const board = (await jsonOf<{ board: Record<string, any> }>(response)).board;
  const paperResponse = await postJson("/paper/accounts", {
    paper_account_id: `paper-${body.board_id}`,
    board_id: body.board_id,
    agent_id: body.agent_id,
    agent_public_key: wallet.publicKey,
    starting_balance_usd: paperStartingBalanceUsd,
    allowed_markets: ["BTC", "ETH"],
  });
  expect(paperResponse.status).toBe(201);
  return board;
}

async function registerPaperAccount(overrides: Record<string, unknown> = {}) {
  const response = await postJson("/paper/accounts", {
    paper_account_id: "paper-1",
    agent_id: "ironclaw",
    agent_public_key: wallet.publicKey,
    starting_balance_usd: 1000,
    allowed_markets: ["BTC", "ETH"],
    ...overrides,
  });
  expect(response.status).toBe(201);
  return (await jsonOf<{ account: Record<string, any> }>(response)).account;
}

async function createPaperMarketSnapshot(overrides: Record<string, unknown>) {
  const response = await postJson("/paper/market-snapshots", {
    source: "hyperliquid-test-fixture",
    maintenance_margin_rate: 0.005,
    observed_at: currentNow.toISOString(),
    ...overrides,
  });
  expect(response.status).toBe(201);
  return (await jsonOf<{ snapshot: Record<string, any> }>(response)).snapshot;
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  options: { admin?: boolean; signed?: boolean; signer?: ReturnType<typeof createWallet> } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.admin !== false) {
    headers.authorization = `Bearer ${adminToken}`;
  }
  if (options.signed) {
    Object.assign(headers, signRequest("POST", path, body, options.signer ?? wallet, {
      boardId: cleanBodyString(body.board_id ?? body.boardId, "board_id"),
      agentId: cleanBodyString(body.agent_id ?? body.agentId, "agent_id"),
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

async function paperSignedPost(path: string, body: Record<string, unknown>, signer = wallet) {
  const rawBody = JSON.stringify(body);
  const timestamp = currentNow.getTime().toString();
  const nonce = crypto.randomUUID();
  const bodyHash = sha256Hex(rawBody);
  const paperAccountId = cleanBodyString(body.paper_account_id ?? body.paperAccountId, "paper_account_id");
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

function cleanBodyString(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing ${name} in test body`);
  return value.trim();
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

async function jsonOf<T>(response: Response) {
  return (await response.json()) as T;
}

function columnNames(db: Database, table: string) {
  return db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function countRows(table: "holding_snapshots" | "pnl_snapshots" | "events" | "observations" | "balance_changes") {
  return sqliteDb.raw.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0;
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
