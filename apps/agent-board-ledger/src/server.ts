import { cleanString, findEventByAssociations, getBoard, latestHoldingSnapshot, latestObservation, latestPnlSnapshot, listAttachments, listEvents, newId, openRuntimeLedgerDb, requiredNumber, requiredString, RequestError, type LedgerDb } from "./db.js";
import { ADMIN_TOKEN_ENV, AuthError, ServiceAuthError, assertServiceBearer, canonicalAuthPayload, readSignedHeaders, sha256Hex, timestampIsFresh, verifySignature } from "./auth.js";
import type { BalanceChangeRow, Board, EventRow, HoldingSnapshot, JsonObject, ObservationRow, PnlSnapshot, PriceSnapshotRow, ReadAccessCheckRow } from "./types.js";

type AppOptions = {
  db: LedgerDb;
  now?: () => Date;
  adminToken?: string;
  rpcFetch?: FetchLike;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

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
  "summary",
  "operator_note",
]);

const OBSERVATION_FUTURE_SKEW_MS = 60 * 1000;
const YOCTO_NEAR_PER_NEAR = 1e24;

export function createApp(options: AppOptions) {
  const db = options.db;
  const currentDate = () => (options.now ? options.now() : new Date());
  const now = () => currentDate().toISOString();
  const adminToken = options.adminToken ?? process.env[ADMIN_TOKEN_ENV];
  const rpcFetch = options.rpcFetch ?? fetch;

  return {
    db,
    async fetch(request: Request) {
      try {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method.toUpperCase();

        if (method === "GET" && path === "/health") {
          return json(await readHealth(db));
        }

        const boardMatch = path.match(/^\/boards\/([^/]+)$/);
        const eventsMatch = path.match(/^\/boards\/([^/]+)\/events$/);
        const attachmentMatch = path.match(/^\/boards\/([^/]+)\/events\/([^/]+)\/attachments$/);
        const observationsMatch = path.match(/^\/boards\/([^/]+)\/observations$/);
        const balanceChangesMatch = path.match(/^\/boards\/([^/]+)\/balance-changes$/);
        const pricesMatch = path.match(/^\/boards\/([^/]+)\/prices$/);
        const readAccessChecksMatch = path.match(/^\/boards\/([^/]+)\/read-access\/checks$/);
        const nearKeyMarketReadAccessMatch = path.match(/^\/boards\/([^/]+)\/read-access\/near-key-market$/);
        const nearAccountWatchMatch = path.match(/^\/boards\/([^/]+)\/watch\/near-account$/);
        const nearFtWatchMatch = path.match(/^\/boards\/([^/]+)\/watch\/near-ft$/);
        const portfolioMatch = path.match(/^\/boards\/([^/]+)\/portfolio$/);
        const pnlMatch = path.match(/^\/boards\/([^/]+)\/pnl$/);

        if (method === "POST" && path === "/boards") {
          assertServiceBearer(request.headers, adminToken);
          return json(await createBoard(db, await readBody(request), now()), 201);
        }
        if (method === "GET" && boardMatch) {
          const board = await requireBoard(db, boardMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "public_summary");
          return json(board);
        }
        if (method === "POST" && eventsMatch) {
          return json(
            await createEvent(db, request, await readBody(request), {
              params: { boardId: eventsMatch[1] },
              path,
            }, now()),
            201,
          );
        }
        if (method === "POST" && attachmentMatch) {
          return json(
            await createAttachment(db, request, await readBody(request), {
              params: { boardId: attachmentMatch[1], eventId: attachmentMatch[2] },
              path,
            }, now()),
            201,
          );
        }
        if (method === "POST" && observationsMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await createObservation(db, await readBody(request), observationsMatch[1], now()), 201);
        }
        if (method === "POST" && balanceChangesMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await createBalanceChanges(db, await readBody(request), balanceChangesMatch[1], now()), 201);
        }
        if (method === "GET" && balanceChangesMatch) {
          const board = await requireBoard(db, balanceChangesMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "key_holder_detail");
          return json({ ok: true, board_id: board.id, balance_changes: await listBalanceChanges(db, board.id) });
        }
        if (method === "POST" && pricesMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await createPriceSnapshots(db, await readBody(request), pricesMatch[1], now()), 201);
        }
        if (method === "GET" && pricesMatch) {
          const board = await requireBoard(db, pricesMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "key_holder_detail");
          return json({ ok: true, board_id: board.id, prices: await listPriceSnapshots(db, board.id) });
        }
        if (method === "POST" && readAccessChecksMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await createReadAccessCheck(db, await readBody(request), readAccessChecksMatch[1], now()), 201);
        }
        if (method === "POST" && nearKeyMarketReadAccessMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await checkNearKeyMarketReadAccess(db, rpcFetch, await readBody(request), nearKeyMarketReadAccessMatch[1], now()), 201);
        }
        if (method === "POST" && nearAccountWatchMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await runNearAccountWatch(db, rpcFetch, await readBody(request), nearAccountWatchMatch[1], now()), 201);
        }
        if (method === "POST" && nearFtWatchMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await runNearFtWatch(db, rpcFetch, await readBody(request), nearFtWatchMatch[1], now()), 201);
        }
        if (method === "POST" && path === "/cron/tick") {
          assertServiceBearer(request.headers, adminToken);
          return json(await runCronTick(db, now()));
        }
        if (method === "GET" && eventsMatch) {
          const board = await requireBoard(db, eventsMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "key_holder_detail");
          return json({ events: await listEventTimeline(db, board.id) });
        }
        if (method === "GET" && portfolioMatch) {
          const board = await requireBoard(db, portfolioMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "key_holder_detail");
          return json(await readPortfolio(db, board.id));
        }
        if (method === "GET" && pnlMatch) {
          const board = await requireBoard(db, pnlMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "key_holder_detail");
          return json(await readPnl(db, board.id));
        }

        return json({ ok: false, error: "Not found" }, 404);
      } catch (error) {
        return handleError(error);
      }
    },
  };
}

async function readHealth(db: LedgerDb) {
  const ready = await db.get<{ ready: number }>("SELECT 1 AS ready");
  if (!ready) throw new RequestError("Database readiness check failed", 503);
  return { ok: true, service: "agent-board-ledger", db: "ready" };
}

