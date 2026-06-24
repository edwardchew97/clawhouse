import { cleanString, newId, optionalNumber, requiredNumber, requiredString, RequestError, type LedgerDb } from "./db.js";
import { sha256Hex, timestampIsFresh, verifySignature } from "./auth.js";
import type {
  JsonObject,
  PaperAccountRow,
  PaperAuditEventRow,
  PaperFillRow,
  PaperLeaderboardSnapshotRow,
  PaperLiquidationEventRow,
  PaperMarketSnapshotRow,
  PaperOrderRow,
  PaperPositionRow,
  PaperRiskSnapshotRow,
} from "./types.js";

const PAPER_AUTH_DOMAIN = "clawhouse.paper-trading.v0";
const PAPER_AUTH_VERSION = 1;
const DEFAULT_FEE_RATE = 0.00035;
const DEFAULT_MAX_SLIPPAGE_BPS = 50;
const DEFAULT_MAINTENANCE_MARGIN_RATE = 0.005;
const MARKET_STALE_MS = 10_000;
const EPSILON = 1e-9;

type BodyInput = {
  raw: string;
  json: unknown;
};

type BookLevel = {
  px: number;
  sz: number;
  n?: number | null;
};

type Book = {
  bids: BookLevel[];
  asks: BookLevel[];
};

type FillCandidate = {
  px: number;
  size: number;
  notional: number;
};

type MarketType = "perp" | "spot";
type MarginMode = "cross" | "isolated" | "spot";

type OrderInput = {
  paperAccountId: string;
  clientOrderId: string;
  marketType: MarketType;
  coin: string;
  side: "buy" | "sell";
  tif: "Ioc" | "Gtc" | "Alo";
  limitPx: number | null;
  size: number;
  reduceOnly: boolean;
  marginMode: MarginMode;
  leverage: number;
  maxSlippageBps: number;
  maxSlippageBpsProvided: boolean;
  referencePx: number;
  maxReferenceDeviationBps: number;
  reason: string | null;
  strategyHash: string | null;
};

type SubmitPaperOrderOptions = {
  refreshMarketData?: (db: LedgerDb, marketType: MarketType, coin: string, createdAt: string) => Promise<void>;
};

export function canonicalPaperAuthPayload(input: {
  method: string;
  path: string;
  bodyHash: string;
  timestamp: string;
  nonce: string;
  paperAccountId: string;
  agentId: string;
}) {
  return JSON.stringify({
    domain: PAPER_AUTH_DOMAIN,
    version: PAPER_AUTH_VERSION,
    method: input.method.toUpperCase(),
    path: input.path,
    bodyHash: input.bodyHash,
    timestamp: input.timestamp,
    nonce: input.nonce,
    paperAccountId: input.paperAccountId,
    agentId: input.agentId,
  });
}

export async function createPaperAccount(db: LedgerDb, body: BodyInput, createdAt: string) {
  const data = asObject(body.json);
  const startingBalance = requiredPositiveNumber(data.startingBalanceUsd ?? data.starting_balance_usd, "starting_balance_usd");
  const requestedBoardId = cleanString(data.boardId ?? data.board_id);
  const identity = await resolvePaperAccountIdentity(db, {
    boardId: requestedBoardId,
    agentId: cleanString(data.agentId ?? data.agent_id),
    agentPublicKey: cleanString(data.agentPublicKey ?? data.agent_public_key),
  });
  const account: PaperAccountRow = {
    id: cleanString(data.paperAccountId ?? data.paper_account_id) ?? newId("paper_acct"),
    board_id: requestedBoardId,
    agent_id: identity.agentId,
    agent_public_key: identity.agentPublicKey,
    base_currency: cleanString(data.baseCurrency ?? data.base_currency) ?? "USD",
    starting_balance_usd: startingBalance,
    cash_balance_usd: startingBalance,
    status: cleanString(data.status) ?? "active",
    allowed_markets_json: stringifyOptional(data.allowedMarkets ?? data.allowed_markets),
    metadata_json: stringifyOptional(data.metadata),
    created_at: createdAt,
    updated_at: createdAt,
  };

  await db.run(
    `INSERT INTO paper_accounts
      (id, board_id, agent_id, agent_public_key, base_currency, starting_balance_usd,
       cash_balance_usd, status, allowed_markets_json, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.id,
      account.board_id,
      account.agent_id,
      account.agent_public_key,
      account.base_currency,
      account.starting_balance_usd,
      account.cash_balance_usd,
      account.status,
      account.allowed_markets_json,
      account.metadata_json,
      account.created_at,
      account.updated_at,
    ],
  );
  await appendPaperAuditEvent(db, account.id, "paper_account", account.id, "paper_account_created", account, createdAt);
  return { ok: true, account: presentPaperAccount(account) };
}

async function resolvePaperAccountIdentity(
  db: LedgerDb,
  input: {
    boardId: string | null;
    agentId: string | null;
    agentPublicKey: string | null;
  },
) {
  if (input.boardId) {
    const board = await db.get<{ agent_id: string; agent_public_key: string | null; public_key: string }>(
      "SELECT agent_id, agent_public_key, public_key FROM boards WHERE id = ?",
      [input.boardId],
    );
    if (!board) throw new RequestError("Board not found", 404);

    const boardAgentPublicKey = requiredBoardAgentPublicKey(board);
    if (input.agentId && input.agentId !== board.agent_id) {
      throw new RequestError("paper account agent_id must match board agent_id", 400);
    }
    if (input.agentPublicKey && input.agentPublicKey !== boardAgentPublicKey) {
      throw new RequestError("paper account agent_public_key must match board agent_public_key", 400);
    }
    await requireActiveAgentRegistration(db, board.agent_id, boardAgentPublicKey);
    return { agentId: board.agent_id, agentPublicKey: boardAgentPublicKey };
  }

  const agentId = requiredString(input.agentId, "agent_id");
  const agentPublicKey = requiredString(input.agentPublicKey, "agent_public_key");
  await requireActiveAgentRegistration(db, agentId, agentPublicKey);
  return { agentId, agentPublicKey };
}

function requiredBoardAgentPublicKey(board: { agent_public_key: string | null }) {
  const agentPublicKey = cleanString(board.agent_public_key);
  if (!agentPublicKey) throw new RequestError("Board is missing agent_public_key", 500);
  return agentPublicKey;
}

async function requireActiveAgentRegistration(db: LedgerDb, agentId: string, agentPublicKey: string) {
  const agent = await db.get<{ agent_public_key: string; status: string }>(
    "SELECT agent_public_key, status FROM agent_registrations WHERE agent_id = ?",
    [agentId],
  );
  if (!agent || agent.status !== "active") {
    throw new RequestError("Agent registration not found", 403);
  }
  if (agent.agent_public_key !== agentPublicKey) {
    throw new RequestError("Agent public key is not registered for agent_id", 403);
  }
}

export async function createPaperMarketSnapshot(db: LedgerDb, body: BodyInput, createdAt: string) {
  const data = asObject(body.json);
  const snapshot: PaperMarketSnapshotRow = {
    id: cleanString(data.snapshotId ?? data.snapshot_id) ?? newId("paper_mkt"),
    ingest_sequence: await nextIngestSequence(db, "paper_market_snapshots"),
    market_type: normalizeMarketType(data.marketType ?? data.market_type),
    coin: normalizeCoin(data.coin),
    source: cleanString(data.source) ?? "hyperliquid",
    mark_px: requiredPositiveNumber(data.markPx ?? data.mark_px, "mark_px"),
    oracle_px: optionalPositiveNumber(data.oraclePx ?? data.oracle_px, "oracle_px"),
    funding_rate: optionalNumber(data.fundingRate ?? data.funding_rate, "funding_rate"),
    max_leverage: optionalPositiveNumber(data.maxLeverage ?? data.max_leverage, "max_leverage"),
    maintenance_margin_rate: optionalPositiveNumber(data.maintenanceMarginRate ?? data.maintenance_margin_rate, "maintenance_margin_rate") ?? DEFAULT_MAINTENANCE_MARGIN_RATE,
    book_json: JSON.stringify(readBook(data)),
    observed_at: normalizedTimestamp(data.observedAt ?? data.observed_at, createdAt, "observed_at"),
    staleness_status: cleanString(data.stalenessStatus ?? data.staleness_status) ?? "fresh",
    created_at: createdAt,
  };

  await db.run(
    `INSERT INTO paper_market_snapshots
      (id, ingest_sequence, market_type, coin, source, mark_px, oracle_px, funding_rate, maintenance_margin_rate,
       max_leverage, book_json, observed_at, staleness_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.id,
      snapshot.ingest_sequence,
      snapshot.market_type,
      snapshot.coin,
      snapshot.source,
      snapshot.mark_px,
      snapshot.oracle_px,
      snapshot.funding_rate,
      snapshot.maintenance_margin_rate,
      snapshot.max_leverage,
      snapshot.book_json,
      snapshot.observed_at,
      snapshot.staleness_status,
      snapshot.created_at,
    ],
  );
  await appendPaperAuditEvent(db, null, "paper_market_snapshot", snapshot.id, "paper_market_snapshot_created", snapshot, createdAt);
  return { ok: true, snapshot: presentMarketSnapshot(snapshot) };
}

