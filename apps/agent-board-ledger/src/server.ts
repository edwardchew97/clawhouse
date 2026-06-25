import { PublicKey, keyToImplicitAddress } from "@near-js/crypto";
import { asObject, cleanString, findEventByAssociations, getBoard, latestHoldingSnapshot, latestObservation, latestPnlSnapshot, listAttachments, listEvents, newId, normalizeBodyFields, openMigratedRuntimeLedgerDb, requiredNumber, requiredString, RequestError, stringifyOptional, type LedgerDb } from "./db.js";
import { ADMIN_TOKEN_ENV, AuthError, ServiceAuthError, assertServiceBearer, canonicalAgentAuthPayload, canonicalAuthPayload, readAgentSignedHeaders, readSignedHeaders, sha256Hex, timestampIsFresh, tokensMatch, verifySignature } from "./auth.js";
import { refreshHyperliquidPaperMarketSnapshot, refreshHyperliquidPaperMarketSnapshots, runPaperLiquidationMonitor } from "./hyperliquid.js";
import { listKeyMarketTrades, reportKeyMarketTrade } from "./key-market.js";
import { PaperAuthError, createPaperAccount, readPaperAccount, readPaperAccountActivity, readPaperLeaderboard, replayPaperOrder, runPaperRiskCheck, submitPaperOrder } from "./paper-trading.js";
import type { AgentRegistrationRow, AttachmentRow, BalanceChangeRow, Board, EventRow, HoldingSnapshot, JsonObject, ObservationRow, PaperAccountRow, PnlSnapshot, PriceSnapshotRow, ReadAccessCheckRow } from "./types.js";

type AppOptions = {
  db: LedgerDb;
  now?: () => Date;
  adminToken?: string;
  rpcFetch?: FetchLike;
  env?: RuntimeEnv;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type RuntimeEnv = Record<string, string | undefined>;

type RouteContext = {
  params: Record<string, string>;
  path: string;
};

type AgentAuthPurpose = "agent_registration" | "board_registration" | "paper_account_registration" | "creator_onboarding_registration";

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
const NEAR_RPC_URL_ENV = "AGENT_BOARD_LEDGER_NEAR_RPC_URL";
const DEFAULT_READ_GRANT_TTL_MS = 10 * 60 * 1000;
const MAX_READ_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CREATOR_PAPER_STARTING_BALANCE_USD = 10000;
const HYPERLIQUID_SUPPORTED_MARKET_SCOPE = { scope: "hyperliquid_supported" } as const;

export function createApp(options: AppOptions) {
  const db = options.db;
  const currentDate = () => (options.now ? options.now() : new Date());
  const now = () => currentDate().toISOString();
  const adminToken = options.adminToken ?? process.env[ADMIN_TOKEN_ENV];
  const rpcFetch = options.rpcFetch ?? fetch;
  const env = options.env ?? process.env;

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

        if (method === "GET" && path === "/boards") {
          return json(await listDiscoverableBoards(db));
        }

        if (method === "POST" && path === "/agents") {
          assertServiceBearer(request.headers, adminToken);
          return json(await registerAgent(db, request, await readBody(request), now()), 201);
        }
        if (method === "POST" && path === "/creator-onboarding/register") {
          return json(await registerCreatorOnboarding(db, request, await readBody(request), now()), 201);
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
        const boardPaperAccountMatch = path.match(/^\/boards\/([^/]+)\/paper-account$/);
        const keyMarketTradesMatch = path.match(/^\/key-market\/trades$/);
        const paperAccountMatch = path.match(/^\/paper\/accounts\/([^/]+)$/);
        const paperAccountActivityMatch = path.match(/^\/paper\/accounts\/([^/]+)\/activity$/);
        const paperRiskCheckMatch = path.match(/^\/paper\/accounts\/([^/]+)\/risk-check$/);
        const paperOrderReplayMatch = path.match(/^\/paper\/orders\/([^/]+)\/replay$/);

        if (method === "POST" && path === "/boards") {
          assertServiceBearer(request.headers, adminToken);
          return json(await createBoard(db, request, await readBody(request), now()), 201);
        }
        if (method === "GET" && boardMatch) {
          const board = await requireBoard(db, boardMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "public_summary", rpcFetch);
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
        if (method === "GET" && balanceChangesMatch) {
          const board = await requireBoard(db, balanceChangesMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "key_holder_detail", rpcFetch);
          return json({ ok: true, board_id: board.id, balance_changes: await listBalanceChanges(db, board.id) });
        }
        if (method === "POST" && pricesMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await createPriceSnapshots(db, await readBody(request), pricesMatch[1], now()), 201);
        }
        if (method === "GET" && pricesMatch) {
          const board = await requireBoard(db, pricesMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "key_holder_detail", rpcFetch);
          return json({ ok: true, board_id: board.id, prices: await listPriceSnapshots(db, board.id) });
        }
        if (method === "POST" && readAccessChecksMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await createReadAccessCheck(db, await readBody(request), readAccessChecksMatch[1], now()), 201);
        }
        if (method === "POST" && nearKeyMarketReadAccessMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await checkNearKeyMarketReadAccess(db, rpcFetch, env, await readBody(request), nearKeyMarketReadAccessMatch[1], now()), 201);
        }
        if (method === "POST" && nearAccountWatchMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await runNearAccountWatch(db, rpcFetch, env, await readBody(request), nearAccountWatchMatch[1], now()), 201);
        }
        if (method === "POST" && nearFtWatchMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await runNearFtWatch(db, rpcFetch, env, await readBody(request), nearFtWatchMatch[1], now()), 201);
        }
        if (method === "POST" && path === "/cron/tick") {
          assertServiceBearer(request.headers, adminToken);
          return json(await runCronTick(db, rpcFetch, env, now()));
        }
        if (method === "GET" && eventsMatch) {
          const board = await requireBoard(db, eventsMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "key_holder_detail", rpcFetch);
          return json({ events: await listEventTimeline(db, board.id) });
        }
        if (method === "GET" && portfolioMatch) {
          const board = await requireBoard(db, portfolioMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "key_holder_detail", rpcFetch);
          return json(await readPortfolio(db, board.id));
        }
        if (method === "GET" && pnlMatch) {
          const board = await requireBoard(db, pnlMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "key_holder_detail", rpcFetch);
          return json(await readPnl(db, board.id));
        }
        if (method === "GET" && boardPaperAccountMatch) {
          const board = await requireBoard(db, boardPaperAccountMatch[1]);
          await assertBoardRead(db, request, url, board, adminToken, now(), "public_summary", rpcFetch);
          return json(await readPaperAccountForBoard(db, board.id));
        }
        if (method === "GET" && keyMarketTradesMatch) {
          return json(await listKeyMarketTrades(db, env, url.searchParams));
        }
        if (method === "POST" && path === "/key-market/trades/report") {
          return json(await reportKeyMarketTrade(db, rpcFetch, env, await readBody(request), now()), 201);
        }
        if (method === "POST" && path === "/paper/accounts") {
          assertServiceBearer(request.headers, adminToken);
          const createdAt = now();
          const body = await readBody(request);
          await assertPaperAccountRegistrationSignature(db, request, body, createdAt);
          return json(await createPaperAccount(db, body, createdAt), 201);
        }
        if (method === "GET" && paperAccountMatch) {
          await assertPaperAccountRead(db, request, url, paperAccountMatch[1], adminToken, now(), "key_holder_detail", rpcFetch);
          return json(await readPaperAccount(db, paperAccountMatch[1]));
        }
        if (method === "GET" && paperAccountActivityMatch) {
          await assertPaperAccountRead(db, request, url, paperAccountActivityMatch[1], adminToken, now(), "key_holder_detail", rpcFetch);
          return json(await readPaperAccountActivity(db, paperAccountActivityMatch[1], {
            limit: boundedPaperActivityLimit(url.searchParams.get("limit")),
          }));
        }
        if (method === "POST" && path === "/paper/market-snapshots/hyperliquid") {
          assertServiceBearer(request.headers, adminToken);
          return json(await refreshHyperliquidPaperMarketSnapshots(db, rpcFetch, env, await readBody(request), now()), 201);
        }
        if (method === "POST" && path === "/paper/orders") {
          return json(await submitPaperOrder(db, request, await readBody(request), path, now(), {
            refreshMarketData: async (tx, marketType, coin, createdAt) => {
              await refreshHyperliquidPaperMarketSnapshot(tx, rpcFetch, env, marketType, coin, createdAt);
            },
          }), 201);
        }
        if (method === "POST" && path === "/paper/liquidation-monitor/tick") {
          assertServiceBearer(request.headers, adminToken);
          return json(await runPaperLiquidationMonitor(db, rpcFetch, env, now()));
        }
        if (method === "POST" && paperRiskCheckMatch) {
          assertServiceBearer(request.headers, adminToken);
          return json(await runPaperRiskCheck(db, paperRiskCheckMatch[1], now()));
        }
        if (method === "GET" && path === "/paper/leaderboard") {
          return json(await readPaperLeaderboard(db));
        }
        if (method === "GET" && paperOrderReplayMatch) {
          await assertPaperOrderRead(db, request, url, paperOrderReplayMatch[1], adminToken, now(), "key_holder_detail", rpcFetch);
          return json(await replayPaperOrder(db, paperOrderReplayMatch[1]));
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

function boundedPaperActivityLimit(value: string | null) {
  if (!value) return 120;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 240) {
    throw new RequestError("Invalid limit", 400);
  }
  return parsed;
}