async function createBoard(db: LedgerDb, body: BodyResult, createdAt: string) {
  const data = asObject(body.json);
  const id = cleanString(data.boardId) ?? cleanString(data.board_id) ?? newId("board");
  const board: Board = {
    id,
    agent_id: requiredString(data.agentId ?? data.agent_id, "agent_id"),
    wallet_address: requiredString(data.walletAddress ?? data.wallet_address, "wallet_address"),
    public_key: requiredString(data.publicKey ?? data.public_key, "public_key"),
    chain: cleanString(data.chain) ?? "near",
    venue_namespace: cleanString(data.venueNamespace ?? data.venue_namespace) ?? "near-intents",
    tracking_started_at: normalizedTimestampField(data.trackingStartedAt ?? data.tracking_started_at, createdAt, "tracking_started_at"),
    starting_value_usd: requiredPositiveNumberField(data.startingValueUsd ?? data.starting_value_usd, "starting_value_usd"),
    base_currency: cleanString(data.baseCurrency ?? data.base_currency) ?? "USD",
    public_status: cleanString(data.publicStatus ?? data.public_status) ?? "draft",
    visibility_mode: cleanString(data.visibilityMode ?? data.visibility_mode) ?? "private",
    owner_wallet_address: cleanString(data.ownerWalletAddress ?? data.owner_wallet_address),
    funding_source: cleanString(data.fundingSource ?? data.funding_source),
    funding_tx_hash: cleanString(data.fundingTxHash ?? data.funding_tx_hash),
    metadata_json: stringifyOptional(data.metadata),
    created_at: createdAt,
  };

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO boards
        (id, agent_id, wallet_address, public_key, chain, venue_namespace, tracking_started_at,
         starting_value_usd, base_currency, public_status, visibility_mode, owner_wallet_address,
         funding_source, funding_tx_hash, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        board.id,
        board.agent_id,
        board.wallet_address,
        board.public_key,
        board.chain,
        board.venue_namespace,
        board.tracking_started_at,
        board.starting_value_usd,
        board.base_currency,
        board.public_status,
        board.visibility_mode,
        board.owner_wallet_address,
        board.funding_source,
        board.funding_tx_hash,
        board.metadata_json,
        board.created_at,
      ],
    );
    await tx.run(
      `INSERT INTO tracked_wallets
        (id, board_id, agent_id, wallet_address, public_key, chain, venue_namespace,
         tracking_started_at, tracking_status, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (board_id, wallet_address) DO NOTHING`,
      [
        `tw_${board.id}`,
        board.id,
        board.agent_id,
        board.wallet_address,
        board.public_key,
        board.chain,
        board.venue_namespace,
        board.tracking_started_at,
        "active",
        "board_registration",
        board.created_at,
      ],
    );
  });

  return { ok: true, board };
}

async function createEvent(
  db: LedgerDb,
  request: Request,
  body: BodyResult,
  context: RouteContext,
  createdAt: string,
) {
  const board = await requireBoard(db, context.params.boardId);
  await assertSignedRequest(db, request, body.raw, context.path, board, Date.parse(createdAt), createdAt);
  const data = asObject(body.json);
  const existing = await findEventByAssociations(db, board.id, data);

  if (existing) {
    return { ok: true, merged: true, event: await presentEvent(db, existing) };
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
    amount_in: optionalNonNegativeNumberField(data.amountIn ?? data.amount_in, "amount_in"),
    asset_out: cleanString(data.assetOut ?? data.asset_out),
    amount_out: optionalNonNegativeNumberField(data.amountOut ?? data.amount_out, "amount_out"),
    reason: cleanString(data.reason),
    metadata_json: stringifyOptional(data.metadata),
    reported_at: normalizedTimestampField(data.reportedAt ?? data.reported_at, createdAt, "reported_at"),
    created_at: createdAt,
  };

  await insertEvent(db, event);
  return { ok: true, merged: false, event: await presentEvent(db, event) };
}

async function createAttachment(
  db: LedgerDb,
  request: Request,
  body: BodyResult,
  context: RouteContext,
  createdAt: string,
) {
  const board = await requireBoard(db, context.params.boardId);
  await assertSignedRequest(db, request, body.raw, context.path, board, Date.parse(createdAt), createdAt);

  const event = await db.get<EventRow>("SELECT * FROM events WHERE board_id = ? AND id = ?", [
    board.id,
    context.params.eventId,
  ]);
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

  await db.run(
    `INSERT INTO attachments
      (id, event_id, board_id, attachment_type, reason, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
    attachment.id,
    attachment.event_id,
    attachment.board_id,
    attachment.attachment_type,
    attachment.reason,
    attachment.metadata_json,
    attachment.created_at,
    ],
  );

  return { ok: true, attachment };
}

async function createObservation(db: LedgerDb, body: BodyResult, boardId: string, createdAt: string) {
  const board = await requireBoard(db, boardId);
  const data = asObject(body.json);
  const walletAddress = requiredString(data.walletAddress ?? data.wallet_address, "wallet_address");

  if (walletAddress !== board.wallet_address) {
    throw new RequestError("Observation wallet is not bound to board", 403);
  }

  const observation: ObservationRow = {
    id: newId("obs"),
    board_id: board.id,
    wallet_address: walletAddress,
    observed_at: normalizedObservedAt(data.observedAt ?? data.observed_at, createdAt),
    current_value_usd: requiredNonNegativeNumberField(data.currentValueUsd ?? data.current_value_usd, "current_value_usd"),
    topup_usd: optionalNonNegativeNumberField(data.topupUsd ?? data.topup_usd, "topup_usd") ?? 0,
    withdrawal_usd: optionalNonNegativeNumberField(data.withdrawalUsd ?? data.withdrawal_usd, "withdrawal_usd") ?? 0,
    client_event_id: cleanString(data.clientEventId ?? data.client_event_id),
    tx_hash: cleanString(data.txHash ?? data.tx_hash),
    intent_id: cleanString(data.intentId ?? data.intent_id),
    status_claim: cleanString(data.statusClaim ?? data.status_claim),
    asset_in: cleanString(data.assetIn ?? data.asset_in),
    amount_in: optionalNonNegativeNumberField(data.amountIn ?? data.amount_in, "amount_in"),
    asset_out: cleanString(data.assetOut ?? data.asset_out),
    amount_out: optionalNonNegativeNumberField(data.amountOut ?? data.amount_out, "amount_out"),
    metadata_json: stringifyOptional(data.metadata),
    event_id: null,
    created_at: createdAt,
  };

  await insertObservation(db, observation);
  return { ok: true, observation };
}

async function insertObservation(db: LedgerDb, observation: ObservationRow) {
  await db.run(
    `INSERT INTO observations
      (id, board_id, wallet_address, observed_at, current_value_usd, topup_usd, withdrawal_usd, client_event_id,
       tx_hash, intent_id, status_claim, asset_in, amount_in, asset_out, amount_out, metadata_json, event_id, created_at)
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
}

async function createBalanceChanges(db: LedgerDb, body: BodyResult, boardId: string, createdAt: string) {
  const board = await requireBoard(db, boardId);
  const data = asObject(body.json);
  const inputChanges = Array.isArray(data.changes) ? data.changes : [data];
  const changes: BalanceChangeRow[] = [];
  for (const value of inputChanges) {
    const item = asObject(value);
    const observedAt = normalizedObservedAt(item.observedAt ?? item.observed_at, createdAt);
    const walletAddress = cleanString(item.walletAddress ?? item.wallet_address) ?? board.wallet_address;
    if (walletAddress !== board.wallet_address) {
      throw new RequestError("Balance change wallet is not bound to board", 403);
    }
    changes.push({
      id: newId("bal"),
      board_id: board.id,
      tracked_wallet_id: await trackedWalletId(db, board.id, walletAddress),
      wallet_address: walletAddress,
      observed_at: observedAt,
      asset_id: requiredString(item.assetId ?? item.asset_id, "asset_id"),
      asset_symbol: cleanString(item.assetSymbol ?? item.asset_symbol),
      raw_amount: cleanString(item.rawAmount ?? item.raw_amount),
      normalized_amount: optionalNumberField(item.normalizedAmount ?? item.normalized_amount, "normalized_amount"),
      decimals: optionalIntegerField(item.decimals, "decimals"),
      delta_amount: optionalNumberField(item.deltaAmount ?? item.delta_amount, "delta_amount"),
      delta_value_usd: optionalNumberField(item.deltaValueUsd ?? item.delta_value_usd, "delta_value_usd"),
      change_type: cleanString(item.changeType ?? item.change_type) ?? "unknown_change",
      source_observation_id: cleanString(item.sourceObservationId ?? item.source_observation_id),
      source_event_id: cleanString(item.sourceEventId ?? item.source_event_id),
      tx_hash: cleanString(item.txHash ?? item.tx_hash),
      intent_id: cleanString(item.intentId ?? item.intent_id),
      visibility_status: cleanString(item.visibilityStatus ?? item.visibility_status) ?? "complete",
      metadata_json: stringifyOptional(item.metadata),
      created_at: createdAt,
    });
  }

  for (const change of changes) await insertBalanceChange(db, change);
  return { ok: true, board_id: board.id, balance_changes: changes.map(presentBalanceChange) };
}

async function createPriceSnapshots(db: LedgerDb, body: BodyResult, boardId: string, createdAt: string) {
  const board = await requireBoard(db, boardId);
  const data = asObject(body.json);
  const inputSnapshots = Array.isArray(data.prices) ? data.prices : Array.isArray(data.snapshots) ? data.snapshots : [data];
  const prices = inputSnapshots.map((value) => {
    const item = asObject(value);
    return {
      id: newId("price"),
      board_id: board.id,
      asset_id: requiredString(item.assetId ?? item.asset_id, "asset_id"),
      asset_symbol: cleanString(item.assetSymbol ?? item.asset_symbol),
      price_usd: optionalNonNegativeNumberField(item.priceUsd ?? item.price_usd, "price_usd"),
      price_source: requiredString(item.priceSource ?? item.price_source, "price_source"),
      observed_at: normalizedObservedAt(item.observedAt ?? item.observed_at, createdAt),
      staleness_status: cleanString(item.stalenessStatus ?? item.staleness_status) ?? "fresh",
      metadata_json: stringifyOptional(item.metadata),
      created_at: createdAt,
    } satisfies PriceSnapshotRow;
  });

  for (const price of prices) await insertPriceSnapshot(db, price);
  return { ok: true, board_id: board.id, prices: prices.map(presentPriceSnapshot) };
}

async function createReadAccessCheck(db: LedgerDb, body: BodyResult, boardId: string, createdAt: string) {
  const board = await requireBoard(db, boardId);
  const data = asObject(body.json);
  const accessResult = cleanString(data.accessResult ?? data.access_result) ?? "granted";
  const accessLevel = normalizeAccessLevel(data.accessLevel ?? data.access_level);
  const readToken = cleanString(data.readToken ?? data.read_token);
  const metadata = asOptionalObject(data.metadata);
  const expiresAt = cleanString(data.expiresAt ?? data.expires_at) ?? cleanString(metadata.expires_at);

  if (accessResult === "granted" && accessLevel !== "public_summary" && !readToken) {
    throw new RequestError("Missing read_token for granted non-public read access", 400);
  }
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
    throw new RequestError("Invalid expires_at", 400);
  }

  const check: ReadAccessCheckRow = {
    id: newId("read"),
    board_id: board.id,
    requester_wallet_address: cleanString(data.requesterWalletAddress ?? data.requester_wallet_address),
    access_level: accessLevel,
    access_result: accessResult,
    reason: cleanString(data.reason),
    key_contract_id: cleanString(data.keyContractId ?? data.key_contract_id),
    checked_at: normalizedTimestampField(data.checkedAt ?? data.checked_at, createdAt, "checked_at"),
    metadata_json: JSON.stringify({
      ...metadata,
      expires_at: expiresAt,
      read_token_sha256: readToken ? sha256Hex(readToken) : null,
    }),
    created_at: createdAt,
  };

  await insertReadAccessCheck(db, check);
  return { ok: true, check: presentReadAccessCheck(check) };
}

