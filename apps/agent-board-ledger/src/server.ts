import type { Database } from "bun:sqlite";
import { cleanString, defaultDbPath, findEventByAssociations, getBoard, latestHoldingSnapshot, latestObservation, latestPnlSnapshot, listAttachments, listEvents, newId, openLedgerDb, requiredNumber, requiredString, RequestError } from "./db";
import { AuthError, canonicalAuthPayload, readSignedHeaders, sha256Hex, timestampIsFresh, verifySignature } from "./auth";
import type { Board, EventRow, JsonObject, ObservationRow } from "./types";

type AppOptions = {
  db?: Database;
  now?: () => Date;
};

type RouteContext = {
  params: Record<string, string>;
  path: string;
};

const attachmentTypes = new Set([
  "reason",
  "correction",
  "retraction",
  "investigation",
  "analysis",
]);

export function createApp(options: AppOptions = {}) {
  const db = options.db ?? openLedgerDb();
  const currentDate = () => (options.now ? options.now() : new Date());
  const now = () => currentDate().toISOString();

  return {
    db,
    async fetch(request: Request) {
      try {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method.toUpperCase();

        if (method === "GET" && path === "/health") {
          return json({ ok: true, service: "agent-board-ledger", dbPath: defaultDbPath() });
        }

        const boardMatch = path.match(/^\/boards\/([^/]+)$/);
        const eventsMatch = path.match(/^\/boards\/([^/]+)\/events$/);
        const attachmentMatch = path.match(/^\/boards\/([^/]+)\/events\/([^/]+)\/attachments$/);
        const observationsMatch = path.match(/^\/boards\/([^/]+)\/observations$/);
        const portfolioMatch = path.match(/^\/boards\/([^/]+)\/portfolio$/);
        const pnlMatch = path.match(/^\/boards\/([^/]+)\/pnl$/);

        if (method === "POST" && path === "/boards") {
          return json(createBoard(db, await readBody(request), now()), 201);
        }
        if (method === "GET" && boardMatch) {
          return json(requireBoard(db, boardMatch[1]));
        }
        if (method === "POST" && eventsMatch) {
          return json(
            createEvent(db, request, await readBody(request), {
              params: { boardId: eventsMatch[1] },
              path,
            }, now()),
            201,
          );
        }
        if (method === "POST" && attachmentMatch) {
          return json(
            createAttachment(db, request, await readBody(request), {
              params: { boardId: attachmentMatch[1], eventId: attachmentMatch[2] },
              path,
            }, now()),
            201,
          );
        }
        if (method === "POST" && observationsMatch) {
          return json(createObservation(db, await readBody(request), observationsMatch[1], now()), 201);
        }
        if (method === "POST" && path === "/cron/tick") {
          return json(runCronTick(db, now()));
        }
        if (method === "GET" && eventsMatch) {
          return json({ events: listEventTimeline(db, eventsMatch[1]) });
        }
        if (method === "GET" && portfolioMatch) {
          return json(readPortfolio(db, portfolioMatch[1]));
        }
        if (method === "GET" && pnlMatch) {
          return json(readPnl(db, pnlMatch[1]));
        }

        return json({ ok: false, error: "Not found" }, 404);
      } catch (error) {
        return handleError(error);
      }
    },
  };
}