export async function submitPaperOrder(
  db: LedgerDb,
  request: Request,
  body: BodyInput,
  path: string,
  createdAt: string,
  options: SubmitPaperOrderOptions = {},
) {
  const input = parseOrderInput(body.json);
  const account = await requirePaperAccount(db, input.paperAccountId);
  await assertPaperSignedRequest(db, request, body.raw, path, account, Date.parse(createdAt), createdAt);
  const bodyHash = sha256Hex(body.raw);

  return await db.transaction(async (tx) => {
    const lockedAccount = await requireLockedPaperAccount(tx, account.id);
    const existing = await tx.get<PaperOrderRow>(
      "SELECT * FROM paper_orders WHERE paper_account_id = ? AND client_order_id = ?",
      [lockedAccount.id, input.clientOrderId],
    );
    if (existing) {
      if (existing.body_hash !== null && existing.body_hash !== bodyHash) {
        throw new RequestError("client_order_id body mismatch", 409);
      }
      return { ok: true, idempotent: true, order: presentOrder(existing), fills: await listFills(tx, existing.id) };
    }

    if (lockedAccount.status !== "active") {
      return await insertRejectedOrder(tx, lockedAccount, input, "paper_account_not_active", body.raw, createdAt);
    }
    if (!marketAllowed(lockedAccount, input.marketType, input.coin)) {
      return await insertRejectedOrder(tx, lockedAccount, input, "market_not_allowed", body.raw, createdAt);
    }

    if (input.marketType === "spot") {
      const spotShapeRejectReason = validateSpotOrderShape(input);
      if (spotShapeRejectReason) {
        return await insertRejectedOrder(tx, lockedAccount, input, spotShapeRejectReason, body.raw, createdAt);
      }
    }
    if (!input.reason) {
      return await insertRejectedOrder(tx, lockedAccount, input, "reason_required", body.raw, createdAt);
    }

    if (input.tif === "Ioc" && input.limitPx === null && !input.maxSlippageBpsProvided) {
      return await insertRejectedOrder(tx, lockedAccount, input, "max_slippage_bps_required", body.raw, createdAt);
    }

    if (options.refreshMarketData) {
      try {
        await options.refreshMarketData(tx, input.marketType, input.coin, createdAt);
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        return await insertRejectedOrder(tx, lockedAccount, input, "market_data_unavailable", body.raw, createdAt);
      }
    }

    const snapshot = await latestMarketSnapshot(tx, input.marketType, input.coin);
    if (!snapshot || marketIsStale(snapshot, Date.parse(createdAt))) {
      return await insertRejectedOrder(tx, lockedAccount, input, "stale_market_data", body.raw, createdAt, snapshot?.id ?? null);
    }
    const referenceDeviationBps = referenceDeviation(input.referencePx, snapshot.mark_px);
    if (referenceDeviationBps - input.maxReferenceDeviationBps > EPSILON) {
      return await insertRejectedOrder(tx, lockedAccount, input, "reference_price_deviation", body.raw, createdAt, snapshot.id, referenceDeviationBps);
    }
    if (input.marketType === "perp" && snapshot.max_leverage !== null && input.leverage - snapshot.max_leverage > EPSILON) {
      return await insertRejectedOrder(tx, lockedAccount, input, "leverage_exceeds_hyperliquid_max", body.raw, createdAt, snapshot.id, referenceDeviationBps);
    }

    const book = parseBook(snapshot.book_json);
    const effectiveLimit = effectiveLimitPx(input, book);
    if (input.tif !== "Ioc" && input.limitPx === null) {
      return await insertRejectedOrder(tx, lockedAccount, input, "limit_px_required_for_resting_order", body.raw, createdAt, snapshot.id, referenceDeviationBps);
    }
    if (input.tif === "Alo" && wouldCross(input.side, effectiveLimit, book)) {
      return await insertRejectedOrder(tx, lockedAccount, input, "post_only_would_cross", body.raw, createdAt, snapshot.id, referenceDeviationBps);
    }

    const fillPlan = input.tif === "Alo" ? [] : planTakerFills(input.side, input.size, effectiveLimit, book);
    const totalFillSize = roundQty(fillPlan.reduce((sum, fill) => sum + fill.size, 0));
    const notional = sumNotional(fillPlan);
    const fee = notional * DEFAULT_FEE_RATE;
    const remainingSize = roundQty(input.size - totalFillSize);
    const reduceOnlyRejectReason = input.reduceOnly
      ? await validateReduceOnlyOrder(tx, lockedAccount.id, input, input.tif === "Ioc" ? totalFillSize : input.size)
      : null;
    if (reduceOnlyRejectReason) {
      return await insertRejectedOrder(tx, lockedAccount, input, reduceOnlyRejectReason, body.raw, createdAt, snapshot.id, referenceDeviationBps);
    }
    if (input.marketType === "spot") {
      const spotBalanceRejectReason = await validateSpotOrderBalances(
        tx,
        lockedAccount,
        input,
        input.tif === "Ioc" ? notional : input.size * effectiveLimit,
        fee,
      );
      if (spotBalanceRejectReason) {
        return await insertRejectedOrder(tx, lockedAccount, input, spotBalanceRejectReason, body.raw, createdAt, snapshot.id, referenceDeviationBps);
      }
    }

    if (input.tif === "Ioc" && totalFillSize <= 0) {
      return await insertRejectedOrder(tx, lockedAccount, input, "insufficient_depth", body.raw, createdAt, snapshot.id, referenceDeviationBps);
    }
    if (totalFillSize > 0) {
      const marginRejectReason = await validateMarginAvailable(tx, lockedAccount, input, notional, fee, snapshot, createdAt);
      if (marginRejectReason) {
        return await insertRejectedOrder(tx, lockedAccount, input, marginRejectReason, body.raw, createdAt, snapshot.id, referenceDeviationBps);
      }
    } else if (input.tif !== "Alo" && input.tif !== "Gtc") {
      return await insertRejectedOrder(tx, lockedAccount, input, "insufficient_depth", body.raw, createdAt, snapshot.id, referenceDeviationBps);
    }

    const order: PaperOrderRow = {
      id: newId("paper_ord"),
      paper_account_id: lockedAccount.id,
      agent_id: lockedAccount.agent_id,
      client_order_id: input.clientOrderId,
      market_type: input.marketType,
      coin: input.coin,
      side: input.side,
      tif: input.tif,
      limit_px: input.limitPx,
      size: input.size,
      remaining_size: input.tif === "Ioc" ? 0 : remainingSize,
      reduce_only: input.reduceOnly ? 1 : 0,
      margin_mode: input.marginMode,
      leverage: input.leverage,
      max_slippage_bps: input.maxSlippageBps,
      reference_px: input.referencePx,
      max_reference_deviation_bps: input.maxReferenceDeviationBps,
      reference_deviation_bps: referenceDeviationBps,
      status: orderStatus(input.tif, totalFillSize, remainingSize),
      reject_reason: null,
      reason: input.reason,
      strategy_hash: input.strategyHash,
      market_snapshot_id: snapshot.id,
      avg_fill_px: totalFillSize > 0 ? notional / totalFillSize : null,
      notional_usd: notional,
      fee_usd: fee,
      body_hash: bodyHash,
      created_at: createdAt,
      updated_at: createdAt,
    };

    await insertOrder(tx, order);
    const insertedFills: PaperFillRow[] = [];
    for (const fill of fillPlan) {
      const row: PaperFillRow = {
        id: newId("paper_fill"),
        order_id: order.id,
        paper_account_id: account.id,
        coin: order.coin,
        market_type: order.market_type,
        side: order.side,
        px: fill.px,
        size: fill.size,
        notional_usd: fill.notional,
        fee_usd: fill.notional * DEFAULT_FEE_RATE,
        liquidity: "taker",
        market_snapshot_id: snapshot.id,
        created_at: createdAt,
      };
      await insertFill(tx, row);
      await applyFillToPosition(tx, account.id, row, input.marketType, input.marginMode, input.leverage, createdAt);
      insertedFills.push(row);
    }
    await appendPaperAuditEvent(tx, lockedAccount.id, "paper_order", order.id, "paper_order_submitted", { input, order, fills: insertedFills }, createdAt);
    const risk = await writeRiskAndLeaderboard(tx, lockedAccount.id, snapshot.id, createdAt);

    return {
      ok: true,
      idempotent: false,
      order: presentOrder(order),
      fills: insertedFills.map(presentFill),
      risk,
    };
  });
}