async function checkNearKeyMarketReadAccess(
  db: LedgerDb,
  rpcFetch: FetchLike,
  body: BodyResult,
  boardId: string,
  createdAt: string,
) {
  const board = await requireBoard(db, boardId);
  const data = asObject(body.json);
  const rpcUrl = requiredString(data.rpcUrl ?? data.rpc_url ?? process.env.AGENT_BOARD_LEDGER_NEAR_RPC_URL, "rpc_url");
  const keyContractId = requiredString(data.keyContractId ?? data.key_contract_id, "key_contract_id");
  const holderAccountId = requiredString(data.holderAccountId ?? data.holder_account_id ?? data.requesterWalletAddress ?? data.requester_wallet_address, "holder_account_id");
  const agentId = cleanString(data.agentId ?? data.agent_id) ?? board.agent_id;
  const readToken = cleanString(data.readToken ?? data.read_token);
  const accessLevel = normalizeAccessLevel(data.accessLevel ?? data.access_level);
  const checkedAt = normalizedTimestampField(data.checkedAt ?? data.checked_at, createdAt, "checked_at");
  const rawBalance = await viewNearKeyMarketBalance(rpcFetch, rpcUrl, keyContractId, agentId, holderAccountId);
  const holderBalance = rawBalance === null ? "0" : decimalIntegerString(rawBalance, "holder_key_balance");
  const accessResult = BigInt(holderBalance) > 0n ? "granted" : "denied";
  const metadata = asOptionalObject(data.metadata);
  const expiresAt = cleanString(data.expiresAt ?? data.expires_at) ?? cleanString(metadata.expires_at);

  if (accessResult === "granted" && accessLevel !== "public_summary" && !readToken) {
    throw new RequestError("Missing read_token for granted key-holder read access", 400);
  }
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
    throw new RequestError("Invalid expires_at", 400);
  }

  const check: ReadAccessCheckRow = {
    id: newId("read"),
    board_id: board.id,
    requester_wallet_address: holderAccountId,
    access_level: accessLevel,
    access_result: accessResult,
    reason: accessResult === "granted" ? "key_holder_balance_positive" : "key_holder_balance_zero",
    key_contract_id: keyContractId,
    checked_at: checkedAt,
    metadata_json: JSON.stringify({
      ...metadata,
      agent_id: agentId,
      holder_key_balance: holderBalance,
      expires_at: expiresAt,
      read_token_sha256: readToken ? sha256Hex(readToken) : null,
    }),
    created_at: createdAt,
  };

  await insertReadAccessCheck(db, check);
  return {
    ok: true,
    board_id: board.id,
    holder_account_id: holderAccountId,
    holder_key_balance: holderBalance,
    access_result: accessResult,
    check: presentReadAccessCheck(check),
  };
}