function createBoard(db: Database, body: BodyResult, createdAt: string) {
  const data = asObject(body.json);
  const id = cleanString(data.boardId) ?? cleanString(data.board_id) ?? newId("board");
  const board: Board = {
    id,
    agent_id: requiredString(data.agentId ?? data.agent_id, "agent_id"),
    wallet_address: requiredString(data.walletAddress ?? data.wallet_address, "wallet_address"),
    public_key: requiredString(data.publicKey ?? data.public_key, "public_key"),
    starting_value_usd: requiredNumber(data.startingValueUsd ?? data.starting_value_usd, "starting_value_usd"),
    base_currency: cleanString(data.baseCurrency ?? data.base_currency) ?? "USD",
    public_status: cleanString(data.publicStatus ?? data.public_status) ?? "draft",
    visibility_mode: cleanString(data.visibilityMode ?? data.visibility_mode) ?? "private",
    created_at: createdAt,
  };

  db.query(
    `INSERT INTO boards
      (id, agent_id, wallet_address, public_key, starting_value_usd, base_currency, public_status, visibility_mode, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    board.id,
    board.agent_id,
    board.wallet_address,
    board.public_key,
    board.starting_value_usd,
    board.base_currency,
    board.public_status,
    board.visibility_mode,
    board.created_at,
  );

  return { ok: true, board };
}

function createEvent(
  db: Database,
  request: Request,
  body: BodyResult,
  context: RouteContext,
  createdAt: string,
) {
  const board = requireBoard(db, context.params.boardId);
  assertSignedRequest(db, request, body.raw, context.path, board, Date.parse(createdAt), createdAt);
  const data = asObject(body.json);
  const existing = findEventByAssociations(db, board.id, data);

  if (existing) {
    return { ok: true, merged: true, event: presentEvent(db, existing) };
  }

  const event: EventRow = {
    id: newId("evt"),
    board_id: board.id,
    agent_id: board.agent_id,
    wallet_address: board.wallet_address,
    event_type: cleanString(data.eventType ?? data.event_type) ?? "agent_reported",
    client_event_id: cleanString(data.clientEventId ?? data.client_event_id),
    tx_hash: cleanString(data.txHash ?? data.tx_hash),
    intent_id: cleanString(data.intentId ?? data.intent_id),
    status_claim: cleanString(data.statusClaim ?? data.status_claim),
    asset_in: cleanString(data.assetIn ?? data.asset_in),
    amount_in: optionalNumberField(data.amountIn ?? data.amount_in, "amount_in"),
    asset_out: cleanString(data.assetOut ?? data.asset_out),
    amount_out: optionalNumberField(data.amountOut ?? data.amount_out, "amount_out"),
    reason: cleanString(data.reason),
    metadata_json: stringifyOptional(data.metadata),
    created_at: createdAt,
  };

  insertEvent(db, event);
  return { ok: true, merged: false, event: presentEvent(db, event) };
}

function createAttachment(
  db: Database,
  request: Request,
  body: BodyResult,
  context: RouteContext,
  createdAt: string,
) {
  const board = requireBoard(db, context.params.boardId);
  assertSignedRequest(db, request, body.raw, context.path, board, Date.parse(createdAt), createdAt);

  const event = db
    .query<EventRow, [string, string]>("SELECT * FROM events WHERE board_id = ? AND id = ?")
    .get(board.id, context.params.eventId);
  if (!event) throw new RequestError("Event not found", 404);

  const data = asObject(body.json);
  const attachmentType = cleanString(data.attachmentType ?? data.attachment_type ?? data.type) ?? "reason";
  if (!attachmentTypes.has(attachmentType)) {
    throw new RequestError("Invalid attachment_type", 400);
  }

  const attachment = {
    id: newId("att"),
    event_id: event.id,
    board_id: board.id,
    attachment_type: attachmentType,
    reason: cleanString(data.reason ?? data.note),
    metadata_json: stringifyOptional(data.metadata),
    created_at: createdAt,
  };

  db.query(
    `INSERT INTO attachments
      (id, event_id, board_id, attachment_type, reason, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    attachment.id,
    attachment.event_id,
    attachment.board_id,
    attachment.attachment_type,
    attachment.reason,
    attachment.metadata_json,
    attachment.created_at,
  );

  return { ok: true, attachment };
}

function createObservation(db: Database, body: BodyResult, boardId: string, createdAt: string) {
  const board = requireBoard(db, boardId);
  const data = asObject(body.json);
  const walletAddress = cleanString(data.walletAddress ?? data.wallet_address) ?? board.wallet_address;

  if (walletAddress !== board.wallet_address) {
    throw new RequestError("Observation wallet is not bound to board", 403);
  }

  const observation: ObservationRow = {
    id: newId("obs"),
    board_id: board.id,
    wallet_address: walletAddress,
    observed_at: cleanString(data.observedAt ?? data.observed_at) ?? createdAt,
    current_value_usd: requiredNumber(data.currentValueUsd ?? data.current_value_usd, "current_value_usd"),
    topup_usd: optionalNumberField(data.topupUsd ?? data.topup_usd, "topup_usd") ?? 0,
    withdrawal_usd: optionalNumberField(data.withdrawalUsd ?? data.withdrawal_usd, "withdrawal_usd") ?? 0,
    client_event_id: cleanString(data.clientEventId ?? data.client_event_id),
    tx_hash: cleanString(data.txHash ?? data.tx_hash),
    intent_id: cleanString(data.intentId ?? data.intent_id),
    status_claim: cleanString(data.statusClaim ?? data.status_claim),
    asset_in: cleanString(data.assetIn ?? data.asset_in),
    amount_in: optionalNumberField(data.amountIn ?? data.amount_in, "amount_in"),
    asset_out: cleanString(data.assetOut ?? data.asset_out),
    amount_out: optionalNumberField(data.amountOut ?? data.amount_out, "amount_out"),
    metadata_json: stringifyOptional(data.metadata),
    event_id: null,
    created_at: createdAt,
  };

  db.query(
    `INSERT INTO observations
      (id, board_id, wallet_address, observed_at, current_value_usd, topup_usd, withdrawal_usd, client_event_id,
       tx_hash, intent_id, status_claim, asset_in, amount_in, asset_out, amount_out, metadata_json, event_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  );

  return { ok: true, observation };
}

function runCronTick(db: Database, createdAt: string) {
  const observations = db
    .query<ObservationRow, []>("SELECT * FROM observations WHERE event_id IS NULL ORDER BY observed_at ASC, id ASC")
    .all();
  const discoveredEvents: EventRow[] = [];
  let linkedObservations = 0;

  for (const observation of observations) {
    const result = discoverEventForObservation(db, observation, createdAt);
    if (!result) continue;
    linkedObservations += 1;
    if (result.created) discoveredEvents.push(result.event);
  }

  const boards = db.query<Board, []>("SELECT * FROM boards ORDER BY created_at ASC").all();
  const snapshots = [];

  for (const board of boards) {
    const observation = latestObservation(db, board.id);
    if (!observation) continue;

    const totals = db
      .query<{ topups: number | null; withdrawals: number | null }, [string]>(
        "SELECT SUM(topup_usd) AS topups, SUM(withdrawal_usd) AS withdrawals FROM observations WHERE board_id = ?",
      )
      .get(board.id);
    const netTopups = totals?.topups ?? 0;
    const netWithdrawals = totals?.withdrawals ?? 0;
    const pnlUsd = observation.current_value_usd - board.starting_value_usd - netTopups + netWithdrawals;
    const holdingId = newId("hold");
    const pnlId = newId("pnl");

    db.query(
      `INSERT INTO holding_snapshots
        (id, board_id, wallet_address, observed_at, current_value_usd, source_observation_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      holdingId,
      board.id,
      board.wallet_address,
      observation.observed_at,
      observation.current_value_usd,
      observation.id,
      createdAt,
    );
    db.query(
      `INSERT INTO pnl_snapshots
        (id, board_id, observed_at, starting_value_usd, current_value_usd, net_topups_usd, net_withdrawals_usd, pnl_usd, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      pnlId,
      board.id,
      observation.observed_at,
      board.starting_value_usd,
      observation.current_value_usd,
      netTopups,
      netWithdrawals,
      pnlUsd,
      createdAt,
    );

    snapshots.push({
      board_id: board.id,
      holding_snapshot_id: holdingId,
      pnl_snapshot_id: pnlId,
      current_value_usd: observation.current_value_usd,
      net_topups_usd: netTopups,
      net_withdrawals_usd: netWithdrawals,
      pnl_usd: pnlUsd,
    });
  }

  return {
    ok: true,
    discoveredEvents: discoveredEvents.length,
    linkedObservations,
    snapshots,
  };
}

function discoverEventForObservation(db: Database, observation: ObservationRow, createdAt: string) {
  const hasActivityId = observation.client_event_id || observation.tx_hash || observation.intent_id;
  if (!hasActivityId) return undefined;

  let event = findEventByAssociations(db, observation.board_id, observation);
  let created = false;
  if (!event) {
    const board = requireBoard(db, observation.board_id);
    event = {
      id: newId("evt"),
      board_id: observation.board_id,
      agent_id: board.agent_id,
      wallet_address: observation.wallet_address,
      event_type: "discovered_without_reason",
      client_event_id: observation.client_event_id,
      tx_hash: observation.tx_hash,
      intent_id: observation.intent_id,
      status_claim: observation.status_claim,
      asset_in: observation.asset_in,
      amount_in: observation.amount_in,
      asset_out: observation.asset_out,
      amount_out: observation.amount_out,
      reason: null,
      metadata_json: observation.metadata_json,
      created_at: createdAt,
    };
    insertEvent(db, event);
    created = true;
  }

  db.query("UPDATE observations SET event_id = ? WHERE id = ?").run(event.id, observation.id);
  return { event, created };
}

function readPortfolio(db: Database, boardId: string) {
  const board = requireBoard(db, boardId);
  return {
    ok: true,
    board_id: board.id,
    wallet_address: board.wallet_address,
    latest: latestHoldingSnapshot(db, board.id),
  };
}

function readPnl(db: Database, boardId: string) {
  const board = requireBoard(db, boardId);
  return {
    ok: true,
    board_id: board.id,
    latest: latestPnlSnapshot(db, board.id),
  };
}

function listEventTimeline(db: Database, boardId: string) {
  requireBoard(db, boardId);
  return listEvents(db, boardId).map((event) => presentEvent(db, event));
}

function presentEvent(db: Database, event: EventRow) {
  return {
    ...event,
    metadata: parseJson(event.metadata_json),
    attachments: listAttachments(db, event.id).map((attachment) => ({
      ...attachment,
      metadata: parseJson(attachment.metadata_json),
    })),
  };
}

function requireBoard(db: Database, boardId: string) {
  const board = getBoard(db, boardId);
  if (!board) throw new RequestError("Board not found", 404);
  return board;
}

function assertSignedRequest(
  db: Database,
  request: Request,
  rawBody: string,
  path: string,
  board: Board,
  nowMs: number,
  createdAt: string,
) {
  const headers = readSignedHeaders(request.headers);

  if (headers.walletAddress !== board.wallet_address) {
    throw new AuthError("Wallet is not bound to board");
  }
  if (headers.publicKey !== board.public_key) {
    throw new AuthError("Public key is not bound to board");
  }

  const actualBodyHash = sha256Hex(rawBody);
  if (headers.bodyHash !== actualBodyHash) {
    throw new AuthError("Body hash mismatch");
  }
  if (!timestampIsFresh(headers.timestamp, nowMs)) {
    throw new AuthError("Signature timestamp is stale");
  }

  const payload = canonicalAuthPayload({
    method: request.method,
    path,
    bodyHash: actualBodyHash,
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    boardId: board.id,
    agentId: board.agent_id,
    walletAddress: headers.walletAddress,
  });

  if (!verifySignature(headers.publicKey, payload, headers.signature)) {
    throw new AuthError("Invalid signature");
  }

  try {
    db.query(
      "INSERT INTO auth_nonces (id, board_id, wallet_address, nonce, timestamp, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(newId("nonce"), board.id, board.wallet_address, headers.nonce, headers.timestamp, createdAt);
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("UNIQUE constraint failed"))) {
      throw error;
    }
    throw new AuthError("Nonce replay rejected");
  }
}

function insertEvent(db: Database, event: EventRow) {
  db.query(
    `INSERT INTO events
      (id, board_id, agent_id, wallet_address, event_type, client_event_id, tx_hash, intent_id, status_claim,
       asset_in, amount_in, asset_out, amount_out, reason, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.board_id,
    event.agent_id,
    event.wallet_address,
    event.event_type,
    event.client_event_id,
    event.tx_hash,
    event.intent_id,
    event.status_claim,
    event.asset_in,
    event.amount_in,
    event.asset_out,
    event.amount_out,
    event.reason,
    event.metadata_json,
    event.created_at,
  );
}

type BodyResult = {
  raw: string;
  json: unknown;
};

async function readBody(request: Request): Promise<BodyResult> {
  const raw = await request.text();
  if (raw === "") return { raw, json: {} };

  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    throw new RequestError("Request body must be valid JSON", 400);
  }
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("Request body must be a JSON object", 400);
  }
  return value as JsonObject;
}

function optionalNumberField(value: unknown, name: string) {
  return requiredOrOptionalNumber(value, name, false);
}

function requiredOrOptionalNumber(value: unknown, name: string, required: boolean) {
  if (!required && (value === undefined || value === null || value === "")) return null;
  return requiredNumber(value, name);
}

function stringifyOptional(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function handleError(error: unknown) {
  if (error instanceof AuthError || error instanceof RequestError) {
    return json({ ok: false, error: error.message }, error.status);
  }
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
    return json({ ok: false, error: "Duplicate record" }, 409);
  }
  return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
}

if (import.meta.main) {
  const port = Number(process.env.AGENT_BOARD_LEDGER_PORT ?? 4321);
  const app = createApp();
  Bun.serve({
    port,
    fetch: app.fetch,
  });
  console.log(`[agent-board-ledger] listening on http://127.0.0.1:${port}`);
}