export async function runPaperRiskCheck(db: LedgerDb, paperAccountId: string, createdAt: string) {
  const account = await requirePaperAccount(db, paperAccountId);
  const positions = await listOpenPositions(db, account.id);
  const snapshots = await latestSnapshotsForPositions(db, positions);
  const risk = await writeRiskAndLeaderboard(db, account.id, latestSnapshotId(snapshots), createdAt);
  const liquidations: PaperLiquidationEventRow[] = [];

  for (const position of positions) {
    if (position.market_type === "spot") continue;
    const snapshot = snapshots.get(positionKey(position));
    if (!snapshot || marketIsStale(snapshot, Date.parse(createdAt))) continue;
    const positionRisk = computePositionRisk(position, snapshot);
    const riskSnapshot = risk.risk;
    const shouldLiquidate = position.margin_mode === "isolated"
      ? positionRisk.isolatedEquity <= positionRisk.maintenanceMargin + EPSILON
      : riskSnapshot.equity_usd <= riskSnapshot.maintenance_margin_usd + EPSILON;
    if (!shouldLiquidate) continue;
    liquidations.push(await liquidatePosition(db, account.id, position, snapshot, riskSnapshot, createdAt));
  }

  const finalRisk = liquidations.length > 0
    ? await writeRiskAndLeaderboard(db, account.id, latestSnapshotId(snapshots), createdAt)
    : risk;

  return {
    ok: true,
    account: presentPaperAccount(account),
    risk: finalRisk,
    liquidations: liquidations.map(presentLiquidation),
  };
}

export async function readPaperAccount(db: LedgerDb, paperAccountId: string) {
  const account = await requirePaperAccount(db, paperAccountId);
  return {
    ok: true,
    account: presentPaperAccount(account),
    positions: (await listOpenPositions(db, account.id)).map(presentPosition),
    latest_risk: await latestRiskSnapshot(db, account.id),
  };
}

export async function readPaperAccountActivity(
  db: LedgerDb,
  paperAccountId: string,
  options: { limit?: number } = {},
) {
  const account = await requirePaperAccount(db, paperAccountId);
  const limit = boundedActivityLimit(options.limit);
  const orders = await listRecentOrders(db, account.id, limit);
  const fills = await listRecentAccountFills(db, account.id, limit);
  const riskSnapshots = await listRecentRiskSnapshots(db, account.id, limit);
  const counts = await paperOrderCounts(db, account.id);

  return {
    ok: true,
    account: presentPaperAccount(account),
    positions: (await listOpenPositions(db, account.id)).map(presentPosition),
    latest_risk: riskSnapshots[riskSnapshots.length - 1]
      ? presentRisk(riskSnapshots[riskSnapshots.length - 1])
      : await latestRiskSnapshot(db, account.id),
    risk_snapshots: riskSnapshots.map(presentRisk),
    orders: orders.map(presentActivityOrder),
    fills: fills.map(presentFill),
    summary: {
      ...counts,
      latest_order_at: orders[0]?.created_at ?? null,
      latest_fill_at: fills[0]?.created_at ?? null,
      latest_risk_at: riskSnapshots[riskSnapshots.length - 1]?.created_at ?? null,
    },
  };
}

export async function readPaperLeaderboard(db: LedgerDb) {
  const rows = await db.all<PaperLeaderboardSnapshotRow>(
    `SELECT latest.*
       FROM paper_leaderboard_snapshots AS latest
       JOIN (
         SELECT paper_account_id, MAX(created_at) AS created_at
         FROM paper_leaderboard_snapshots
         GROUP BY paper_account_id
       ) AS grouped
         ON grouped.paper_account_id = latest.paper_account_id
        AND grouped.created_at = latest.created_at
      ORDER BY latest.paper_pnl_pct DESC, latest.equity_usd DESC`,
  );
  return { ok: true, label: "paper", leaderboard: rows.map(presentLeaderboardSnapshot) };
}

export async function replayPaperOrder(db: LedgerDb, orderId: string) {
  const order = await db.get<PaperOrderRow>("SELECT * FROM paper_orders WHERE id = ?", [orderId]);
  if (!order) throw new RequestError("Paper order not found", 404);
  const snapshot = order.market_snapshot_id
    ? await db.get<PaperMarketSnapshotRow>("SELECT * FROM paper_market_snapshots WHERE id = ?", [order.market_snapshot_id])
    : undefined;
  const fills = await listFills(db, order.id);
  const audit = await db.all<PaperAuditEventRow>(
    "SELECT * FROM paper_audit_events WHERE subject_type = 'paper_order' AND subject_id = ? ORDER BY created_at ASC, id ASC",
    [order.id],
  );
  return {
    ok: true,
    replay: {
      order: presentOrder(order),
      market_snapshot: snapshot ? presentMarketSnapshot(snapshot) : null,
      fills: fills.map(presentFill),
      audit: audit.map(presentAudit),
    },
  };
}

async function insertRejectedOrder(
  db: LedgerDb,
  account: PaperAccountRow,
  input: OrderInput,
  rejectReason: string,
  rawBody: string,
  createdAt: string,
  marketSnapshotId: string | null = null,
  referenceDeviationBps: number | null = null,
) {
  const order: PaperOrderRow = {
    id: newId("paper_ord"),
    paper_account_id: account.id,
    agent_id: account.agent_id,
    client_order_id: input.clientOrderId,
    market_type: input.marketType,
    coin: input.coin,
    side: input.side,
    tif: input.tif,
    limit_px: input.limitPx,
    size: input.size,
    remaining_size: input.size,
    reduce_only: input.reduceOnly ? 1 : 0,
    margin_mode: input.marginMode,
    leverage: input.leverage,
    max_slippage_bps: input.maxSlippageBps,
    reference_px: input.referencePx,
    max_reference_deviation_bps: input.maxReferenceDeviationBps,
    reference_deviation_bps: referenceDeviationBps,
    status: "rejected",
    reject_reason: rejectReason,
    reason: input.reason,
    strategy_hash: input.strategyHash,
    market_snapshot_id: marketSnapshotId,
    avg_fill_px: null,
    notional_usd: 0,
    fee_usd: 0,
    body_hash: sha256Hex(rawBody),
    created_at: createdAt,
    updated_at: createdAt,
  };
  await insertOrder(db, order);
  await appendPaperAuditEvent(db, account.id, "paper_order", order.id, "paper_order_rejected", { input, order }, createdAt);
  return { ok: true, idempotent: false, order: presentOrder(order), fills: [] };
}