async function runNearAccountWatch(
  db: LedgerDb,
  rpcFetch: FetchLike,
  body: BodyResult,
  boardId: string,
  createdAt: string,
) {
  const board = await requireBoard(db, boardId);
  const data = asObject(body.json);
  const rpcUrl = requiredString(data.rpcUrl ?? data.rpc_url ?? process.env.AGENT_BOARD_LEDGER_NEAR_RPC_URL, "rpc_url");
  const observedAt = normalizedObservedAt(data.observedAt ?? data.observed_at, createdAt);
  const account = await viewNearAccount(rpcFetch, rpcUrl, board.wallet_address);
  const normalizedNear = Number(account.amount) / YOCTO_NEAR_PER_NEAR;
  if (!Number.isFinite(normalizedNear)) {
    throw new RequestError("NEAR account balance is too large to normalize safely", 502);
  }

  const priceUsd = optionalNonNegativeNumberField(data.priceUsd ?? data.price_usd, "price_usd");
  const previous = await latestBalanceChangeForAsset(db, board.id, "native:near");
  const previousAmount = previous?.normalized_amount ?? null;
  const deltaAmount = previousAmount === null ? null : normalizedNear - previousAmount;
  const currentValueUsd = priceUsd === null ? null : normalizedNear * priceUsd;
  const price = priceUsd === null ? null : ({
    id: newId("price"),
    board_id: board.id,
    asset_id: "native:near",
    asset_symbol: "NEAR",
    price_usd: priceUsd,
    price_source: cleanString(data.priceSource ?? data.price_source) ?? "watcher_input",
    observed_at: observedAt,
    staleness_status: cleanString(data.stalenessStatus ?? data.staleness_status) ?? "fresh",
    metadata_json: stringifyOptional({ source: "near_rpc_account_watch", rpc_url: rpcUrl }),
    created_at: createdAt,
  } satisfies PriceSnapshotRow);

  if (price) await insertPriceSnapshot(db, price);

  const observation: ObservationRow | null = currentValueUsd === null ? null : {
    id: newId("obs"),
    board_id: board.id,
    wallet_address: board.wallet_address,
    observed_at: observedAt,
    current_value_usd: currentValueUsd,
    topup_usd: optionalNonNegativeNumberField(data.topupUsd ?? data.topup_usd, "topup_usd") ?? 0,
    withdrawal_usd: optionalNonNegativeNumberField(data.withdrawalUsd ?? data.withdrawal_usd, "withdrawal_usd") ?? 0,
    client_event_id: cleanString(data.clientEventId ?? data.client_event_id),
    tx_hash: cleanString(data.txHash ?? data.tx_hash),
    intent_id: cleanString(data.intentId ?? data.intent_id),
    status_claim: cleanString(data.statusClaim ?? data.status_claim) ?? "observed_on_near_rpc",
    asset_in: null,
    amount_in: null,
    asset_out: "NEAR",
    amount_out: normalizedNear,
    metadata_json: stringifyOptional({
      source: "near_rpc_account_watch",
      block_hash: account.block_hash,
      block_height: account.block_height,
      storage_usage: account.storage_usage,
    }),
    event_id: null,
    created_at: createdAt,
  };

  if (observation) await insertObservation(db, observation);

  const change: BalanceChangeRow = {
    id: newId("bal"),
    board_id: board.id,
    tracked_wallet_id: await trackedWalletId(db, board.id, board.wallet_address),
    wallet_address: board.wallet_address,
    observed_at: observedAt,
    asset_id: "native:near",
    asset_symbol: "NEAR",
    raw_amount: account.amount,
    normalized_amount: normalizedNear,
    decimals: 24,
    delta_amount: deltaAmount,
    delta_value_usd: deltaAmount === null || priceUsd === null ? null : deltaAmount * priceUsd,
    change_type: cleanString(data.changeType ?? data.change_type) ?? classifyNearBalanceChange(deltaAmount),
    source_observation_id: observation?.id ?? null,
    source_event_id: null,
    tx_hash: cleanString(data.txHash ?? data.tx_hash),
    intent_id: cleanString(data.intentId ?? data.intent_id),
    visibility_status: priceUsd === null ? "missing_price" : "complete",
    metadata_json: stringifyOptional({
      source: "near_rpc_account_watch",
      rpc_url: rpcUrl,
      block_hash: account.block_hash,
      block_height: account.block_height,
    }),
    created_at: createdAt,
  };
  await insertBalanceChange(db, change);

  return {
    ok: true,
    board_id: board.id,
    account,
    price: price ? presentPriceSnapshot(price) : null,
    observation,
    balance_change: presentBalanceChange(change),
    completeness_status: priceUsd === null ? "missing_price" : "complete",
  };
}

async function runNearFtWatch(
  db: LedgerDb,
  rpcFetch: FetchLike,
  body: BodyResult,
  boardId: string,
  createdAt: string,
) {
  const board = await requireBoard(db, boardId);
  const data = asObject(body.json);
  const rpcUrl = requiredString(data.rpcUrl ?? data.rpc_url ?? process.env.AGENT_BOARD_LEDGER_NEAR_RPC_URL, "rpc_url");
  const tokenContractId = requiredString(
    data.tokenContractId ?? data.token_contract_id ?? data.contractId ?? data.contract_id,
    "token_contract_id",
  );
  const observedAt = normalizedObservedAt(data.observedAt ?? data.observed_at, createdAt);
  const suppliedDecimals = optionalIntegerField(data.decimals, "decimals");
  const suppliedSymbol = cleanString(data.assetSymbol ?? data.asset_symbol);
  const metadata = suppliedDecimals === null
    ? await viewNearFtMetadata(rpcFetch, rpcUrl, tokenContractId)
    : null;
  const decimals = suppliedDecimals ?? metadata?.decimals;
  if (decimals === undefined) throw new RequestError("Missing FT decimals", 400);
  assertTokenDecimals(decimals);

  const assetSymbol = suppliedSymbol ?? metadata?.symbol ?? tokenContractId;
  const assetId = cleanString(data.assetId ?? data.asset_id) ?? `ft:${tokenContractId}`;
  const rawBalance = await viewNearFtBalance(rpcFetch, rpcUrl, tokenContractId, board.wallet_address);
  const normalizedAmount = decimalAmountFromRaw(rawBalance, decimals);
  const priceUsd = optionalNonNegativeNumberField(data.priceUsd ?? data.price_usd, "price_usd");
  const currentValueUsd = optionalNonNegativeNumberField(data.currentValueUsd ?? data.current_value_usd, "current_value_usd")
    ?? (priceUsd === null ? null : normalizedAmount * priceUsd);
  const previous = await latestBalanceChangeForAsset(db, board.id, assetId);
  const previousAmount = previous?.normalized_amount ?? null;
  const deltaAmount = previousAmount === null ? null : normalizedAmount - previousAmount;
  const price = priceUsd === null ? null : ({
    id: newId("price"),
    board_id: board.id,
    asset_id: assetId,
    asset_symbol: assetSymbol,
    price_usd: priceUsd,
    price_source: cleanString(data.priceSource ?? data.price_source) ?? "watcher_input",
    observed_at: observedAt,
    staleness_status: cleanString(data.stalenessStatus ?? data.staleness_status) ?? "fresh",
    metadata_json: stringifyOptional({
      source: "near_rpc_ft_watch",
      rpc_url: rpcUrl,
      token_contract_id: tokenContractId,
    }),
    created_at: createdAt,
  } satisfies PriceSnapshotRow);

  if (price) await insertPriceSnapshot(db, price);

  const observation: ObservationRow | null = currentValueUsd === null ? null : {
    id: newId("obs"),
    board_id: board.id,
    wallet_address: board.wallet_address,
    observed_at: observedAt,
    current_value_usd: currentValueUsd,
    topup_usd: optionalNonNegativeNumberField(data.topupUsd ?? data.topup_usd, "topup_usd") ?? 0,
    withdrawal_usd: optionalNonNegativeNumberField(data.withdrawalUsd ?? data.withdrawal_usd, "withdrawal_usd") ?? 0,
    client_event_id: cleanString(data.clientEventId ?? data.client_event_id),
    tx_hash: cleanString(data.txHash ?? data.tx_hash),
    intent_id: cleanString(data.intentId ?? data.intent_id),
    status_claim: cleanString(data.statusClaim ?? data.status_claim) ?? "observed_on_near_rpc",
    asset_in: null,
    amount_in: null,
    asset_out: assetSymbol,
    amount_out: normalizedAmount,
    metadata_json: stringifyOptional({
      source: "near_rpc_ft_watch",
      token_contract_id: tokenContractId,
      portfolio_scope: data.currentValueUsd !== undefined || data.current_value_usd !== undefined
        ? "caller_supplied_board_value"
        : "single_asset_value",
    }),
    event_id: null,
    created_at: createdAt,
  };

  if (observation) await insertObservation(db, observation);

  const change: BalanceChangeRow = {
    id: newId("bal"),
    board_id: board.id,
    tracked_wallet_id: await trackedWalletId(db, board.id, board.wallet_address),
    wallet_address: board.wallet_address,
    observed_at: observedAt,
    asset_id: assetId,
    asset_symbol: assetSymbol,
    raw_amount: rawBalance,
    normalized_amount: normalizedAmount,
    decimals,
    delta_amount: deltaAmount,
    delta_value_usd: deltaAmount === null || priceUsd === null ? null : deltaAmount * priceUsd,
    change_type: cleanString(data.changeType ?? data.change_type) ?? classifyNearBalanceChange(deltaAmount),
    source_observation_id: observation?.id ?? null,
    source_event_id: null,
    tx_hash: cleanString(data.txHash ?? data.tx_hash),
    intent_id: cleanString(data.intentId ?? data.intent_id),
    visibility_status: priceUsd === null ? "missing_price" : "complete",
    metadata_json: stringifyOptional({
      source: "near_rpc_ft_watch",
      rpc_url: rpcUrl,
      token_contract_id: tokenContractId,
      metadata,
    }),
    created_at: createdAt,
  };
  await insertBalanceChange(db, change);

  return {
    ok: true,
    board_id: board.id,
    token_contract_id: tokenContractId,
    metadata,
    raw_balance: rawBalance,
    normalized_amount: normalizedAmount,
    price: price ? presentPriceSnapshot(price) : null,
    observation,
    balance_change: presentBalanceChange(change),
    completeness_status: priceUsd === null ? "missing_price" : "complete",
  };
}

