import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { KeyPair, keyToImplicitAddress } from "@near-js/crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLedgerDb } from "../src/db";
import { canonicalAuthPayload, sha256Hex } from "../src/auth";
import { createApp } from "../src/server";

const tempRoots: string[] = [];
let app: ReturnType<typeof createApp>;
let wallet: ReturnType<typeof createWallet>;
let currentNow: Date;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "clawhouse-ledger-"));
  tempRoots.push(root);
  currentNow = new Date("2026-06-19T00:00:00.000Z");
  app = createApp({
    db: openLedgerDb(join(root, "ledger.sqlite")),
    now: () => currentNow,
  });
  wallet = createWallet();
});

afterEach(async () => {
  app.db.close();
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

    expect(board.id).toBe("board-1");
    expect(board.wallet_address).toBe(wallet.walletAddress);
    expect(board.starting_value_usd).toBe(100);
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
    expect(body.event.reason).toContain("Momentum");
    expect(body.event.metadata).toEqual({ venue: "near-intents" });
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
  });

  test("cron links observations to already reported events without counting a new discovery", async () => {
    await registerBoard();
    await signedFetch("POST", "/boards/board-1/events", {
      client_event_id: "client-observed",
      tx_hash: "tx-observed",
      reason: "Agent already reported this trade.",
    });
    await postJson("/boards/board-1/observations", {
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
      observed_at: "2026-06-19T00:00:00.000Z",
      current_value_usd: 120,
      topup_usd: 20,
    });
    await postJson("/boards/board-1/observations", {
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
    expect(portfolioBody.latest.current_value_usd).toBe(130);
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

async function postJson(path: string, body: unknown) {
  return await app.fetch(new Request(`http://ledger.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