async function listDiscoverableBoards(db: LedgerDb) {
  const boards = await db.all<Board>(
    `SELECT * FROM boards
      WHERE public_status = 'active'
        AND visibility_mode = 'public'
      ORDER BY created_at DESC, id ASC
      LIMIT 100`,
  );

  return {
    ok: true,
    mode: "public_active_boards",
    count: boards.length,
    boards: boards.map(presentBoardDiscovery),
  };
}

async function registerAgent(db: LedgerDb, request: Request, body: BodyResult, createdAt: string) {
  const data = normalizeBodyFields(body.json);
  const agentId = requiredString(data.agentId, "agent_id");
  const agentPublicKey = requiredString(data.agentPublicKey, "agent_public_key");
  const status = cleanString(data.status) ?? "active";
  const metadataJson = stringifyOptional(data.metadata);

  await assertAgentSignature(db, request, body.raw, {
    purpose: "agent_registration",
    agentId,
    agentPublicKey,
    boardId: null,
    createdAt,
  });

  return { ok: true, agent: await upsertAgentRegistration(db, { agentId, agentPublicKey, status, metadataJson }, createdAt) };
}

async function upsertAgentRegistration(
  db: LedgerDb,
  input: {
    agentId: string;
    agentPublicKey: string;
    status: string;
    metadataJson: string | null;
  },
  createdAt: string,
) {
  const existing = await db.get<AgentRegistrationRow>(
    "SELECT * FROM agent_registrations WHERE agent_id = ?",
    [input.agentId],
  );
  if (existing && existing.agent_public_key !== input.agentPublicKey) {
    throw new RequestError("Agent ID is already registered to a different public key", 409);
  }
  if (existing) {
    await db.run(
      "UPDATE agent_registrations SET status = ?, metadata_json = ?, updated_at = ? WHERE agent_id = ?",
      [input.status, input.metadataJson, createdAt, input.agentId],
    );
  } else {
    await db.run(
      `INSERT INTO agent_registrations
        (agent_id, agent_public_key, status, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [input.agentId, input.agentPublicKey, input.status, input.metadataJson, createdAt, createdAt],
    );
  }

  return presentAgentRegistration(await requireActiveAgentRegistration(db, input.agentId, input.agentPublicKey));
}

async function registerCreatorOnboarding(db: LedgerDb, request: Request, body: BodyResult, createdAt: string) {
  const data = normalizeBodyFields(body.json);
  const metadata = asOptionalObject(data.metadata);
  const publicProfileMetadata = creatorOnboardingPublicMetadata(data, metadata);
  const agentId = requiredString(data.agentId, "agent_id");
  const agentPublicKey = requiredString(data.agentPublicKey, "agent_public_key");
  const walletAddress = requiredString(data.walletAddress, "wallet_address");
  const publicKey = requiredString(data.publicKey, "public_key");
  assertNearImplicitWalletMatchesPublicKey(walletAddress, publicKey);
  const requestedBoardId = cleanString(data.boardId);
  const existingBoard = requestedBoardId
    ? null
    : await findCreatorOnboardingBoard(db, agentId, agentPublicKey);
  const boardId = requestedBoardId ?? existingBoard?.id ?? newId("board");
  const requestedPaperAccountId = cleanString(data.paperAccountId);
  const board: Board = {
    id: boardId,
    agent_id: agentId,
    agent_public_key: agentPublicKey,
    wallet_address: walletAddress,
    public_key: publicKey,
    chain: cleanString(data.chain) ?? "near",
    venue_namespace: cleanString(data.venueNamespace) ?? "hyperliquid-paper",
    tracking_started_at: normalizedTimestampField(data.trackingStartedAt, createdAt, "tracking_started_at"),
    base_currency: cleanString(data.baseCurrency) ?? "USD",
    public_status: "active",
    visibility_mode: "public",
    owner_wallet_address: cleanString(data.ownerWalletAddress),
    funding_source: cleanString(data.fundingSource),
    funding_tx_hash: cleanString(data.fundingTxHash),
    metadata_json: stringifyOptional(publicProfileMetadata),
    created_at: createdAt,
  };
  const paperBody = {
    paper_account_id: requestedPaperAccountId,
    board_id: boardId,
    agent_id: agentId,
    agent_public_key: agentPublicKey,
    starting_balance_usd: DEFAULT_CREATOR_PAPER_STARTING_BALANCE_USD,
    market_scope: HYPERLIQUID_SUPPORTED_MARKET_SCOPE.scope,
    allowed_markets: HYPERLIQUID_SUPPORTED_MARKET_SCOPE,
    metadata: publicProfileMetadata,
  };
  let registeredAgent: ReturnType<typeof presentAgentRegistration> | null = null;
  let registeredBoard: Board | null = null;

  await db.transaction(async (tx) => {
    await assertBoardRegistrationSignature(tx, request, body.raw, board, Date.parse(createdAt), createdAt, requestedBoardId ?? "");
    await assertAgentSignature(tx, request, body.raw, {
      purpose: "creator_onboarding_registration",
      agentId,
      agentPublicKey,
      boardId: requestedBoardId ?? null,
      createdAt,
    });
    registeredAgent = await upsertAgentRegistration(tx, {
      agentId,
      agentPublicKey,
      status: "active",
      metadataJson: stringifyOptional(publicProfileMetadata),
    }, createdAt);
    registeredBoard = await ensureBoardRegistration(tx, board);
    await ensurePaperAccountRegistration(tx, paperBody, createdAt);
  });

  const paperAccountReadback = await readPaperAccountForBoard(db, boardId);
  return {
    ok: true,
    backend_registered: true,
    agent_id: agentId,
    board_id: boardId,
    paper_account_id: paperAccountReadback.paper_account_id,
    agent: registeredAgent,
    board: registeredBoard,
    paperAccount: paperAccountReadback.account,
  };
}

async function createBoard(db: LedgerDb, request: Request, body: BodyResult, createdAt: string) {
  const data = normalizeBodyFields(body.json);
  const id = cleanString(data.boardId) ?? newId("board");
  const walletAddress = requiredString(data.walletAddress, "wallet_address");
  const publicKey = requiredString(data.publicKey, "public_key");
  assertNearImplicitWalletMatchesPublicKey(walletAddress, publicKey);
  const board: Board = {
    id,
    agent_id: requiredString(data.agentId, "agent_id"),
    agent_public_key: requiredString(data.agentPublicKey, "agent_public_key"),
    wallet_address: walletAddress,
    public_key: publicKey,
    chain: cleanString(data.chain) ?? "near",
    venue_namespace: cleanString(data.venueNamespace) ?? "near-intents",
    tracking_started_at: normalizedTimestampField(data.trackingStartedAt, createdAt, "tracking_started_at"),
    base_currency: cleanString(data.baseCurrency) ?? "USD",
    public_status: cleanString(data.publicStatus) ?? "draft",
    visibility_mode: cleanString(data.visibilityMode) ?? "private",
    owner_wallet_address: cleanString(data.ownerWalletAddress),
    funding_source: cleanString(data.fundingSource),
    funding_tx_hash: cleanString(data.fundingTxHash),
    metadata_json: stringifyOptional(data.metadata),
    created_at: createdAt,
  };

  await db.transaction(async (tx) => {
    await assertBoardRegistrationSignature(tx, request, body.raw, board, Date.parse(createdAt), createdAt);
    await assertAgentSignature(tx, request, body.raw, {
      purpose: "board_registration",
      agentId: board.agent_id,
      agentPublicKey: requiredBoardAgentPublicKey(board),
      boardId: board.id,
      createdAt,
    });
    await requireActiveAgentRegistration(tx, board.agent_id, requiredBoardAgentPublicKey(board));
    await insertBoardRegistration(tx, board);
  });

  return { ok: true, board };
}

async function ensureBoardRegistration(db: LedgerDb, board: Board) {
  const existing = await db.get<Board>("SELECT * FROM boards WHERE id = ?", [board.id]);
  if (existing) {
    assertSameRegisteredField(existing.agent_id, board.agent_id, "board agent_id");
    assertSameRegisteredField(requiredBoardAgentPublicKey(existing), requiredBoardAgentPublicKey(board), "board agent_public_key");
    assertSameRegisteredField(existing.wallet_address, board.wallet_address, "board wallet_address");
    assertSameRegisteredField(existing.public_key, board.public_key, "board public_key");
    assertSameRegisteredField(existing.public_status, board.public_status, "board public_status");
    assertSameRegisteredField(existing.visibility_mode, board.visibility_mode, "board visibility_mode");
    if (!existing.metadata_json && board.metadata_json) {
      await db.run("UPDATE boards SET metadata_json = ? WHERE id = ?", [board.metadata_json, board.id]);
      return { ...existing, metadata_json: board.metadata_json };
    }
    return existing;
  }
  await insertBoardRegistration(db, board);
  return board;
}

async function findCreatorOnboardingBoard(db: LedgerDb, agentId: string, agentPublicKey: string) {
  const boards = await db.all<Board>(
    `SELECT * FROM boards
      WHERE agent_id = ?
        AND agent_public_key = ?
        AND public_status = 'active'
        AND visibility_mode = 'public'
      ORDER BY created_at DESC, id DESC`,
    [agentId, agentPublicKey],
  );
  if (boards.length > 1) {
    throw new RequestError("Multiple active public boards found for agent", 409);
  }
  return boards[0] ?? null;
}

async function insertBoardRegistration(db: LedgerDb, board: Board) {
  await db.run(
    `INSERT INTO boards
      (id, agent_id, agent_public_key, wallet_address, public_key, chain, venue_namespace, tracking_started_at,
       base_currency, public_status, visibility_mode, owner_wallet_address,
       funding_source, funding_tx_hash, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      board.id,
      board.agent_id,
      board.agent_public_key,
      board.wallet_address,
      board.public_key,
      board.chain,
      board.venue_namespace,
      board.tracking_started_at,
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
  await db.run(
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
}

async function ensurePaperAccountRegistration(
  db: LedgerDb,
  paperBody: JsonObject,
  createdAt: string,
) {
  const requestedPaperAccountId = cleanString(paperBody.paper_account_id);
  const boardId = cleanString(paperBody.board_id);
  const existing = requestedPaperAccountId
    ? await db.get<PaperAccountRow>("SELECT * FROM paper_accounts WHERE id = ?", [requestedPaperAccountId])
    : boardId
      ? await db.get<PaperAccountRow>("SELECT * FROM paper_accounts WHERE board_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", [boardId])
      : null;
  if (existing) {
    assertSameRegisteredField(existing.board_id, cleanString(paperBody.board_id), "paper account board_id");
    assertSameRegisteredField(existing.agent_id, cleanString(paperBody.agent_id), "paper account agent_id");
    assertSameRegisteredField(existing.agent_public_key, cleanString(paperBody.agent_public_key), "paper account agent_public_key");
    if (Number(existing.starting_balance_usd) !== DEFAULT_CREATOR_PAPER_STARTING_BALANCE_USD) {
      throw new RequestError("Existing paper account starting_balance_usd does not match registration", 409);
    }
    assertSameRegisteredField(existing.status, "active", "paper account status");
    return await updateCreatorPaperAccount(db, existing, paperBody, createdAt);
  }
  const existingForBoard = boardId
    ? await db.get<PaperAccountRow>("SELECT * FROM paper_accounts WHERE board_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", [boardId])
    : null;
  if (existingForBoard) {
    assertSameRegisteredField(existingForBoard.agent_id, cleanString(paperBody.agent_id), "paper account agent_id");
    assertSameRegisteredField(existingForBoard.agent_public_key, cleanString(paperBody.agent_public_key), "paper account agent_public_key");
    if (Number(existingForBoard.starting_balance_usd) !== DEFAULT_CREATOR_PAPER_STARTING_BALANCE_USD) {
      throw new RequestError("Existing paper account starting_balance_usd does not match registration", 409);
    }
    assertSameRegisteredField(existingForBoard.status, "active", "paper account status");
    return await updateCreatorPaperAccount(db, existingForBoard, paperBody, createdAt);
  }
  const accountBody = {
    ...paperBody,
    paper_account_id: requestedPaperAccountId ?? newId("paper"),
  };
  await createPaperAccount(db, { raw: JSON.stringify(accountBody), json: accountBody }, createdAt);
  const created = await db.get<PaperAccountRow>("SELECT * FROM paper_accounts WHERE id = ?", [accountBody.paper_account_id]);
  if (!created) throw new RequestError("Paper account not found after registration", 500);
  return created;
}

async function updateCreatorPaperAccount(
  db: LedgerDb,
  account: PaperAccountRow,
  paperBody: JsonObject,
  updatedAt: string,
) {
  const allowedMarketsJson = stringifyOptional(paperBody.allowed_markets);
  const metadataJson = stringifyOptional(paperBody.metadata);
  await db.run(
    "UPDATE paper_accounts SET allowed_markets_json = ?, metadata_json = ?, updated_at = ? WHERE id = ?",
    [allowedMarketsJson, metadataJson, updatedAt, account.id],
  );
  return {
    ...account,
    allowed_markets_json: allowedMarketsJson,
    metadata_json: metadataJson,
    updated_at: updatedAt,
  };
}

async function readPaperAccountForBoard(db: LedgerDb, boardId: string) {
  const paperAccount = await db.get<PaperAccountRow>(
    "SELECT * FROM paper_accounts WHERE board_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    [boardId],
  );
  if (!paperAccount) throw new RequestError("Paper account not found", 404);
  const accountReadback = await readPaperAccount(db, paperAccount.id);
  return {
    ...accountReadback,
    board_id: boardId,
    paper_account_id: paperAccount.id,
  };
}

function assertSameRegisteredField(actual: string | null, expected: string | null, name: string) {
  if (actual !== expected) throw new RequestError(`Existing ${name} does not match registration`, 409);
}

function assertNearImplicitWalletMatchesPublicKey(walletAddress: string, publicKey: string) {
  if (!/^[0-9a-f]{64}$/.test(walletAddress)) {
    throw new RequestError("wallet_address must be a 64-character lowercase NEAR implicit account", 400);
  }
  let derived: string;
  try {
    derived = keyToImplicitAddress(PublicKey.fromString(publicKey));
  } catch {
    throw new RequestError("Invalid public_key", 400);
  }
  if (walletAddress !== derived) {
    throw new RequestError("wallet_address must match public_key NEAR implicit account", 400);
  }
}

function creatorOnboardingPublicMetadata(data: JsonObject, metadata: JsonObject) {
  return {
    agent_name: requiredString(data.agentName ?? metadata.agent_name, "agent_name"),
    agent_description: requiredString(data.agentDescription ?? metadata.agent_description, "agent_description"),
    avatar_reference: requiredString(data.avatarReference ?? metadata.avatar_reference, "avatar_reference"),
    trading_strategy: requiredString(data.tradingStrategy ?? metadata.trading_strategy, "trading_strategy"),
  };
}

async function assertBoardRegistrationSignature(
  db: LedgerDb,
  request: Request,
  rawBody: string,
  board: Board,
  nowMs: number,
  createdAt: string,
  signedBoardId = board.id,
) {
  const headers = readSignedHeaders(request.headers);

  if (headers.walletAddress !== board.wallet_address) {
    throw new AuthError("Wallet does not match board registration");
  }
  if (headers.publicKey !== board.public_key) {
    throw new AuthError("Public key does not match board registration");
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
    path: new URL(request.url).pathname,
    bodyHash: actualBodyHash,
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    boardId: signedBoardId,
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

async function assertAgentSignature(
  db: LedgerDb,
  request: Request,
  rawBody: string,
  input: {
    purpose: AgentAuthPurpose;
    agentId: string;
    agentPublicKey: string;
    boardId: string | null;
    createdAt: string;
  },
) {
  const headers = readAgentSignedHeaders(request.headers);

  if (headers.publicKey !== input.agentPublicKey) {
    throw new AuthError("Agent public key does not match signed agent");
  }

  const actualBodyHash = sha256Hex(rawBody);
  if (headers.bodyHash !== actualBodyHash) {
    throw new AuthError("Agent body hash mismatch");
  }
  if (!timestampIsFresh(headers.timestamp, Date.parse(input.createdAt))) {
    throw new AuthError("Agent signature timestamp is stale");
  }

  const payload = canonicalAgentAuthPayload({
    purpose: input.purpose,
    method: request.method,
    path: new URL(request.url).pathname,
    bodyHash: actualBodyHash,
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    agentId: input.agentId,
    agentPublicKey: input.agentPublicKey,
    boardId: input.boardId,
  });

  if (!verifySignature(headers.publicKey, payload, headers.signature)) {
    throw new AuthError("Invalid agent signature");
  }

  try {
    await db.run(
      `INSERT INTO agent_auth_nonces
        (id, agent_id, agent_public_key, purpose, nonce, timestamp, body_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId("agent_nonce"), input.agentId, input.agentPublicKey, input.purpose, headers.nonce, headers.timestamp, actualBodyHash, input.createdAt],
    );
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    throw new AuthError("Agent nonce replay rejected");
  }
}

async function assertPaperAccountRegistrationSignature(
  db: LedgerDb,
  request: Request,
  body: BodyResult,
  createdAt: string,
) {
  const data = normalizeBodyFields(body.json);
  const boardId = cleanString(data.boardId);
  let agentId: string;
  let agentPublicKey: string;

  if (boardId) {
    const board = await requireBoard(db, boardId);
    agentId = board.agent_id;
    agentPublicKey = requiredBoardAgentPublicKey(board);

    const suppliedAgentId = cleanString(data.agentId);
    if (suppliedAgentId && suppliedAgentId !== agentId) {
      throw new RequestError("paper account agent_id must match board agent_id", 400);
    }
    const suppliedAgentPublicKey = cleanString(data.agentPublicKey);
    if (suppliedAgentPublicKey && suppliedAgentPublicKey !== agentPublicKey) {
      throw new RequestError("paper account agent_public_key must match board agent_public_key", 400);
    }
  } else {
    agentId = requiredString(data.agentId, "agent_id");
    agentPublicKey = requiredString(data.agentPublicKey, "agent_public_key");
  }

  await assertAgentSignature(db, request, body.raw, {
    purpose: "paper_account_registration",
    agentId,
    agentPublicKey,
    boardId,
    createdAt,
  });
  await requireActiveAgentRegistration(db, agentId, agentPublicKey);
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
  const data = normalizeBodyFields(body.json);
  const existing = await findEventByAssociations(db, board.id, data);

  if (existing) {
    return { ok: true, merged: true, event: await presentEvent(db, existing) };
  }

  const event: EventRow = {
    id: newId("evt"),
    board_id: board.id,
    agent_id: board.agent_id,
    wallet_address: board.wallet_address,
    event_type: cleanString(data.eventType) ?? "agent_reported",
    client_event_id: cleanString(data.clientEventId),
    tx_hash: cleanString(data.txHash),
    intent_id: cleanString(data.intentId),
    status_claim: cleanString(data.statusClaim),
    asset_in: cleanString(data.assetIn),
    amount_in: optionalNonNegativeNumberField(data.amountIn, "amount_in"),
    asset_out: cleanString(data.assetOut),
    amount_out: optionalNonNegativeNumberField(data.amountOut, "amount_out"),
    reason: cleanString(data.reason),
    metadata_json: stringifyOptional(data.metadata),
    reported_at: normalizedTimestampField(data.reportedAt, createdAt, "reported_at"),
    created_at: createdAt,
  };

  const inserted = await insertEventOrFindMerge(db, event);
  return { ok: true, merged: !inserted.created, event: await presentEvent(db, inserted.event) };
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

  const data = normalizeBodyFields(body.json);
  const attachmentType = cleanString(data.attachmentType ?? data.type) ?? "reason";
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

  await insertAttachment(db, attachment);

  return { ok: true, attachment };
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

async function createPriceSnapshots(db: LedgerDb, body: BodyResult, boardId: string, createdAt: string) {
  const board = await requireBoard(db, boardId);
  const data = normalizeBodyFields(body.json);
  const inputSnapshots = Array.isArray(data.prices) ? data.prices : Array.isArray(data.snapshots) ? data.snapshots : [data];
  const prices = inputSnapshots.map((value) => {
    const item = normalizeBodyFields(value);
    return {
      id: newId("price"),
      board_id: board.id,
      asset_id: requiredString(item.assetId, "asset_id"),
      asset_symbol: cleanString(item.assetSymbol),
      price_usd: optionalNonNegativeNumberField(item.priceUsd, "price_usd"),
      price_source: requiredString(item.priceSource, "price_source"),
      observed_at: normalizedObservedAt(item.observedAt, createdAt),
      staleness_status: cleanString(item.stalenessStatus) ?? "fresh",
      metadata_json: stringifyOptional(item.metadata),
      created_at: createdAt,
    } satisfies PriceSnapshotRow;
  });

  for (const price of prices) await insertPriceSnapshot(db, price);
  return { ok: true, board_id: board.id, prices: prices.map(presentPriceSnapshot) };
}

async function createReadAccessCheck(db: LedgerDb, body: BodyResult, boardId: string, createdAt: string) {
  const board = await requireBoard(db, boardId);
  const data = normalizeBodyFields(body.json);
  const accessResult = cleanString(data.accessResult) ?? "granted";
  const accessLevel = normalizeAccessLevel(data.accessLevel);
  const readToken = cleanString(data.readToken);
  const metadata = asOptionalObject(data.metadata);
  const expiresAt = normalizeReadGrantExpiry(
    cleanString(data.expiresAt) ?? cleanString(metadata.expires_at),
    createdAt,
    accessResult,
    accessLevel,
  );

  if (accessResult === "granted" && accessLevel !== "public_summary" && !readToken) {
    throw new RequestError("Missing read_token for granted non-public read access", 400);
  }
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
    throw new RequestError("Invalid expires_at", 400);
  }

  const check: ReadAccessCheckRow = {
    id: newId("read"),
    board_id: board.id,
    requester_wallet_address: cleanString(data.requesterWalletAddress),
    access_level: accessLevel,
    access_result: accessResult,
    reason: cleanString(data.reason),
    key_contract_id: cleanString(data.keyContractId),
    checked_at: normalizedTimestampField(data.checkedAt, createdAt, "checked_at"),
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
  env: RuntimeEnv,
  body: BodyResult,
  boardId: string,
  createdAt: string,
) {
  const board = await requireBoard(db, boardId);
  const data = normalizeBodyFields(body.json);
  const rpcUrl = requiredString(data.rpcUrl ?? env[NEAR_RPC_URL_ENV], "rpc_url");
  const keyContractId = requiredString(data.keyContractId, "key_contract_id");
  const holderAccountId = requiredString(data.holderAccountId ?? data.requesterWalletAddress, "holder_account_id");
  const suppliedAgentId = cleanString(data.agentId);
  if (suppliedAgentId && suppliedAgentId !== board.agent_id) {
    throw new RequestError("agent_id must match board agent_id", 400);
  }
  const agentId = board.agent_id;
  const readToken = cleanString(data.readToken);
  const accessLevel = normalizeAccessLevel(data.accessLevel);
  const checkedAt = normalizedTimestampField(data.checkedAt, createdAt, "checked_at");
  const rawBalance = await viewNearKeyMarketBalance(rpcFetch, rpcUrl, keyContractId, agentId, holderAccountId);
  const holderBalance = rawBalance === null ? "0" : decimalIntegerString(rawBalance, "holder_key_balance");
  const accessResult = BigInt(holderBalance) > 0n ? "granted" : "denied";
  const metadata = asOptionalObject(data.metadata);
  const expiresAt = normalizeReadGrantExpiry(
    cleanString(data.expiresAt) ?? cleanString(metadata.expires_at),
    createdAt,
    accessResult,
    accessLevel,
  );

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
      holder_account_id: holderAccountId,
      rpc_url: rpcUrl,
      key_contract_id: keyContractId,
      key_holder_live_check: accessResult === "granted",
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

function normalizeReadGrantExpiry(
  requestedExpiresAt: string | null,
  createdAt: string,
  accessResult: string,
  accessLevel: AccessLevel,
) {
  if (accessResult !== "granted" || accessLevel === "public_summary") return requestedExpiresAt;
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) throw new RequestError("Invalid created_at", 500);
  const expiresAt = requestedExpiresAt
    ?? new Date(createdAtMs + DEFAULT_READ_GRANT_TTL_MS).toISOString();
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) throw new RequestError("Invalid expires_at", 400);
  if (expiresAtMs > createdAtMs + MAX_READ_GRANT_TTL_MS) {
    throw new RequestError("expires_at cannot exceed 24 hours for granted non-public read access", 400);
  }
  return new Date(expiresAtMs).toISOString();
}

async function runNearAccountWatch(
  db: LedgerDb,
  rpcFetch: FetchLike,
  env: RuntimeEnv,
  body: BodyResult,
  boardId: string,
  createdAt: string,
) {
  const board = await requireBoard(db, boardId);
  const data = normalizeBodyFields(body.json);
  const rpcUrl = requiredString(data.rpcUrl ?? env[NEAR_RPC_URL_ENV], "rpc_url");
  const observedAt = normalizedObservedAt(data.observedAt, createdAt);
  const account = await viewNearAccount(rpcFetch, rpcUrl, board.wallet_address);
  const normalizedNear = Number(account.amount) / YOCTO_NEAR_PER_NEAR;
  if (!Number.isFinite(normalizedNear)) {
    throw new RequestError("NEAR account balance is too large to normalize safely", 502);
  }

  const priceUsd = optionalNonNegativeNumberField(data.priceUsd, "price_usd");
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
    price_source: cleanString(data.priceSource) ?? "watcher_input",
    observed_at: observedAt,
    staleness_status: cleanString(data.stalenessStatus) ?? "fresh",
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
    topup_usd: optionalNonNegativeNumberField(data.topupUsd, "topup_usd") ?? 0,
    withdrawal_usd: optionalNonNegativeNumberField(data.withdrawalUsd, "withdrawal_usd") ?? 0,
    client_event_id: cleanString(data.clientEventId),
    tx_hash: cleanString(data.txHash),
    intent_id: cleanString(data.intentId),
    status_claim: cleanString(data.statusClaim) ?? "observed_on_near_rpc",
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
    change_type: cleanString(data.changeType) ?? classifyNearBalanceChange(deltaAmount),
    source_observation_id: observation?.id ?? null,
    source_event_id: null,
    tx_hash: cleanString(data.txHash),
    intent_id: cleanString(data.intentId),
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
  env: RuntimeEnv,
  body: BodyResult,
  boardId: string,
  createdAt: string,
) {
  const board = await requireBoard(db, boardId);
  const data = normalizeBodyFields(body.json);
  const rpcUrl = requiredString(data.rpcUrl ?? env[NEAR_RPC_URL_ENV], "rpc_url");
  const tokenContractId = requiredString(data.tokenContractId ?? data.contractId, "token_contract_id");
  const observedAt = normalizedObservedAt(data.observedAt, createdAt);
  const suppliedDecimals = optionalIntegerField(data.decimals, "decimals");
  const suppliedSymbol = cleanString(data.assetSymbol);
  const metadata = suppliedDecimals === null
    ? await viewNearFtMetadata(rpcFetch, rpcUrl, tokenContractId)
    : null;
  const decimals = suppliedDecimals ?? metadata?.decimals;
  if (decimals === undefined) throw new RequestError("Missing FT decimals", 400);
  assertTokenDecimals(decimals);

  const assetSymbol = suppliedSymbol ?? metadata?.symbol ?? tokenContractId;
  const assetId = cleanString(data.assetId) ?? `ft:${tokenContractId}`;
  const rawBalance = await viewNearFtBalance(rpcFetch, rpcUrl, tokenContractId, board.wallet_address);
  const normalizedAmount = decimalAmountFromRaw(rawBalance, decimals);
  const priceUsd = optionalNonNegativeNumberField(data.priceUsd, "price_usd");
  const currentValueUsd = optionalNonNegativeNumberField(data.currentValueUsd, "current_value_usd")
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
    price_source: cleanString(data.priceSource) ?? "watcher_input",
    observed_at: observedAt,
    staleness_status: cleanString(data.stalenessStatus) ?? "fresh",
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
    topup_usd: optionalNonNegativeNumberField(data.topupUsd, "topup_usd") ?? 0,
    withdrawal_usd: optionalNonNegativeNumberField(data.withdrawalUsd, "withdrawal_usd") ?? 0,
    client_event_id: cleanString(data.clientEventId),
    tx_hash: cleanString(data.txHash),
    intent_id: cleanString(data.intentId),
    status_claim: cleanString(data.statusClaim) ?? "observed_on_near_rpc",
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
    change_type: cleanString(data.changeType) ?? classifyNearBalanceChange(deltaAmount),
    source_observation_id: observation?.id ?? null,
    source_event_id: null,
    tx_hash: cleanString(data.txHash),
    intent_id: cleanString(data.intentId),
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

async function runCronTick(db: LedgerDb, rpcFetch: FetchLike, env: RuntimeEnv, createdAt: string) {
  const nearAccountWatch = await runTrackedNearAccountWatches(db, rpcFetch, env, createdAt);
  const ledgerTick = await reconcileCronLedgerTick(db, createdAt);
  const nearAccountDidWork = nearAccountWatch.checked > 0;
  const paperMonitor = await runPaperLiquidationMonitorSafely(db, rpcFetch, env, createdAt);
  const paperMonitorDidWork = paperMonitor.status === "checked" || paperMonitor.status === "liquidations_executed";

  return {
    ...ledgerTick,
    status: ledgerTick.status === "updated" || nearAccountDidWork || paperMonitorDidWork ? "updated" : ledgerTick.status,
    nearAccountWatch,
    paperMonitor,
    summary: {
      ...ledgerTick.summary,
      nearAccountWatchStatus: nearAccountWatch.status,
      nearAccountWatchesAttempted: nearAccountWatch.attempted,
      nearAccountWatchesChecked: nearAccountWatch.checked,
      nearAccountWatchesFailed: nearAccountWatch.failed,
      paperMonitorStatus: paperMonitor.status,
      paperMonitorAccountsChecked: paperMonitor.accounts_checked,
      paperMonitorLiquidations: paperMonitor.liquidations.length,
      noNewData: ledgerTick.summary.noNewData && !nearAccountDidWork && !paperMonitorDidWork,
    },
  };
}

async function runPaperLiquidationMonitorSafely(db: LedgerDb, rpcFetch: FetchLike, env: RuntimeEnv, createdAt: string) {
  try {
    return await runPaperLiquidationMonitor(db, rpcFetch, env, createdAt);
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      coins: [] as string[],
      snapshots: [] as unknown[],
      accounts_checked: 0,
      risk_checks: [] as unknown[],
      liquidations: [] as unknown[],
      failures: [{ error: safeErrorMessage(error) }],
    };
  }
}

async function runTrackedNearAccountWatches(db: LedgerDb, rpcFetch: FetchLike, env: RuntimeEnv, createdAt: string) {
  const rpcUrl = cleanString(env[NEAR_RPC_URL_ENV]);
  if (!rpcUrl) {
    return {
      status: "skipped_missing_rpc_url",
      attempted: 0,
      checked: 0,
      failed: 0,
      failures: [] as Array<Record<string, string>>,
    };
  }

  const trackedBoards = await db.all<{ board_id: string; wallet_address: string }>(
    `SELECT boards.id AS board_id, boards.wallet_address AS wallet_address
     FROM boards
     INNER JOIN tracked_wallets
       ON tracked_wallets.board_id = boards.id
      AND tracked_wallets.wallet_address = boards.wallet_address
     WHERE COALESCE(tracked_wallets.chain, 'near') = 'near'
       AND COALESCE(tracked_wallets.tracking_status, 'active') = 'active'
     ORDER BY boards.created_at ASC, boards.id ASC`,
  );

  let checked = 0;
  const failures: Array<Record<string, string>> = [];

  for (const tracked of trackedBoards) {
    try {
      await runNearAccountWatch(db, rpcFetch, env, {
        raw: "",
        json: { rpc_url: rpcUrl },
      }, tracked.board_id, createdAt);
      checked += 1;
    } catch (error) {
      failures.push({
        board_id: tracked.board_id,
        wallet_address: tracked.wallet_address,
        error: safeErrorMessage(error),
      });
    }
  }

  return {
    status: trackedBoards.length === 0
      ? "no_active_tracked_wallets"
      : failures.length > 0
        ? "checked_with_failures"
        : "checked",
    attempted: trackedBoards.length,
    checked,
    failed: failures.length,
    failures,
  };
}

async function reconcileCronLedgerTick(db: LedgerDb, createdAt: string) {
  return await db.transaction(async (tx) => {
    const observations = await tx.all<ObservationRow>(
      "SELECT * FROM observations WHERE event_id IS NULL ORDER BY observed_at ASC, id ASC",
    );
    const discoveredEvents: EventRow[] = [];
    const statusConflicts = [];
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
      if (result.statusConflict) statusConflicts.push(result.statusConflict);
    }

    const boards = await tx.all<Board>("SELECT * FROM boards ORDER BY created_at ASC");
    const snapshots = [];
    const alreadySnapshotted = [];
    const boardsWithoutObservations = [];
    const boardsWithoutPaperAccounts = [];

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

      const paperAccount = await paperAccountForBoard(tx, board.id);
      if (!paperAccount) {
        boardsWithoutPaperAccounts.push({
          board_id: board.id,
          reason: "missing_linked_paper_account",
        });
        continue;
      }

      const totals = await tx.get<{ topups: number | null; withdrawals: number | null }>(
        "SELECT SUM(topup_usd) AS topups, SUM(withdrawal_usd) AS withdrawals FROM observations WHERE board_id = ?",
        [board.id],
      );
      const netTopups = totals?.topups ?? 0;
      const netWithdrawals = totals?.withdrawals ?? 0;
      const accountingStatus = await accountingStatusForObservation(tx, board.id, observation.id, observation.observed_at);
      const currentValueUsd = accountingStatus.currentValueUsd;
      const pnlUsd = currentValueUsd - paperAccount.starting_balance_usd - netTopups + netWithdrawals;
      const totalPnlPct = paperAccount.starting_balance_usd > 0 ? pnlUsd / paperAccount.starting_balance_usd : null;
      const previousHighWater = await latestHighWaterMark(tx, board.id);
      const highWaterMarkUsd = Math.max(previousHighWater ?? currentValueUsd, currentValueUsd);
      const drawdownPct = highWaterMarkUsd > 0 ? (highWaterMarkUsd - currentValueUsd) / highWaterMarkUsd : 0;
      const eventCounts = await pnlEventCounts(tx, board.id);
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
        currentValueUsd,
        observation.id,
        createdAt,
        ],
      );
      await tx.run(
        `INSERT INTO pnl_snapshots
          (id, board_id, agent_id, observed_at, current_value_usd, net_topups_usd,
           net_withdrawals_usd, pnl_usd, holding_snapshot_id, price_snapshot_id, total_pnl_pct,
           drawdown_pct, high_water_mark_usd, observed_trade_count, failed_event_count,
           reason_missing_count, staleness_status, completeness_status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
        pnlId,
        board.id,
        board.agent_id,
        observation.observed_at,
        currentValueUsd,
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
        paper_account_id: paperAccount.id,
        source_observation_id: observation.id,
        observed_at: observation.observed_at,
        holding_snapshot_id: holdingId,
        pnl_snapshot_id: pnlId,
        current_value_usd: currentValueUsd,
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
      statusConflicts,
      snapshots,
      alreadySnapshotted,
      boardsWithoutObservations,
      boardsWithoutPaperAccounts,
      summary: {
        observationsChecked: observations.length,
        observationsWithoutActivityId,
        observationsAlreadyLinked,
        statusConflicts: statusConflicts.length,
        snapshotsCreated: snapshots.length,
        snapshotsSkippedAlreadyCurrent: alreadySnapshotted.length,
        boardsWithoutObservations: boardsWithoutObservations.length,
        boardsWithoutPaperAccounts: boardsWithoutPaperAccounts.length,
        noNewData,
      },
    };
  });
}

async function discoverEventForObservation(db: LedgerDb, observation: ObservationRow, createdAt: string) {
  if (!hasActivityId(observation)) return { linked: false, created: false, skipped: "no_activity_id" as const, statusConflict: null };

  const currentObservation = await db.get<ObservationRow>(
    "SELECT * FROM observations WHERE id = ? AND event_id IS NULL",
    [observation.id],
  );
  if (!currentObservation) return { linked: false, created: false, skipped: "already_linked" as const, statusConflict: null };

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
    const inserted = await insertEventOrFindMerge(db, event);
    event = inserted.event;
    created = inserted.created;
  }

  const result = await db.run("UPDATE observations SET event_id = ? WHERE id = ? AND event_id IS NULL", [
    event.id,
    currentObservation.id,
  ]);
  if (result.changes !== 1) return { linked: false, created: false, skipped: "already_linked" as const, statusConflict: null };
  const statusConflict = await appendObservationConflictIfNeeded(db, event, currentObservation, createdAt);
  return { event, created, linked: true, skipped: null, statusConflict };
}

async function appendObservationConflictIfNeeded(
  db: LedgerDb,
  event: EventRow,
  observation: ObservationRow,
  createdAt: string,
) {
  const conflict = await detectObservationConflict(db, event, observation);
  if (!conflict) return null;

  const attachment: AttachmentRow = {
    id: newId("att"),
    event_id: event.id,
    board_id: event.board_id,
    attachment_type: "investigation",
    reason: conflict.reason,
    metadata_json: JSON.stringify({
      source: "cron_observation_conflict_detector",
      conflict_type: conflict.type,
      observation_id: observation.id,
      tx_hash: observation.tx_hash,
      intent_id: observation.intent_id,
      client_event_id: observation.client_event_id,
    }),
    created_at: createdAt,
  };
  await insertAttachment(db, attachment);
  return {
    event_id: event.id,
    observation_id: observation.id,
    conflict_type: conflict.type,
    attachment_id: attachment.id,
  };
}

async function detectObservationConflict(db: LedgerDb, event: EventRow, observation: ObservationRow) {
  const status = cleanString(event.status_claim ?? observation.status_claim)?.toLowerCase() ?? "";
  const changes = await db.all<BalanceChangeRow>(
    "SELECT * FROM balance_changes WHERE board_id = ? AND source_observation_id = ?",
    [observation.board_id, observation.id],
  );
  const hasMaterialBalanceChange = changes.some((change) =>
    hasMaterialNumber(change.delta_amount) || hasMaterialNumber(change.delta_value_usd)
  );

  if (isSuccessClaim(status) && changes.length === 0) {
    return {
      type: "success_claim_without_balance_evidence",
      reason: "Agent reported success, but no wallet balance evidence was attached to the observation.",
    };
  }
  if (isSuccessClaim(status) && !hasMaterialBalanceChange) {
    return {
      type: "success_claim_without_balance_change",
      reason: "Agent reported success, but wallet observation did not show a material balance change.",
    };
  }
  if (isFailureClaim(status) && hasMaterialBalanceChange) {
    return {
      type: "failure_claim_with_balance_change",
      reason: "Agent reported failure, but wallet observation showed a material balance change.",
    };
  }
  return null;
}

function isSuccessClaim(status: string) {
  return ["filled", "success", "succeeded", "executed", "settled", "complete", "completed"].includes(status);
}

function isFailureClaim(status: string) {
  return ["failed", "failure", "rejected", "cancelled", "canceled"].includes(status);
}

function hasMaterialNumber(value: number | null) {
  return value !== null && Math.abs(value) > 1e-12;
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
  const observation = await db.get<ObservationRow>("SELECT * FROM observations WHERE id = ? AND board_id = ?", [
    observationId,
    boardId,
  ]);
  if (!observation) throw new RequestError("Observation not found", 404);
  const changes = await db.all<BalanceChangeRow>(
    "SELECT * FROM balance_changes WHERE board_id = ? AND source_observation_id = ?",
    [boardId, observationId],
  );
  let currentValueUsd = observation.current_value_usd;
  let priceSnapshotId: string | null = null;
  let stalenessStatus = changes.length > 0 ? "unknown" : "fresh";
  let completenessStatus: string | null = null;

  if (changes.length > 0) {
    let reconciledValueUsd = 0;
    let completeAccountedSnapshot = true;
    for (const change of changes) {
      if (change.visibility_status !== "complete") {
        completeAccountedSnapshot = false;
        completenessStatus = completenessStatus ?? change.visibility_status;
        continue;
      }
      if (change.normalized_amount === null) {
        completeAccountedSnapshot = false;
        completenessStatus = completenessStatus ?? "missing_balance";
        continue;
      }
      const price = await latestPriceSnapshotForAsset(db, boardId, change.asset_id, observedAt);
      if (!price || price.price_usd === null) {
        completeAccountedSnapshot = false;
        completenessStatus = completenessStatus ?? "missing_price";
        continue;
      }
      reconciledValueUsd += change.normalized_amount * price.price_usd;
      priceSnapshotId = price.id;
      stalenessStatus = combineStalenessStatus(stalenessStatus, price.staleness_status);
    }

    if (completeAccountedSnapshot) {
      currentValueUsd = reconciledValueUsd;
      completenessStatus = "complete";
    }
  } else {
    const price = await latestPriceSnapshotForBoard(db, boardId, observedAt);
    priceSnapshotId = price?.id ?? null;
    stalenessStatus = price?.staleness_status ?? "unknown";
    completenessStatus = "missing_balance_changes";
  }

  return {
    currentValueUsd,
    priceSnapshotId,
    stalenessStatus,
    completenessStatus,
  };
}

async function latestPriceSnapshotForAsset(db: LedgerDb, boardId: string, assetId: string, observedAt: string) {
  return await db.get<PriceSnapshotRow>(
    `SELECT * FROM price_snapshots
     WHERE asset_id = ? AND observed_at <= ? AND (board_id = ? OR board_id IS NULL)
     ORDER BY observed_at DESC, created_at DESC, id DESC
     LIMIT 1`,
    [assetId, observedAt, boardId],
  );
}

function combineStalenessStatus(current: string, next: string) {
  if (current === "stale" || next === "stale") return "stale";
  if (next === "fresh") return current === "unknown" ? "fresh" : current;
  return next;
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

function presentBoardDiscovery(board: Board) {
  return {
    ...board,
    metadata: parseJson(board.metadata_json),
    metadata_json: undefined,
  };
}

function presentAgentRegistration(agent: AgentRegistrationRow) {
  return {
    ...agent,
    metadata: parseJson(agent.metadata_json),
    metadata_json: undefined,
  };
}

async function requireActiveAgentRegistration(db: LedgerDb, agentId: string, agentPublicKey: string) {
  const agent = await db.get<AgentRegistrationRow>(
    "SELECT * FROM agent_registrations WHERE agent_id = ?",
    [agentId],
  );
  if (!agent || agent.status !== "active") {
    throw new RequestError("Agent registration not found", 403);
  }
  if (agent.agent_public_key !== agentPublicKey) {
    throw new RequestError("Agent public key is not registered for agent_id", 403);
  }
  return agent;
}

async function requireBoard(db: LedgerDb, boardId: string) {
  const board = await getBoard(db, boardId);
  if (!board) throw new RequestError("Board not found", 404);
  return board;
}

async function assertPaperAccountRead(
  db: LedgerDb,
  request: Request,
  url: URL,
  paperAccountId: string,
  adminToken: string | null | undefined,
  createdAt: string,
  requiredLevel: AccessLevel,
  rpcFetch: FetchLike,
) {
  const account = await db.get<PaperAccountRow>("SELECT * FROM paper_accounts WHERE id = ?", [paperAccountId]);
  if (!account) throw new RequestError("Paper account not found", 404);
  if (!account.board_id) return;
  const board = await requireBoard(db, account.board_id);
  await assertBoardRead(db, request, url, board, adminToken, createdAt, requiredLevel, rpcFetch);
}

async function assertPaperOrderRead(
  db: LedgerDb,
  request: Request,
  url: URL,
  orderId: string,
  adminToken: string | null | undefined,
  createdAt: string,
  requiredLevel: AccessLevel,
  rpcFetch: FetchLike,
) {
  const order = await db.get<{ paper_account_id: string }>("SELECT paper_account_id FROM paper_orders WHERE id = ?", [orderId]);
  if (!order) throw new RequestError("Paper order not found", 404);
  await assertPaperAccountRead(db, request, url, order.paper_account_id, adminToken, createdAt, requiredLevel, rpcFetch);
}

function requiredBoardAgentPublicKey(board: Board) {
  const agentPublicKey = cleanString(board.agent_public_key);
  if (!agentPublicKey) throw new RequestError("Board is missing agent_public_key", 500);
  return agentPublicKey;
}

async function assertBoardRead(
  db: LedgerDb,
  request: Request,
  url: URL,
  board: Board,
  adminToken: string | null | undefined,
  createdAt: string,
  requiredLevel: AccessLevel,
  rpcFetch: FetchLike,
) {
  if (board.visibility_mode === "public" && requiredLevel === "public_summary") return;
  if (hasServiceBearer(request.headers, adminToken)) return;

  const readToken = cleanString(request.headers.get("x-clawhouse-read-token")) ?? cleanString(url.searchParams.get("read_token"));
  if (!readToken) {
    await recordReadAudit(db, board.id, null, requiredLevel, "denied", "missing_read_token", createdAt);
    throw new RequestError("Read access required", 403);
  }

  const grant = await matchingReadGrant(db, board.id, readToken, requiredLevel, createdAt, rpcFetch);
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
  rpcFetch: FetchLike,
) {
  const tokenHash = sha256Hex(readToken);
  const checks = await db.all<ReadAccessCheckRow>(
    `SELECT * FROM read_access_checks
     WHERE board_id = ? AND access_result = 'granted'
     ORDER BY checked_at DESC, created_at DESC, id DESC`,
    [boardId],
  );

  for (const check of checks) {
    if (!accessLevelAllows(check.access_level, requiredLevel)) continue;
    const metadata = parseJson(check.metadata_json) as JsonObject | null;
    if (typeof metadata?.read_token_sha256 !== "string" || !tokensMatch(metadata.read_token_sha256, tokenHash)) continue;
    const expiresAt = typeof metadata.expires_at === "string" ? metadata.expires_at : null;
    if (expiresAt && Date.parse(expiresAt) <= Date.parse(now)) continue;
    if (metadata?.key_holder_live_check === true) {
      const stillHoldsKey = await verifyLiveKeyHolderGrant(rpcFetch, check, metadata);
      if (!stillHoldsKey) continue;
    }
    return check;
  }
  return null;
}

async function verifyLiveKeyHolderGrant(
  rpcFetch: FetchLike,
  check: ReadAccessCheckRow,
  metadata: JsonObject,
) {
  const rpcUrl = cleanString(metadata.rpc_url);
  const keyContractId = cleanString(metadata.key_contract_id) ?? check.key_contract_id;
  const agentId = cleanString(metadata.agent_id);
  const holderAccountId = cleanString(metadata.holder_account_id) ?? check.requester_wallet_address;
  if (!rpcUrl || !keyContractId || !agentId || !holderAccountId) return false;

  const rawBalance = await viewNearKeyMarketBalance(rpcFetch, rpcUrl, keyContractId, agentId, holderAccountId);
  const holderBalance = rawBalance === null ? "0" : decimalIntegerString(rawBalance, "holder_key_balance");
  return BigInt(holderBalance) > 0n;
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

async function paperAccountForBoard(db: LedgerDb, boardId: string) {
  return await db.get<{ id: string; starting_balance_usd: number }>(
    "SELECT id, starting_balance_usd FROM paper_accounts WHERE board_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    [boardId],
  );
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

async function insertEventOrFindMerge(db: LedgerDb, event: EventRow) {
  try {
    await insertEvent(db, event);
    return { created: true, event };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await findEventByAssociations(db, event.board_id, event);
    if (!existing) throw error;
    return { created: false, event: existing };
  }
}

async function insertAttachment(db: LedgerDb, attachment: AttachmentRow) {
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

function asOptionalObject(value: unknown): JsonObject {
  if (value === undefined || value === null) return {};
  return asObject(value);
}

function optionalNumberField(value: unknown, name: string) {
  return requiredOrOptionalNumber(value, name, false);
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
  if (error instanceof AuthError || error instanceof ServiceAuthError || error instanceof RequestError || error instanceof PaperAuthError) {
    return json({ ok: false, error: error.message }, error.status);
  }
  if (isUniqueViolation(error)) {
    return json({ ok: false, error: "Duplicate record" }, 409);
  }
  console.error(error);
  return json({ ok: false, error: "Internal server error" }, 500);
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? (error as { code?: unknown }).code : null;
  return code === "23505" || error.message.includes("UNIQUE constraint failed");
}

if (import.meta.main) {
  const port = Number(process.env.AGENT_BOARD_LEDGER_PORT ?? 4321);
  try {
    const db = await openMigratedRuntimeLedgerDb();
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