async function runCronTick(db: LedgerDb, createdAt: string) {
  return await db.transaction(async (tx) => {
    const observations = await tx.all<ObservationRow>(
      "SELECT * FROM observations WHERE event_id IS NULL ORDER BY observed_at ASC, id ASC",
    );
    const discoveredEvents: EventRow[] = [];
    let linkedObservations = 0;
    let observationsWithoutActivityId = 0;
    let observationsAlreadyLinked = 0;

    for (const observation of observations) {
      const result = await discoverEventForObservation(tx, observation, createdAt);
      if (result.skipped === "no_activity_id") observationsWithoutActivityId += 1;
      if (result.skipped === "already_linked") observationsAlreadyLinked += 1;
      if (!result.linked) continue;
      linkedObservations += 1;
      if (result.created && result.event) discoveredEvents.push(result.event);
    }

    const boards = await tx.all<Board>("SELECT * FROM boards ORDER BY created_at ASC");
    const snapshots = [];
    const alreadySnapshotted = [];
    const boardsWithoutObservations = [];

    for (const board of boards) {
      const observation = await latestObservation(tx, board.id);
      if (!observation) {
        boardsWithoutObservations.push({ board_id: board.id });
        continue;
      }

      const existingHolding = await findHoldingSnapshotByObservation(tx, observation.id);
      if (existingHolding) {
        const existingPnl = await findPnlSnapshotByHolding(tx, existingHolding.id);
        // Holding and PnL inserts are atomic in this tick; a null PnL here means out-of-band DB corruption.
        alreadySnapshotted.push({
          board_id: board.id,
          reason: "latest_observation_already_snapshotted",
          source_observation_id: observation.id,
          observed_at: observation.observed_at,
          holding_snapshot_id: existingHolding.id,
          pnl_snapshot_id: existingPnl?.id ?? null,
        });
        continue;
      }

      const totals = await tx.get<{ topups: number | null; withdrawals: number | null }>(
        "SELECT SUM(topup_usd) AS topups, SUM(withdrawal_usd) AS withdrawals FROM observations WHERE board_id = ?",
        [board.id],
      );
      const netTopups = totals?.topups ?? 0;
      const netWithdrawals = totals?.withdrawals ?? 0;
      const pnlUsd = observation.current_value_usd - board.starting_value_usd - netTopups + netWithdrawals;
      const totalPnlPct = board.starting_value_usd > 0 ? pnlUsd / board.starting_value_usd : null;
      const previousHighWater = await latestHighWaterMark(tx, board.id);
      const highWaterMarkUsd = Math.max(previousHighWater ?? observation.current_value_usd, observation.current_value_usd);
      const drawdownPct = highWaterMarkUsd > 0 ? (highWaterMarkUsd - observation.current_value_usd) / highWaterMarkUsd : 0;
      const eventCounts = await pnlEventCounts(tx, board.id);
      const accountingStatus = await accountingStatusForObservation(tx, board.id, observation.id, observation.observed_at);
      const completenessStatus = combineCompletenessStatus(pnlCompletenessStatus(observation), accountingStatus.completenessStatus);
      const holdingId = newId("hold");
      const pnlId = newId("pnl");

      await tx.run(
        `INSERT INTO holding_snapshots
          (id, board_id, wallet_address, observed_at, current_value_usd, source_observation_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
        holdingId,
        board.id,
        board.wallet_address,
        observation.observed_at,
        observation.current_value_usd,
        observation.id,
        createdAt,
        ],
      );
      await tx.run(
        `INSERT INTO pnl_snapshots
          (id, board_id, agent_id, observed_at, starting_value_usd, current_value_usd, net_topups_usd,
           net_withdrawals_usd, pnl_usd, holding_snapshot_id, price_snapshot_id, total_pnl_pct,
           drawdown_pct, high_water_mark_usd, observed_trade_count, failed_event_count,
           reason_missing_count, staleness_status, completeness_status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
        pnlId,
        board.id,
        board.agent_id,
        observation.observed_at,
        board.starting_value_usd,
        observation.current_value_usd,
        netTopups,
        netWithdrawals,
        pnlUsd,
        holdingId,
        accountingStatus.priceSnapshotId,
        totalPnlPct,
        drawdownPct,
        highWaterMarkUsd,
        eventCounts.observed_trade_count ?? 0,
        eventCounts.failed_event_count ?? 0,
        eventCounts.reason_missing_count ?? 0,
        accountingStatus.stalenessStatus,
        completenessStatus,
        createdAt,
        ],
      );

      snapshots.push({
        board_id: board.id,
        source_observation_id: observation.id,
        observed_at: observation.observed_at,
        holding_snapshot_id: holdingId,
        pnl_snapshot_id: pnlId,
        current_value_usd: observation.current_value_usd,
        net_topups_usd: netTopups,
        net_withdrawals_usd: netWithdrawals,
        pnl_usd: pnlUsd,
        total_pnl_pct: totalPnlPct,
        drawdown_pct: drawdownPct,
        high_water_mark_usd: highWaterMarkUsd,
        price_snapshot_id: accountingStatus.priceSnapshotId,
        observed_trade_count: eventCounts.observed_trade_count,
        failed_event_count: eventCounts.failed_event_count,
        reason_missing_count: eventCounts.reason_missing_count,
        staleness_status: accountingStatus.stalenessStatus,
        completeness_status: completenessStatus,
      });
    }

    const noNewData = linkedObservations === 0 && snapshots.length === 0;

    return {
      ok: true,
      status: noNewData ? "no_new_data" : "updated",
      discoveredEvents: discoveredEvents.length,
      linkedObservations,
      snapshots,
      alreadySnapshotted,
      boardsWithoutObservations,
      summary: {
        observationsChecked: observations.length,
        observationsWithoutActivityId,
        observationsAlreadyLinked,
        snapshotsCreated: snapshots.length,
        snapshotsSkippedAlreadyCurrent: alreadySnapshotted.length,
        boardsWithoutObservations: boardsWithoutObservations.length,
        noNewData,
      },
    };
  });
}