async function assertPaperSignedRequest(
  db: LedgerDb,
  request: Request,
  rawBody: string,
  path: string,
  account: PaperAccountRow,
  nowMs: number,
  createdAt: string,
) {
  const headers = readPaperSignedHeaders(request.headers);
  const actualBodyHash = sha256Hex(rawBody);
  if (headers.paperAccountId !== account.id) throw new PaperAuthError("Paper account header mismatch");
  if (headers.agentId !== account.agent_id) throw new PaperAuthError("Agent header mismatch");
  if (headers.bodyHash !== actualBodyHash) throw new PaperAuthError("Body hash mismatch");
  if (!timestampIsFresh(headers.timestamp, nowMs)) throw new PaperAuthError("Signature timestamp is stale");
  const payload = canonicalPaperAuthPayload({
    method: request.method,
    path,
    bodyHash: actualBodyHash,
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    paperAccountId: account.id,
    agentId: account.agent_id,
  });
  if (!verifySignature(account.agent_public_key, payload, headers.signature)) {
    throw new PaperAuthError("Invalid signature");
  }
  try {
    await db.run(
      `INSERT INTO paper_auth_nonces
        (id, paper_account_id, nonce, timestamp, body_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [newId("paper_nonce"), account.id, headers.nonce, headers.timestamp, actualBodyHash, createdAt],
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new PaperAuthError("Nonce replay rejected");
    throw error;
  }
}

function readPaperSignedHeaders(headers: Headers) {
  return {
    paperAccountId: requiredHeader(headers, "x-clawhouse-paper-account-id"),
    agentId: requiredHeader(headers, "x-clawhouse-agent-id"),
    timestamp: requiredHeader(headers, "x-clawhouse-paper-timestamp"),
    nonce: requiredHeader(headers, "x-clawhouse-paper-nonce"),
    bodyHash: requiredHeader(headers, "x-clawhouse-paper-body-sha256").toLowerCase(),
    signature: requiredHeader(headers, "x-clawhouse-paper-signature"),
  };
}

function requiredHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  if (!value || value.trim() === "") throw new PaperAuthError(`Missing ${name}`);
  return value.trim();
}

function parseOrderInput(value: unknown): OrderInput {
  const data = asObject(value);
  const marketType = normalizeMarketType(data.marketType ?? data.market_type);
  const tif = cleanString(data.tif ?? data.timeInForce ?? data.time_in_force ?? data.orderType ?? data.order_type) ?? "Ioc";
  const normalizedTif = normalizeTif(tif);
  const maxSlippageInput = data.maxSlippageBps ?? data.max_slippage_bps;
  const referencePx = data.referencePx ?? data.reference_px;
  const maxReferenceDeviationBps = data.maxReferenceDeviationBps ?? data.max_reference_deviation_bps;
  return {
    paperAccountId: requiredString(data.paperAccountId ?? data.paper_account_id, "paper_account_id"),
    clientOrderId: requiredString(data.clientOrderId ?? data.client_order_id, "client_order_id"),
    marketType,
    coin: normalizeCoin(data.coin),
    side: normalizeSide(data.side),
    tif: normalizedTif,
    limitPx: optionalPositiveNumber(data.limitPx ?? data.limit_px, "limit_px"),
    size: requiredPositiveNumber(data.size, "size"),
    reduceOnly: Boolean(data.reduceOnly ?? data.reduce_only ?? false),
    marginMode: normalizeMarginMode(data.marginMode ?? data.margin_mode, marketType),
    leverage: marketType === "spot"
      ? optionalPositiveNumber(data.leverage, "leverage") ?? 1
      : requiredPositiveNumber(data.leverage, "leverage"),
    maxSlippageBps: optionalNonNegativeNumber(maxSlippageInput, "max_slippage_bps") ?? DEFAULT_MAX_SLIPPAGE_BPS,
    maxSlippageBpsProvided: maxSlippageInput !== undefined && maxSlippageInput !== null && maxSlippageInput !== "",
    referencePx: requiredPositiveNumber(referencePx, "reference_px"),
    maxReferenceDeviationBps: requiredPositiveNumber(maxReferenceDeviationBps, "max_reference_deviation_bps"),
    reason: cleanString(data.reason),
    strategyHash: cleanString(data.strategyHash ?? data.strategy_hash),
  };
}

async function validateMarginAvailable(
  db: LedgerDb,
  account: PaperAccountRow,
  input: OrderInput,
  notional: number,
  fee: number,
  snapshot: PaperMarketSnapshotRow,
  createdAt: string,
) {
  if (input.marketType === "spot") return null;
  if (input.reduceOnly) return null;
  const newInitialMargin = notional / input.leverage;
  if (input.marginMode === "isolated") {
    if (account.cash_balance_usd + EPSILON < newInitialMargin + fee) {
      return "insufficient_isolated_paper_margin";
    }
    return null;
  }
  const risk = await computeAccountRisk(db, account.id, snapshot.id, createdAt);
  const crossPositions = (await listOpenPositions(db, account.id))
    .filter((position) => position.margin_mode === "cross");
  const snapshots = await latestSnapshotsForPositions(db, crossPositions);
  let currentInitial = 0;
  for (const position of crossPositions) {
    const positionSnapshot = snapshots.get(positionKey(position));
    if (!positionSnapshot || marketIsStale(positionSnapshot, Date.parse(createdAt))) {
      return "stale_market_data";
    }
    currentInitial += Math.abs(position.signed_size) * positionSnapshot.mark_px / position.leverage;
  }
  if (risk.equity_usd + EPSILON < currentInitial + newInitialMargin + fee) {
    return "insufficient_cross_paper_margin";
  }
  return null;
}

async function applyFillToPosition(
  db: LedgerDb,
  paperAccountId: string,
  fill: PaperFillRow,
  marketType: MarketType,
  marginMode: MarginMode,
  leverage: number,
  createdAt: string,
) {
  const account = await requirePaperAccount(db, paperAccountId);
  const existing = await db.get<PaperPositionRow>(
    "SELECT * FROM paper_positions WHERE paper_account_id = ? AND market_type = ? AND coin = ? AND margin_mode = ?",
    [paperAccountId, marketType, fill.coin, marginMode],
  );
  if (marketType === "spot") {
    await applySpotFillToPosition(db, account, existing, fill, createdAt);
    return;
  }
  const fillSignedSize = fill.side === "buy" ? fill.size : -fill.size;
  const openMargin = marginMode === "isolated" ? fill.notional_usd / leverage : 0;

  if (!existing) {
    const position: PaperPositionRow = {
      id: newId("paper_pos"),
      paper_account_id: paperAccountId,
      market_type: marketType,
      coin: fill.coin,
      margin_mode: marginMode,
      signed_size: fillSignedSize,
      entry_px: fill.px,
      leverage,
      isolated_margin_usd: openMargin,
      realized_pnl_usd: 0,
      funding_usd: 0,
      fee_usd: fill.fee_usd,
      status: "open",
      updated_at: createdAt,
      created_at: createdAt,
    };
    await insertPosition(db, position);
    await updatePaperAccountCash(db, account, marginMode === "isolated" ? -(openMargin + fill.fee_usd) : -fill.fee_usd, createdAt);
    return;
  }
  if (Math.abs(existing.signed_size) <= EPSILON || existing.status !== "open") {
    await db.run(
      `UPDATE paper_positions
        SET signed_size = ?, entry_px = ?, leverage = ?, isolated_margin_usd = ?,
            realized_pnl_usd = 0, funding_usd = 0, fee_usd = ?, status = 'open',
            updated_at = ?, created_at = ?
        WHERE id = ?`,
      [fillSignedSize, fill.px, leverage, openMargin, fill.fee_usd, createdAt, createdAt, existing.id],
    );
    await updatePaperAccountCash(db, account, marginMode === "isolated" ? -(openMargin + fill.fee_usd) : -fill.fee_usd, createdAt);
    return;
  }

  const existingDirection = Math.sign(existing.signed_size);
  const fillDirection = Math.sign(fillSignedSize);
  let signedSize = existing.signed_size;
  let entryPx = existing.entry_px;
  let realizedPnl = existing.realized_pnl_usd;
  let isolatedMargin = existing.isolated_margin_usd;
  let cashDelta = -fill.fee_usd;

  if (existingDirection === fillDirection) {
    const oldAbs = Math.abs(existing.signed_size);
    const newAbs = oldAbs + fill.size;
    entryPx = ((oldAbs * existing.entry_px) + (fill.size * fill.px)) / newAbs;
    signedSize = existing.signed_size + fillSignedSize;
    isolatedMargin += openMargin;
    if (marginMode === "isolated") cashDelta -= openMargin;
  } else {
    const closingSize = Math.min(Math.abs(existing.signed_size), fill.size);
    const pnl = closingSize * (fill.px - existing.entry_px) * existingDirection;
    realizedPnl += pnl;
    cashDelta += pnl;
    if (marginMode === "isolated") {
      const release = existing.isolated_margin_usd * (closingSize / Math.abs(existing.signed_size));
      isolatedMargin -= release;
      cashDelta += release;
    }
    signedSize = existing.signed_size + fillSignedSize;
    if (Math.abs(signedSize) <= EPSILON) {
      signedSize = 0;
      isolatedMargin = 0;
    } else if (Math.sign(signedSize) !== existingDirection) {
      const flippedSize = Math.abs(signedSize);
      entryPx = fill.px;
      isolatedMargin = marginMode === "isolated" ? flippedSize * fill.px / leverage : 0;
      if (marginMode === "isolated") cashDelta -= isolatedMargin;
    }
  }

  await db.run(
    `UPDATE paper_positions
      SET signed_size = ?, entry_px = ?, leverage = ?, isolated_margin_usd = ?,
          realized_pnl_usd = ?, fee_usd = ?, status = ?, updated_at = ?
      WHERE id = ?`,
    [
      signedSize,
      entryPx,
      leverage,
      isolatedMargin,
      realizedPnl,
      existing.fee_usd + fill.fee_usd,
      Math.abs(signedSize) <= EPSILON ? "closed" : "open",
      createdAt,
      existing.id,
    ],
  );
  await updatePaperAccountCash(db, account, cashDelta, createdAt);
}

async function applySpotFillToPosition(
  db: LedgerDb,
  account: PaperAccountRow,
  existing: PaperPositionRow | undefined,
  fill: PaperFillRow,
  createdAt: string,
) {
  const cashDelta = fill.side === "buy"
    ? -(fill.notional_usd + fill.fee_usd)
    : fill.notional_usd - fill.fee_usd;

  if (!existing || Math.abs(existing.signed_size) <= EPSILON || existing.status !== "open") {
    if (fill.side === "sell") throw new RequestError("spot_insufficient_position", 400);
    const position: PaperPositionRow = {
      id: newId("paper_pos"),
      paper_account_id: account.id,
      market_type: "spot",
      coin: fill.coin,
      margin_mode: "spot",
      signed_size: fill.size,
      entry_px: fill.px,
      leverage: 1,
      isolated_margin_usd: 0,
      realized_pnl_usd: 0,
      funding_usd: 0,
      fee_usd: fill.fee_usd,
      status: "open",
      updated_at: createdAt,
      created_at: createdAt,
    };
    await insertPosition(db, position);
    await updatePaperAccountCash(db, account, cashDelta, createdAt);
    return;
  }

  if (fill.side === "buy") {
    const oldSize = existing.signed_size;
    const newSize = oldSize + fill.size;
    const entryPx = ((oldSize * existing.entry_px) + (fill.size * fill.px)) / newSize;
    await db.run(
      `UPDATE paper_positions
        SET signed_size = ?, entry_px = ?, fee_usd = ?, status = 'open', updated_at = ?
        WHERE id = ?`,
      [newSize, entryPx, existing.fee_usd + fill.fee_usd, createdAt, existing.id],
    );
    await updatePaperAccountCash(db, account, cashDelta, createdAt);
    return;
  }

  if (fill.size - existing.signed_size > EPSILON) throw new RequestError("spot_insufficient_position", 400);
  const closingSize = Math.min(existing.signed_size, fill.size);
  const realizedPnl = existing.realized_pnl_usd + closingSize * (fill.px - existing.entry_px);
  const signedSize = roundQty(existing.signed_size - closingSize);
  await db.run(
    `UPDATE paper_positions
      SET signed_size = ?, realized_pnl_usd = ?, fee_usd = ?, status = ?, updated_at = ?
      WHERE id = ?`,
    [
      signedSize,
      realizedPnl,
      existing.fee_usd + fill.fee_usd,
      signedSize <= EPSILON ? "closed" : "open",
      createdAt,
      existing.id,
    ],
  );
  await updatePaperAccountCash(db, account, cashDelta, createdAt);
}

async function validateReduceOnlyOrder(
  db: LedgerDb,
  paperAccountId: string,
  input: OrderInput,
  plannedCloseSize: number,
) {
  const position = await db.get<PaperPositionRow>(
    "SELECT * FROM paper_positions WHERE paper_account_id = ? AND market_type = ? AND coin = ? AND margin_mode = ?",
    [paperAccountId, input.marketType, input.coin, input.marginMode],
  );
  if (!position || position.status !== "open" || Math.abs(position.signed_size) <= EPSILON) {
    return "reduce_only_position_not_open";
  }
  const orderSignedSize = input.side === "buy" ? input.size : -input.size;
  if (Math.sign(orderSignedSize) === Math.sign(position.signed_size)) {
    return "reduce_only_would_increase";
  }
  if (plannedCloseSize - Math.abs(position.signed_size) > EPSILON) {
    return "reduce_only_exceeds_position";
  }
  return null;
}

function validateSpotOrderShape(input: OrderInput) {
  if (input.marginMode !== "spot") return "spot_margin_mode_required";
  if (Math.abs(input.leverage - 1) > EPSILON) return "spot_leverage_must_be_one";
  if (input.reduceOnly) return "spot_reduce_only_not_supported";
  return null;
}

async function validateSpotOrderBalances(
  db: LedgerDb,
  account: PaperAccountRow,
  input: OrderInput,
  maxNotional: number,
  fee: number,
) {
  if (input.side === "buy") {
    return account.cash_balance_usd + EPSILON < maxNotional + fee ? "spot_insufficient_cash" : null;
  }
  const position = await db.get<PaperPositionRow>(
    "SELECT * FROM paper_positions WHERE paper_account_id = ? AND market_type = 'spot' AND coin = ? AND margin_mode = 'spot'",
    [account.id, input.coin],
  );
  if (!position || position.status !== "open" || position.signed_size + EPSILON < input.size) {
    return "spot_insufficient_position";
  }
  return null;
}

async function writeRiskAndLeaderboard(
  db: LedgerDb,
  paperAccountId: string,
  sourceMarketSnapshotId: string | null,
  createdAt: string,
) {
  const risk = await computeAccountRisk(db, paperAccountId, sourceMarketSnapshotId, createdAt);
  await insertRiskSnapshot(db, risk);
  const leaderboard = await createLeaderboardSnapshot(db, paperAccountId, risk, createdAt);
  return { risk: presentRisk(risk), leaderboard: presentLeaderboardSnapshot(leaderboard) };
}

async function computeAccountRisk(
  db: LedgerDb,
  paperAccountId: string,
  sourceMarketSnapshotId: string | null,
  createdAt: string,
): Promise<PaperRiskSnapshotRow> {
  const account = await requirePaperAccount(db, paperAccountId);
  const positions = await listOpenPositions(db, paperAccountId);
  const snapshots = await latestSnapshotsForPositions(db, positions);
  let totalNotional = 0;
  let maintenance = 0;
  let unrealizedPnl = 0;
  let stale = false;
  for (const position of positions) {
    const snapshot = snapshots.get(positionKey(position));
    if (!snapshot || marketIsStale(snapshot, Date.parse(createdAt))) {
      stale = true;
      continue;
    }
    const risk = computePositionRisk(position, snapshot);
    totalNotional += risk.notional;
    maintenance += risk.maintenanceMargin;
    unrealizedPnl += risk.unrealizedPnl;
  }
  return {
    id: newId("paper_risk"),
    ingest_sequence: await nextIngestSequence(db, "paper_risk_snapshots"),
    paper_account_id: paperAccountId,
    equity_usd: account.cash_balance_usd + unrealizedPnl,
    cash_balance_usd: account.cash_balance_usd,
    total_notional_usd: totalNotional,
    maintenance_margin_usd: maintenance,
    unrealized_pnl_usd: unrealizedPnl,
    staleness_status: stale ? "stale_market_data" : "fresh",
    source_market_snapshot_id: sourceMarketSnapshotId,
    created_at: createdAt,
  };
}

function computePositionRisk(position: PaperPositionRow, snapshot: PaperMarketSnapshotRow) {
  const notional = Math.abs(position.signed_size) * snapshot.mark_px;
  const direction = Math.sign(position.signed_size);
  const unrealizedPnl = Math.abs(position.signed_size) * (snapshot.mark_px - position.entry_px) * direction;
  const maintenanceMargin = position.market_type === "spot" ? 0 : notional * snapshot.maintenance_margin_rate;
  return {
    notional,
    unrealizedPnl,
    maintenanceMargin,
    isolatedEquity: position.isolated_margin_usd + unrealizedPnl,
  };
}

async function liquidatePosition(
  db: LedgerDb,
  paperAccountId: string,
  position: PaperPositionRow,
  snapshot: PaperMarketSnapshotRow,
  risk: { equity_usd: number; maintenance_margin_usd: number },
  createdAt: string,
) {
  const account = await requirePaperAccount(db, paperAccountId);
  const positionRisk = computePositionRisk(position, snapshot);
  const uncappedCashDelta = position.margin_mode === "isolated"
    ? position.isolated_margin_usd + positionRisk.unrealizedPnl
    : positionRisk.unrealizedPnl;
  const cashDelta = position.margin_mode === "isolated"
    ? Math.max(0, uncappedCashDelta)
    : Math.max(uncappedCashDelta, -account.cash_balance_usd);
  const realizedPnl = position.margin_mode === "isolated"
    ? cashDelta - position.isolated_margin_usd
    : cashDelta;
  await updatePaperAccountCash(db, account, cashDelta, createdAt);
  await db.run(
    "UPDATE paper_positions SET signed_size = 0, status = 'liquidated', realized_pnl_usd = ?, isolated_margin_usd = 0, updated_at = ? WHERE id = ?",
    [position.realized_pnl_usd + realizedPnl, createdAt, position.id],
  );
  const event: PaperLiquidationEventRow = {
    id: newId("paper_liq"),
    paper_account_id: paperAccountId,
    position_id: position.id,
    coin: position.coin,
    trigger_px: snapshot.mark_px,
    liquidation_px: snapshot.mark_px,
    equity_usd: risk.equity_usd,
    maintenance_margin_usd: risk.maintenance_margin_usd,
    reason: `${position.margin_mode}_maintenance_margin_breach`,
    market_snapshot_id: snapshot.id,
    created_at: createdAt,
  };
  await insertLiquidation(db, event);
  await appendPaperAuditEvent(db, paperAccountId, "paper_liquidation", event.id, "paper_position_liquidated", { position, snapshot, risk, event }, createdAt);
  return event;
}

async function createLeaderboardSnapshot(
  db: LedgerDb,
  paperAccountId: string,
  risk: PaperRiskSnapshotRow,
  createdAt: string,
) {
  const account = await requirePaperAccount(db, paperAccountId);
  const previousHigh = await db.get<{ high: number }>(
    "SELECT MAX(equity_usd) AS high FROM paper_leaderboard_snapshots WHERE paper_account_id = ?",
    [paperAccountId],
  );
  const high = Math.max(previousHigh?.high ?? account.starting_balance_usd, risk.equity_usd);
  const liquidationCount = await db.get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM paper_liquidation_events WHERE paper_account_id = ?",
    [paperAccountId],
  );
  const paperPnl = risk.equity_usd - account.starting_balance_usd;
  const snapshot: PaperLeaderboardSnapshotRow = {
    id: newId("paper_lb"),
    paper_account_id: paperAccountId,
    agent_id: account.agent_id,
    equity_usd: risk.equity_usd,
    paper_pnl_usd: paperPnl,
    paper_pnl_pct: account.starting_balance_usd === 0 ? 0 : paperPnl / account.starting_balance_usd,
    max_drawdown_pct: high <= 0 ? 0 : Math.max(0, (high - risk.equity_usd) / high),
    liquidation_count: liquidationCount?.count ?? 0,
    stale_data_status: risk.staleness_status,
    source_risk_snapshot_id: risk.id,
    created_at: createdAt,
  };
  await insertLeaderboardSnapshot(db, snapshot);
  return snapshot;
}

function planTakerFills(side: "buy" | "sell", size: number, limitPx: number, book: Book): FillCandidate[] {
  const levels = side === "buy" ? book.asks : book.bids;
  const fills: FillCandidate[] = [];
  let remaining = size;
  for (const level of levels) {
    const priceOk = side === "buy" ? level.px <= limitPx + EPSILON : level.px >= limitPx - EPSILON;
    if (!priceOk) break;
    const fillSize = Math.min(remaining, level.sz);
    if (fillSize <= 0) continue;
    fills.push({ px: level.px, size: fillSize, notional: fillSize * level.px });
    remaining = roundQty(remaining - fillSize);
    if (remaining <= EPSILON) break;
  }
  return fills;
}

function effectiveLimitPx(input: OrderInput, book: Book) {
  if (input.limitPx !== null) return input.limitPx;
  if (input.side === "buy") {
    const bestAsk = book.asks[0]?.px;
    if (!bestAsk) throw new RequestError("Missing asks for market-like paper order", 400);
    return bestAsk * (1 + input.maxSlippageBps / 10_000);
  }
  const bestBid = book.bids[0]?.px;
  if (!bestBid) throw new RequestError("Missing bids for market-like paper order", 400);
  return bestBid * (1 - input.maxSlippageBps / 10_000);
}

function wouldCross(side: "buy" | "sell", limitPx: number, book: Book) {
  return side === "buy"
    ? book.asks.length > 0 && limitPx >= book.asks[0].px
    : book.bids.length > 0 && limitPx <= book.bids[0].px;
}

function orderStatus(tif: OrderInput["tif"], filledSize: number, remainingSize: number) {
  if (filledSize > 0 && remainingSize <= EPSILON) return "filled";
  if (filledSize > 0 && tif === "Gtc") return "partially_filled_resting";
  if (filledSize > 0) return "partially_filled";
  return "resting";
}

function readBook(data: JsonObject): Book {
  if (data.book && typeof data.book === "object") return parseBook(JSON.stringify(data.book));
  return {
    bids: readLevels(data.bids, "bids", "desc"),
    asks: readLevels(data.asks, "asks", "asc"),
  };
}

function parseBook(value: string): Book {
  const data = asObject(JSON.parse(value));
  return {
    bids: readLevels(data.bids, "bids", "desc"),
    asks: readLevels(data.asks, "asks", "asc"),
  };
}

function readLevels(value: unknown, name: string, order: "asc" | "desc") {
  if (!Array.isArray(value)) throw new RequestError(`Missing ${name}`, 400);
  return value.map((item) => {
    const level = asObject(item);
    return {
      px: requiredPositiveNumber(level.px ?? level.price, `${name}.px`),
      sz: requiredPositiveNumber(level.sz ?? level.size, `${name}.sz`),
      n: optionalNumber(level.n, `${name}.n`),
    };
  }).sort((a, b) => order === "asc" ? a.px - b.px : b.px - a.px);
}

async function latestMarketSnapshot(db: LedgerDb, marketType: MarketType | string, coin: string) {
  return await db.get<PaperMarketSnapshotRow>(
    "SELECT * FROM paper_market_snapshots WHERE market_type = ? AND coin = ? ORDER BY observed_at DESC, COALESCE(ingest_sequence, 0) DESC, created_at DESC, id DESC LIMIT 1",
    [marketType, coin],
  );
}

async function latestSnapshotsForPositions(db: LedgerDb, positions: PaperPositionRow[]) {
  const snapshots = new Map<string, PaperMarketSnapshotRow>();
  for (const position of positions) {
    const key = positionKey(position);
    if (snapshots.has(key)) continue;
    const snapshot = await latestMarketSnapshot(db, position.market_type, position.coin);
    if (snapshot) snapshots.set(key, snapshot);
  }
  return snapshots;
}

function positionKey(position: Pick<PaperPositionRow, "market_type" | "coin">) {
  return `${position.market_type}:${position.coin}`;
}

function latestSnapshotId(snapshots: Map<string, PaperMarketSnapshotRow>) {
  return [...snapshots.values()].sort((a, b) => {
    const observed = b.observed_at.localeCompare(a.observed_at);
    if (observed !== 0) return observed;
    return (b.ingest_sequence ?? 0) - (a.ingest_sequence ?? 0);
  })[0]?.id ?? null;
}

function marketIsStale(snapshot: PaperMarketSnapshotRow, nowMs: number) {
  return snapshot.staleness_status !== "fresh" || nowMs - Date.parse(snapshot.observed_at) > MARKET_STALE_MS;
}

function marketAllowed(account: PaperAccountRow, marketType: MarketType, coin: string) {
  if (!account.allowed_markets_json) return false;
  const markets = parseJson(account.allowed_markets_json);
  if (isHyperliquidSupportedMarketScope(markets)) return true;
  if (!Array.isArray(markets)) return false;
  const allowed = markets.map(String).map((item) => item.toUpperCase());
  return allowed.includes(coin) || allowed.includes(`${marketType}:${coin}`.toUpperCase());
}

function isHyperliquidSupportedMarketScope(value: unknown) {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as { scope?: unknown }).scope === "hyperliquid_supported";
}

async function requirePaperAccount(db: LedgerDb, id: string) {
  const account = await db.get<PaperAccountRow>("SELECT * FROM paper_accounts WHERE id = ?", [id]);
  if (!account) throw new RequestError("Paper account not found", 404);
  return account;
}

async function requireLockedPaperAccount(db: LedgerDb, id: string) {
  const account = await db.get<PaperAccountRow>(
    db.provider === "neon-postgres"
      ? "SELECT * FROM paper_accounts WHERE id = ? FOR UPDATE"
      : "SELECT * FROM paper_accounts WHERE id = ?",
    [id],
  );
  if (!account) throw new RequestError("Paper account not found", 404);
  return account;
}

async function listOpenPositions(db: LedgerDb, paperAccountId: string) {
  return await db.all<PaperPositionRow>(
    "SELECT * FROM paper_positions WHERE paper_account_id = ? AND status = 'open' AND ABS(signed_size) > 0 ORDER BY market_type ASC, coin ASC",
    [paperAccountId],
  );
}

async function listFills(db: LedgerDb, orderId: string) {
  return await db.all<PaperFillRow>("SELECT * FROM paper_fills WHERE order_id = ? ORDER BY created_at ASC, id ASC", [orderId]);
}

async function listRecentOrders(db: LedgerDb, paperAccountId: string, limit: number) {
  return await db.all<PaperOrderRow>(
    `SELECT * FROM paper_orders
      WHERE paper_account_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    [paperAccountId, limit],
  );
}

async function listRecentAccountFills(db: LedgerDb, paperAccountId: string, limit: number) {
  return await db.all<PaperFillRow>(
    `SELECT * FROM paper_fills
      WHERE paper_account_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    [paperAccountId, limit],
  );
}

async function listRecentRiskSnapshots(db: LedgerDb, paperAccountId: string, limit: number) {
  return await db.all<PaperRiskSnapshotRow>(
    `SELECT * FROM (
        SELECT * FROM paper_risk_snapshots
          WHERE paper_account_id = ?
          ORDER BY created_at DESC, COALESCE(ingest_sequence, 0) DESC, id DESC
          LIMIT ?
      ) AS recent
      ORDER BY created_at ASC, COALESCE(ingest_sequence, 0) ASC, id ASC`,
    [paperAccountId, limit],
  );
}

async function latestRiskSnapshot(db: LedgerDb, paperAccountId: string) {
  const row = await db.get<PaperRiskSnapshotRow>(
    "SELECT * FROM paper_risk_snapshots WHERE paper_account_id = ? ORDER BY created_at DESC, COALESCE(ingest_sequence, 0) DESC, id DESC LIMIT 1",
    [paperAccountId],
  );
  return row ? presentRisk(row) : null;
}

async function paperOrderCounts(db: LedgerDb, paperAccountId: string) {
  const row = await db.get<{
    total_orders: number;
    filled_orders: number;
    rejected_orders: number;
    open_orders: number;
    total_fills: number;
  }>(
    `SELECT
        COUNT(o.id) AS total_orders,
        SUM(CASE WHEN status = 'filled' THEN 1 ELSE 0 END) AS filled_orders,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_orders,
        SUM(CASE WHEN status NOT IN ('filled', 'rejected') THEN 1 ELSE 0 END) AS open_orders,
        (SELECT COUNT(*) FROM paper_fills WHERE paper_account_id = ?) AS total_fills
       FROM paper_orders AS o
       WHERE o.paper_account_id = ?`,
    [paperAccountId, paperAccountId],
  );
  return {
    total_orders: Number(row?.total_orders ?? 0),
    filled_orders: Number(row?.filled_orders ?? 0),
    rejected_orders: Number(row?.rejected_orders ?? 0),
    open_orders: Number(row?.open_orders ?? 0),
    total_fills: Number(row?.total_fills ?? 0),
  };
}

async function insertOrder(db: LedgerDb, order: PaperOrderRow) {
  await db.run(
    `INSERT INTO paper_orders
      (id, paper_account_id, agent_id, client_order_id, market_type, coin, side, tif, limit_px,
       size, remaining_size, reduce_only, margin_mode, leverage, max_slippage_bps,
       reference_px, max_reference_deviation_bps, reference_deviation_bps,
       status, reject_reason, reason, strategy_hash, market_snapshot_id, avg_fill_px,
       notional_usd, fee_usd, body_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order.id, order.paper_account_id, order.agent_id, order.client_order_id,
      order.market_type, order.coin, order.side, order.tif, order.limit_px, order.size, order.remaining_size,
      order.reduce_only, order.margin_mode, order.leverage, order.max_slippage_bps,
      order.reference_px, order.max_reference_deviation_bps, order.reference_deviation_bps,
      order.status, order.reject_reason, order.reason, order.strategy_hash,
      order.market_snapshot_id, order.avg_fill_px, order.notional_usd, order.fee_usd,
      order.body_hash, order.created_at, order.updated_at,
    ],
  );
}

async function insertFill(db: LedgerDb, fill: PaperFillRow) {
  await db.run(
    `INSERT INTO paper_fills
      (id, order_id, paper_account_id, market_type, coin, side, px, size, notional_usd, fee_usd,
       liquidity, market_snapshot_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fill.id, fill.order_id, fill.paper_account_id, fill.market_type, fill.coin, fill.side,
      fill.px, fill.size, fill.notional_usd, fill.fee_usd, fill.liquidity,
      fill.market_snapshot_id, fill.created_at,
    ],
  );
}

async function insertPosition(db: LedgerDb, position: PaperPositionRow) {
  await db.run(
    `INSERT INTO paper_positions
      (id, paper_account_id, market_type, coin, margin_mode, signed_size, entry_px, leverage,
       isolated_margin_usd, realized_pnl_usd, funding_usd, fee_usd, status,
       updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      position.id, position.paper_account_id, position.market_type, position.coin, position.margin_mode,
      position.signed_size, position.entry_px, position.leverage,
      position.isolated_margin_usd, position.realized_pnl_usd, position.funding_usd,
      position.fee_usd, position.status, position.updated_at, position.created_at,
    ],
  );
}

async function insertRiskSnapshot(db: LedgerDb, risk: PaperRiskSnapshotRow) {
  await db.run(
    `INSERT INTO paper_risk_snapshots
      (id, ingest_sequence, paper_account_id, equity_usd, cash_balance_usd, total_notional_usd,
       maintenance_margin_usd, unrealized_pnl_usd, staleness_status,
       source_market_snapshot_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      risk.id, risk.ingest_sequence, risk.paper_account_id, risk.equity_usd, risk.cash_balance_usd,
      risk.total_notional_usd, risk.maintenance_margin_usd, risk.unrealized_pnl_usd,
      risk.staleness_status, risk.source_market_snapshot_id, risk.created_at,
    ],
  );
}

async function insertLiquidation(db: LedgerDb, event: PaperLiquidationEventRow) {
  await db.run(
    `INSERT INTO paper_liquidation_events
      (id, paper_account_id, position_id, coin, trigger_px, liquidation_px, equity_usd,
       maintenance_margin_usd, reason, market_snapshot_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id, event.paper_account_id, event.position_id, event.coin, event.trigger_px,
      event.liquidation_px, event.equity_usd, event.maintenance_margin_usd,
      event.reason, event.market_snapshot_id, event.created_at,
    ],
  );
}

async function insertLeaderboardSnapshot(db: LedgerDb, snapshot: PaperLeaderboardSnapshotRow) {
  await db.run(
    `INSERT INTO paper_leaderboard_snapshots
      (id, paper_account_id, agent_id, equity_usd, paper_pnl_usd, paper_pnl_pct,
       max_drawdown_pct, liquidation_count, stale_data_status, source_risk_snapshot_id,
       created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.id, snapshot.paper_account_id, snapshot.agent_id, snapshot.equity_usd,
      snapshot.paper_pnl_usd, snapshot.paper_pnl_pct, snapshot.max_drawdown_pct,
      snapshot.liquidation_count, snapshot.stale_data_status,
      snapshot.source_risk_snapshot_id, snapshot.created_at,
    ],
  );
}

async function updatePaperAccountCash(db: LedgerDb, account: PaperAccountRow, delta: number, updatedAt: string) {
  await db.run(
    "UPDATE paper_accounts SET cash_balance_usd = cash_balance_usd + ?, updated_at = ? WHERE id = ?",
    [delta, updatedAt, account.id],
  );
}

async function appendPaperAuditEvent(
  db: LedgerDb,
  paperAccountId: string | null,
  subjectType: string,
  subjectId: string,
  action: string,
  input: unknown,
  createdAt: string,
) {
  const ingestSequence = await nextIngestSequence(db, "paper_audit_events");
  const previous = await db.get<{ event_hash: string }>(
    "SELECT event_hash FROM paper_audit_events ORDER BY COALESCE(ingest_sequence, 0) DESC, created_at DESC, id DESC LIMIT 1",
  );
  const inputHash = sha256Hex(JSON.stringify(input));
  const eventHash = sha256Hex(JSON.stringify({
    ingest_sequence: ingestSequence,
    paper_account_id: paperAccountId,
    subject_type: subjectType,
    subject_id: subjectId,
    action,
    input_hash: inputHash,
    previous_hash: previous?.event_hash ?? null,
    created_at: createdAt,
  }));
  await db.run(
    `INSERT INTO paper_audit_events
      (id, ingest_sequence, paper_account_id, subject_type, subject_id, action, input_hash,
       previous_hash, event_hash, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId("paper_audit"), ingestSequence, paperAccountId, subjectType, subjectId, action,
      inputHash, previous?.event_hash ?? null, eventHash, JSON.stringify(input),
      createdAt,
    ],
  );
}

async function nextIngestSequence(
  db: LedgerDb,
  table: "paper_market_snapshots" | "paper_risk_snapshots" | "paper_audit_events",
) {
  const row = await db.get<{ next_sequence: number }>(
    `SELECT COALESCE(MAX(ingest_sequence), 0) + 1 AS next_sequence FROM ${table}`,
  );
  return row?.next_sequence ?? 1;
}

function presentPaperAccount(account: PaperAccountRow) {
  return {
    ...account,
    allowed_markets: parseJson(account.allowed_markets_json),
    metadata: parseJson(account.metadata_json),
    allowed_markets_json: undefined,
    metadata_json: undefined,
  };
}

function presentMarketSnapshot(snapshot: PaperMarketSnapshotRow) {
  return { ...snapshot, ingest_sequence: undefined, book: parseJson(snapshot.book_json), book_json: undefined };
}

function presentOrder(order: PaperOrderRow) {
  return { ...order, reduce_only: Boolean(order.reduce_only) };
}

function presentActivityOrder(order: PaperOrderRow) {
  const { body_hash: _bodyHash, ...presented } = presentOrder(order);
  return presented;
}

function presentFill(fill: PaperFillRow) {
  return fill;
}

function presentPosition(position: PaperPositionRow) {
  return position;
}

function presentRisk(risk: PaperRiskSnapshotRow) {
  return { ...risk, ingest_sequence: undefined };
}

function presentLiquidation(event: PaperLiquidationEventRow) {
  return event;
}

function presentLeaderboardSnapshot(snapshot: PaperLeaderboardSnapshotRow) {
  return snapshot;
}

function presentAudit(event: PaperAuditEventRow) {
  return { ...event, ingest_sequence: undefined, metadata: parseJson(event.metadata_json), metadata_json: undefined };
}

function sumNotional(fills: FillCandidate[]) {
  return fills.reduce((sum, fill) => sum + fill.notional, 0);
}

function referenceDeviation(referencePx: number, markPx: number) {
  return Math.abs(referencePx - markPx) / markPx * 10_000;
}

function roundQty(value: number) {
  return Math.abs(value) <= EPSILON ? 0 : Number(value.toFixed(12));
}

function normalizeCoin(value: unknown) {
  return requiredString(value, "coin").toUpperCase();
}

function normalizeMarketType(value: unknown): MarketType {
  const type = (cleanString(value) ?? "perp").toLowerCase();
  if (type === "perp" || type === "perps" || type === "futures") return "perp";
  if (type === "spot") return "spot";
  throw new RequestError("market_type must be perp or spot", 400);
}

function normalizeSide(value: unknown): "buy" | "sell" {
  const side = requiredString(value, "side").toLowerCase();
  if (side !== "buy" && side !== "sell") throw new RequestError("side must be buy or sell", 400);
  return side;
}

function normalizeTif(value: string): "Ioc" | "Gtc" | "Alo" {
  const normalized = value.toLowerCase();
  if (normalized === "ioc" || normalized === "market") return "Ioc";
  if (normalized === "gtc") return "Gtc";
  if (normalized === "alo" || normalized === "post_only" || normalized === "post-only") return "Alo";
  throw new RequestError("tif must be Ioc, Gtc, or Alo", 400);
}

function normalizeMarginMode(value: unknown, marketType: MarketType): MarginMode {
  if (marketType === "spot") {
    const mode = (cleanString(value) ?? "spot").toLowerCase();
    if (mode !== "spot") throw new RequestError("margin_mode must be spot for spot paper orders", 400);
    return "spot";
  }
  const mode = (cleanString(value) ?? "cross").toLowerCase();
  if (mode !== "cross" && mode !== "isolated") throw new RequestError("margin_mode must be cross or isolated", 400);
  return mode;
}

function requiredPositiveNumber(value: unknown, name: string) {
  const parsed = requiredNumber(value, name);
  if (parsed <= 0) throw new RequestError(`${name} must be greater than 0`, 400);
  return parsed;
}

function optionalPositiveNumber(value: unknown, name: string) {
  const parsed = optionalNumber(value, name);
  if (parsed !== null && parsed <= 0) throw new RequestError(`${name} must be greater than 0`, 400);
  return parsed;
}

function optionalNonNegativeNumber(value: unknown, name: string) {
  const parsed = optionalNumber(value, name);
  if (parsed !== null && parsed < 0) throw new RequestError(`${name} must be greater than or equal to 0`, 400);
  return parsed;
}

function normalizedTimestamp(value: unknown, fallback: string, name: string) {
  const timestamp = cleanString(value) ?? fallback;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) throw new RequestError(`Invalid ${name}`, 400);
  return new Date(parsed).toISOString();
}

function boundedActivityLimit(value: number | undefined) {
  const limit = value ?? 120;
  if (!Number.isInteger(limit) || limit < 1 || limit > 240) {
    throw new RequestError("Invalid limit", 400);
  }
  return limit;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("Request body must be a JSON object", 400);
  }
  return value as JsonObject;
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

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? (error as { code?: unknown }).code : null;
  return code === "23505" || error.message.includes("UNIQUE constraint failed");
}

export class PaperAuthError extends Error {
  readonly status = 401;
}
