import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { KeyPair, keyToImplicitAddress } from "@near-js/crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, openRuntimeLedgerDb, openSqliteLedgerDb, type SqliteLedgerDb } from "../src/db";
import { canonicalAuthPayload, sha256Hex } from "../src/auth";
import { createApp } from "../src/server";

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
    expect(board.starting_value_usd).toBe(100);
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
    for (const column of ["chain", "venue_namespace", "tracking_started_at", "owner_wallet_address", "funding_source"]) {
      expect(columnNames(legacy, "boards")).toContain(column);
    }
    for (const column of ["agent_id", "holding_snapshot_id", "price_snapshot_id", "total_pnl_pct", "drawdown_pct", "staleness_status"]) {
      expect(columnNames(legacy, "pnl_snapshots")).toContain(column);
    }
    expect(columnNames(legacy, "events")).toContain("reported_at");

    const board = legacy.query<Record<string, any>, []>("SELECT * FROM boards WHERE id = 'board-legacy'").get();
    const trackedWallet = legacy
      .query<Record<string, any>, []>("SELECT * FROM tracked_wallets WHERE board_id = 'board-legacy'")
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
      starting_value_usd: 100,
    }, { admin: false });

    expect(response.status).toBe(401);
    expect((await jsonOf<{ error: string }>(response)).error).toBe("Missing service authorization");
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
    await registerBoard({ starting_value_usd: 100 });
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
    expect((pnlBody.latest as Record<string, any>).completeness_status).toBe("no_activity_identifier");
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
    await registerBoard({ starting_value_usd: 100 });

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
    await registerBoard({ starting_value_usd: 100 });

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
    expect(allowed.status).toBe(200);
    expect(allowedBody.events[0].reason).toBe("Holder-gated reason.");
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

  test("marks fully priced periodic balance snapshots complete without a transaction id", async () => {
    await registerBoard({ starting_value_usd: 100 });
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
    expect(firstTick.snapshots[0].completeness_status).toBe("complete");
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
    const zeroStart = await postJson("/boards", {
      board_id: "board-zero",
      agent_id: "ironclaw",
      wallet_address: wallet.walletAddress,
      public_key: wallet.publicKey,
      starting_value_usd: 0,
    });
    expect(zeroStart.status).toBe(400);
    expect((await jsonOf<{ error: string }>(zeroStart)).error).toBe("starting_value_usd must be greater than 0");

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
});

async function registerBoard(overrides: Record<string, unknown> = {}) {
  const response = await postJson("/boards", {
    board_id: "board-1",
    agent_id: "ironclaw",
    wallet_address: wallet.walletAddress,
    public_key: wallet.publicKey,
    starting_value_usd: 100,
    base_currency: "USD",
    public_status: "active",
    visibility_mode: "public",
    ...overrides,
  });

  expect(response.status).toBe(201);
  return (await jsonOf<{ board: Record<string, any> }>(response)).board;
}

async function postJson(path: string, body: unknown, options: { admin?: boolean } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.admin !== false) {
    headers.authorization = `Bearer ${adminToken}`;
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

function signRequest(
  method: string,
  path: string,
  body: Record<string, unknown>,
  signer = wallet,
  options: { timestamp?: string } = {},
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
    boardId: "board-1",
    agentId: "ironclaw",
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

function countRows(table: "holding_snapshots" | "pnl_snapshots" | "events" | "observations") {
  return sqliteDb.raw.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0;
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