async function discoverEventForObservation(db: LedgerDb, observation: ObservationRow, createdAt: string) {
  if (!hasActivityId(observation)) return { linked: false, created: false, skipped: "no_activity_id" as const };

  const currentObservation = await db.get<ObservationRow>(
    "SELECT * FROM observations WHERE id = ? AND event_id IS NULL",
    [observation.id],
  );
  if (!currentObservation) return { linked: false, created: false, skipped: "already_linked" as const };

  let event = await findEventByAssociations(db, currentObservation.board_id, currentObservation);
  let created = false;
  if (!event) {
    const board = await requireBoard(db, currentObservation.board_id);
    event = {
      id: newId("evt"),
      board_id: currentObservation.board_id,
      agent_id: board.agent_id,
      wallet_address: currentObservation.wallet_address,
      event_type: "discovered_without_reason",
      client_event_id: currentObservation.client_event_id,
      tx_hash: currentObservation.tx_hash,
      intent_id: currentObservation.intent_id,
      status_claim: currentObservation.status_claim,
      asset_in: currentObservation.asset_in,
      amount_in: currentObservation.amount_in,
      asset_out: currentObservation.asset_out,
      amount_out: currentObservation.amount_out,
      reason: null,
      metadata_json: currentObservation.metadata_json,
      reported_at: null,
      created_at: createdAt,
    };
    await insertEvent(db, event);
    created = true;
  }

  const result = await db.run("UPDATE observations SET event_id = ? WHERE id = ? AND event_id IS NULL", [
    event.id,
    currentObservation.id,
  ]);
  if (result.changes !== 1) return { linked: false, created: false, skipped: "already_linked" as const };
  return { event, created, linked: true, skipped: null };
}

function pnlCompletenessStatus(observation: ObservationRow) {
  if (observation.event_id) return "complete";
  if (!hasActivityId(observation)) return "no_activity_identifier";
  return "activity_unlinked";
}

function hasActivityId(observation: Pick<ObservationRow, "client_event_id" | "tx_hash" | "intent_id">) {
  return Boolean(observation.client_event_id || observation.tx_hash || observation.intent_id);
}

async function findHoldingSnapshotByObservation(db: LedgerDb, observationId: string) {
  return await db.get<HoldingSnapshot>(
    "SELECT * FROM holding_snapshots WHERE source_observation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    [observationId],
  );
}

async function findPnlSnapshotByHolding(db: LedgerDb, holdingSnapshotId: string) {
  return await db.get<PnlSnapshot>(
    "SELECT * FROM pnl_snapshots WHERE holding_snapshot_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    [holdingSnapshotId],
  );
}

async function latestHighWaterMark(db: LedgerDb, boardId: string) {
  return (await db.get<{ high_water_mark_usd: number | null }>(
    "SELECT MAX(high_water_mark_usd) AS high_water_mark_usd FROM pnl_snapshots WHERE board_id = ?",
    [boardId],
  ))?.high_water_mark_usd ?? null;
}

async function pnlEventCounts(db: LedgerDb, boardId: string) {
  const counts = await db.get<{
      observed_trade_count: number;
      failed_event_count: number;
      reason_missing_count: number;
    }>(
      `SELECT
        COUNT(*) AS observed_trade_count,
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(status_claim, '')) IN ('failed', 'failure', 'rejected', 'cancelled', 'canceled') THEN 1 ELSE 0 END), 0) AS failed_event_count,
        COALESCE(SUM(CASE WHEN reason IS NULL OR reason = '' THEN 1 ELSE 0 END), 0) AS reason_missing_count
       FROM events
       WHERE board_id = ?`,
      [boardId],
    );
  return {
    observed_trade_count: Number(counts?.observed_trade_count ?? 0),
    failed_event_count: Number(counts?.failed_event_count ?? 0),
    reason_missing_count: Number(counts?.reason_missing_count ?? 0),
  };
}

async function accountingStatusForObservation(db: LedgerDb, boardId: string, observationId: string, observedAt: string) {
  const changes = await db.all<BalanceChangeRow>(
    "SELECT * FROM balance_changes WHERE board_id = ? AND source_observation_id = ?",
    [boardId, observationId],
  );
  const price = await latestPriceSnapshotForBoard(db, boardId, observedAt);
  const limitedVisibility = changes.find((change) => change.visibility_status !== "complete");
  const missingPrice = changes.length > 0 && !price;
  const completeAccountedSnapshot = changes.length > 0 && !limitedVisibility && !missingPrice;

  return {
    priceSnapshotId: price?.id ?? null,
    stalenessStatus: price?.staleness_status ?? (changes.length > 0 ? "unknown" : "fresh"),
    completenessStatus: limitedVisibility?.visibility_status ?? (missingPrice ? "missing_price" : completeAccountedSnapshot ? "complete" : null),
  };
}

async function latestPriceSnapshotForBoard(db: LedgerDb, boardId: string, observedAt: string) {
  return await db.get<PriceSnapshotRow>(
    `SELECT * FROM price_snapshots
     WHERE board_id = ? AND observed_at <= ?
     ORDER BY observed_at DESC, created_at DESC, id DESC
     LIMIT 1`,
    [boardId, observedAt],
  );
}

async function latestBalanceChangeForAsset(db: LedgerDb, boardId: string, assetId: string) {
  return await db.get<BalanceChangeRow>(
    `SELECT * FROM balance_changes
     WHERE board_id = ? AND asset_id = ?
     ORDER BY observed_at DESC, created_at DESC, id DESC
     LIMIT 1`,
    [boardId, assetId],
  );
}

function combineCompletenessStatus(eventStatus: string, accountingStatus: string | null) {
  return accountingStatus ?? eventStatus;
}

async function readPortfolio(db: LedgerDb, boardId: string) {
  const board = await requireBoard(db, boardId);
  return {
    ok: true,
    board_id: board.id,
    wallet_address: board.wallet_address,
    latest: await latestHoldingSnapshot(db, board.id),
  };
}

async function readPnl(db: LedgerDb, boardId: string) {
  const board = await requireBoard(db, boardId);
  return {
    ok: true,
    board_id: board.id,
    latest: await latestPnlSnapshot(db, board.id),
  };
}

async function listEventTimeline(db: LedgerDb, boardId: string) {
  await requireBoard(db, boardId);
  return await Promise.all((await listEvents(db, boardId)).map((event) => presentEvent(db, event)));
}

async function listBalanceChanges(db: LedgerDb, boardId: string) {
  return (await db.all<BalanceChangeRow>(
    "SELECT * FROM balance_changes WHERE board_id = ? ORDER BY observed_at DESC, created_at DESC, id DESC LIMIT 100",
    [boardId],
  )).map(presentBalanceChange);
}

async function listPriceSnapshots(db: LedgerDb, boardId: string) {
  return (await db.all<PriceSnapshotRow>(
    "SELECT * FROM price_snapshots WHERE board_id = ? ORDER BY observed_at DESC, created_at DESC, id DESC LIMIT 100",
    [boardId],
  )).map(presentPriceSnapshot);
}

async function presentEvent(db: LedgerDb, event: EventRow) {
  return {
    ...event,
    metadata: parseJson(event.metadata_json),
    attachments: (await listAttachments(db, event.id)).map((attachment) => ({
      ...attachment,
      metadata: parseJson(attachment.metadata_json),
    })),
  };
}

function presentBalanceChange(change: BalanceChangeRow) {
  return {
    ...change,
    metadata: parseJson(change.metadata_json),
  };
}

function presentPriceSnapshot(price: PriceSnapshotRow) {
  return {
    ...price,
    metadata: parseJson(price.metadata_json),
  };
}

function presentReadAccessCheck(check: ReadAccessCheckRow) {
  const metadata = parseJson(check.metadata_json);
  return {
    ...check,
    metadata,
  };
}

async function requireBoard(db: LedgerDb, boardId: string) {
  const board = await getBoard(db, boardId);
  if (!board) throw new RequestError("Board not found", 404);
  return board;
}

async function assertBoardRead(
  db: LedgerDb,
  request: Request,
  url: URL,
  board: Board,
  adminToken: string | null | undefined,
  createdAt: string,
  requiredLevel: AccessLevel,
) {
  if (board.visibility_mode === "public") return;
  if (hasServiceBearer(request.headers, adminToken)) return;

  const readToken = cleanString(request.headers.get("x-clawhouse-read-token")) ?? cleanString(url.searchParams.get("read_token"));
  if (!readToken) {
    await recordReadAudit(db, board.id, null, requiredLevel, "denied", "missing_read_token", createdAt);
    throw new RequestError("Read access required", 403);
  }

  const grant = await matchingReadGrant(db, board.id, readToken, requiredLevel, createdAt);
  if (!grant) {
    await recordReadAudit(db, board.id, null, requiredLevel, "denied", "invalid_read_token", createdAt);
    throw new RequestError("Read access denied", 403);
  }
  await recordReadAudit(db, board.id, grant.requester_wallet_address, requiredLevel, "granted", "read_token_grant", createdAt);
}

type AccessLevel = "public_summary" | "key_holder_detail" | "operator_admin_audit";

function normalizeAccessLevel(value: unknown): AccessLevel {
  const level = cleanString(value) ?? "key_holder_detail";
  if (level === "public_summary" || level === "key_holder_detail" || level === "operator_admin_audit") return level;
  throw new RequestError("Invalid access_level", 400);
}

function hasServiceBearer(headers: Headers, adminToken: string | null | undefined) {
  try {
    assertServiceBearer(headers, adminToken);
    return true;
  } catch {
    return false;
  }
}

async function matchingReadGrant(
  db: LedgerDb,
  boardId: string,
  readToken: string,
  requiredLevel: AccessLevel,
  now: string,
) {
  const tokenHash = sha256Hex(readToken);
  const checks = await db.all<ReadAccessCheckRow>(
    `SELECT * FROM read_access_checks
     WHERE board_id = ? AND access_result = 'granted'
     ORDER BY checked_at DESC, created_at DESC, id DESC
     LIMIT 50`,
    [boardId],
  );

  for (const check of checks) {
    if (!accessLevelAllows(check.access_level, requiredLevel)) continue;
    const metadata = parseJson(check.metadata_json) as JsonObject | null;
    if (metadata?.read_token_sha256 !== tokenHash) continue;
    const expiresAt = typeof metadata.expires_at === "string" ? metadata.expires_at : null;
    if (expiresAt && Date.parse(expiresAt) <= Date.parse(now)) continue;
    return check;
  }
  return null;
}

function accessLevelAllows(actual: string, required: AccessLevel) {
  const rank: Record<AccessLevel, number> = {
    public_summary: 0,
    key_holder_detail: 1,
    operator_admin_audit: 2,
  };
  if (!(actual in rank)) return false;
  return rank[actual as AccessLevel] >= rank[required];
}

async function recordReadAudit(
  db: LedgerDb,
  boardId: string,
  requesterWalletAddress: string | null,
  accessLevel: AccessLevel,
  result: "granted" | "denied",
  reason: string,
  createdAt: string,
) {
  await db.run(
    `INSERT INTO audit_events
      (id, board_id, actor_type, actor_id, action, result, subject_type, subject_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    newId("audit"),
    boardId,
    requesterWalletAddress ? "reader_wallet" : "anonymous_reader",
    requesterWalletAddress,
    "read_access_check",
    result,
    "board",
    boardId,
    JSON.stringify({ access_level: accessLevel, reason }),
    createdAt,
    ],
  );
}

async function insertBalanceChange(db: LedgerDb, change: BalanceChangeRow) {
  await db.run(
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
}

async function insertPriceSnapshot(db: LedgerDb, price: PriceSnapshotRow) {
  await db.run(
    `INSERT INTO price_snapshots
      (id, board_id, asset_id, asset_symbol, price_usd, price_source, observed_at,
       staleness_status, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    price.id,
    price.board_id,
    price.asset_id,
    price.asset_symbol,
    price.price_usd,
    price.price_source,
    price.observed_at,
    price.staleness_status,
    price.metadata_json,
    price.created_at,
    ],
  );
}

async function insertReadAccessCheck(db: LedgerDb, check: ReadAccessCheckRow) {
  await db.run(
    `INSERT INTO read_access_checks
      (id, board_id, requester_wallet_address, access_level, access_result, reason,
       key_contract_id, checked_at, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    check.id,
    check.board_id,
    check.requester_wallet_address,
    check.access_level,
    check.access_result,
    check.reason,
    check.key_contract_id,
    check.checked_at,
    check.metadata_json,
    check.created_at,
    ],
  );
}

async function trackedWalletId(db: LedgerDb, boardId: string, walletAddress: string) {
  return (await db.get<{ id: string }>(
    "SELECT id FROM tracked_wallets WHERE board_id = ? AND wallet_address = ?",
    [boardId, walletAddress],
  ))?.id ?? null;
}

async function assertSignedRequest(
  db: LedgerDb,
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
    await db.run(
      "INSERT INTO auth_nonces (id, board_id, wallet_address, nonce, timestamp, body_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [newId("nonce"), board.id, board.wallet_address, headers.nonce, headers.timestamp, actualBodyHash, createdAt],
    );
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    throw new AuthError("Nonce replay rejected");
  }
}

async function insertEvent(db: LedgerDb, event: EventRow) {
  await db.run(
    `INSERT INTO events
      (id, board_id, agent_id, wallet_address, event_type, client_event_id, tx_hash, intent_id, status_claim,
       asset_in, amount_in, asset_out, amount_out, reason, metadata_json, reported_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    event.reported_at,
    event.created_at,
    ],
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

function asOptionalObject(value: unknown): JsonObject {
  if (value === undefined || value === null) return {};
  return asObject(value);
}

function optionalNumberField(value: unknown, name: string) {
  return requiredOrOptionalNumber(value, name, false);
}

function requiredPositiveNumberField(value: unknown, name: string) {
  const parsed = requiredNumber(value, name);
  if (parsed <= 0) throw new RequestError(`${name} must be greater than 0`, 400);
  return parsed;
}

function requiredNonNegativeNumberField(value: unknown, name: string) {
  const parsed = requiredNumber(value, name);
  if (parsed < 0) throw new RequestError(`${name} must be greater than or equal to 0`, 400);
  return parsed;
}

function optionalNonNegativeNumberField(value: unknown, name: string) {
  const parsed = optionalNumberField(value, name);
  if (parsed !== null && parsed < 0) {
    throw new RequestError(`${name} must be greater than or equal to 0`, 400);
  }
  return parsed;
}

function optionalIntegerField(value: unknown, name: string) {
  const parsed = optionalNumberField(value, name);
  if (parsed !== null && !Number.isInteger(parsed)) {
    throw new RequestError(`${name} must be an integer`, 400);
  }
  return parsed;
}

function requiredOrOptionalNumber(value: unknown, name: string, required: boolean) {
  if (!required && (value === undefined || value === null || value === "")) return null;
  return requiredNumber(value, name);
}

function normalizedObservedAt(value: unknown, createdAt: string) {
  return normalizedTimestampField(value, createdAt, "observed_at");
}

function normalizedTimestampField(value: unknown, fallback: string, name: string) {
  const timestamp = cleanString(value) ?? fallback;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new RequestError(`Invalid ${name}`, 400);
  }

  const fallbackMs = Date.parse(fallback);
  if (parsed > fallbackMs + OBSERVATION_FUTURE_SKEW_MS) {
    throw new RequestError(`${name} cannot be more than 60 seconds in the future`, 400);
  }

  return new Date(parsed).toISOString();
}

function classifyNearBalanceChange(deltaAmount: number | null) {
  if (deltaAmount === null) return "initial_balance";
  if (deltaAmount > 0) return "balance_increase";
  if (deltaAmount < 0) return "balance_decrease";
  return "no_change";
}

async function viewNearAccount(rpcFetch: FetchLike, rpcUrl: string, accountId: string) {
  const response = await rpcFetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "clawhouse-agent-board-ledger",
      method: "query",
      params: {
        request_type: "view_account",
        finality: "final",
        account_id: accountId,
      },
    }),
  });
  const rpc = await response.json() as JsonObject;
  if (!response.ok || rpc.error) {
    throw new RequestError("NEAR account view failed", 502);
  }

  const result = asObject(rpc.result);
  return {
    amount: requiredString(result.amount, "near_account.amount"),
    locked: cleanString(result.locked),
    block_hash: cleanString(result.block_hash),
    block_height: optionalIntegerField(result.block_height, "near_account.block_height"),
    storage_usage: optionalIntegerField(result.storage_usage, "near_account.storage_usage"),
  };
}

async function viewNearFtBalance(
  rpcFetch: FetchLike,
  rpcUrl: string,
  tokenContractId: string,
  accountId: string,
) {
  return decimalIntegerString(
    await callNearViewFunction(rpcFetch, rpcUrl, tokenContractId, "ft_balance_of", { account_id: accountId }),
    "ft_balance_of",
  );
}

async function viewNearFtMetadata(
  rpcFetch: FetchLike,
  rpcUrl: string,
  tokenContractId: string,
) {
  const value = await callNearViewFunction(rpcFetch, rpcUrl, tokenContractId, "ft_metadata", {});
  const metadata = asObject(value);
  const decimals = optionalIntegerField(metadata.decimals, "ft_metadata.decimals");
  if (decimals === null) throw new RequestError("FT metadata is missing decimals", 502);
  assertTokenDecimals(decimals);
  return {
    spec: cleanString(metadata.spec),
    name: cleanString(metadata.name),
    symbol: cleanString(metadata.symbol),
    decimals,
  };
}

async function viewNearKeyMarketBalance(
  rpcFetch: FetchLike,
  rpcUrl: string,
  keyContractId: string,
  agentId: string,
  holderAccountId: string,
) {
  return await callNearViewFunction(rpcFetch, rpcUrl, keyContractId, "get_balance", {
    agent_id: agentId,
    account_id: holderAccountId,
  });
}

async function callNearViewFunction(
  rpcFetch: FetchLike,
  rpcUrl: string,
  contractId: string,
  methodName: string,
  args: JsonObject,
) {
  const response = await rpcFetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "clawhouse-agent-board-ledger",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: methodName,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const rpc = await response.json() as JsonObject;
  if (!response.ok || rpc.error) {
    throw new RequestError("NEAR view function call failed", 502);
  }

  const result = asObject(rpc.result);
  return decodeNearViewResult(result.result, methodName);
}

function decodeNearViewResult(value: unknown, methodName: string) {
  if (!Array.isArray(value)) {
    throw new RequestError(`Invalid ${methodName} result`, 502);
  }

  const bytes = value.map((item) => {
    if (!Number.isInteger(item) || item < 0 || item > 255) {
      throw new RequestError(`Invalid ${methodName} result byte`, 502);
    }
    return item;
  });
  const decoded = new TextDecoder().decode(Uint8Array.from(bytes));
  if (decoded === "") return null;

  try {
    return JSON.parse(decoded) as unknown;
  } catch {
    return decoded;
  }
}

function decimalIntegerString(value: unknown, name: string) {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  throw new RequestError(`Invalid ${name}`, 502);
}

function decimalAmountFromRaw(rawAmount: string, decimals: number) {
  assertTokenDecimals(decimals);
  const amount = BigInt(decimalIntegerString(rawAmount, "raw_amount"));
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fractional = amount % scale;
  const fractionalText = decimals === 0
    ? ""
    : fractional.toString().padStart(decimals, "0").slice(0, 12).replace(/0+$/, "");
  const normalizedText = fractionalText ? `${whole.toString()}.${fractionalText}` : whole.toString();
  const parsed = Number(normalizedText);
  if (!Number.isFinite(parsed)) {
    throw new RequestError("Token balance is too large to normalize safely", 502);
  }
  return parsed;
}

function assertTokenDecimals(decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new RequestError("FT decimals must be an integer between 0 and 36", 400);
  }
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
  if (error instanceof AuthError || error instanceof ServiceAuthError || error instanceof RequestError) {
    return json({ ok: false, error: error.message }, error.status);
  }
  if (isUniqueViolation(error)) {
    return json({ ok: false, error: "Duplicate record" }, 409);
  }
  console.error(error);
  return json({ ok: false, error: "Internal server error" }, 500);
}

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? (error as { code?: unknown }).code : null;
  return code === "23505" || error.message.includes("UNIQUE constraint failed");
}

if (import.meta.main) {
  const port = Number(process.env.AGENT_BOARD_LEDGER_PORT ?? 4321);
  try {
    const db = await openRuntimeLedgerDb();
    const app = createApp({ db });
    Bun.serve({
      port,
      fetch: app.fetch,
    });
    console.log(`[agent-board-ledger] listening on http://127.0.0.1:${port}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown startup error";
    console.error(`[agent-board-ledger] startup failed: ${message}`);
    process.exit(1);
  }
}
