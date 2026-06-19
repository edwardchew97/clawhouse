import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import {
  generateNearWallet,
  inspectNearWallet,
  signAgentBoardLedgerRequest,
  type NearWalletPublicInfo,
} from "../../../tools/near-wallet/src/wallet";

type Options = {
  baseUrl: string;
  keyFile: string;
  serviceToken?: string;
  boardId?: string;
  agentId: string;
  startingValueUsd: number;
  currentValueUsd: number;
};

type JsonRecord = Record<string, unknown>;

type HttpResult = {
  responseOk: boolean;
  status: number;
  text: string;
  json: unknown;
};

type CheckResult = {
  name: string;
  ok: boolean;
  status?: number;
  expected?: string;
  detail?: unknown;
};

const repoRoot = resolve(import.meta.dir, "../../..");
let activeMockRpc: ReturnType<typeof startMockNearRpc> | null = null;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const wallet = await loadOrCreateWallet(options.keyFile);
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const mockRpc = startMockNearRpc();
  activeMockRpc = mockRpc;
  const boardPrefix = options.boardId || `ledger-edge-${runId}`;
  const rejectionBoardId = `${boardPrefix}-reject`;
  const flowBoardId = `${boardPrefix}-flow`;
  const holderBoardId = `${boardPrefix}-holder`;
  const ftBoardId = `${boardPrefix}-ft`;
  const checks: CheckResult[] = [];

  const rejectionBoard = await servicePostJson(options, "/boards", boardBody(options, wallet, rejectionBoardId));
  expectSuccess(checks, "service-authenticated rejection board registration", rejectionBoard);

  if (isSuccess(rejectionBoard)) {
    const unauthenticatedObservation = await postJson(options.baseUrl, `/boards/${rejectionBoardId}/observations`, {
      wallet_address: wallet.walletAddress,
      current_value_usd: options.currentValueUsd,
      tx_hash: `edge-unauth-${runId}`,
    });
    expectRejected(
      checks,
      "unauthenticated observation is rejected",
      unauthenticatedObservation,
      [401, 403],
    );

    const futureObservedAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const futureObservation = await servicePostJson(options, `/boards/${rejectionBoardId}/observations`, {
      wallet_address: wallet.walletAddress,
      observed_at: futureObservedAt,
      current_value_usd: options.currentValueUsd,
      tx_hash: `edge-future-${runId}`,
    });
    expectRejected(
      checks,
      "future observed_at is rejected",
      futureObservation,
      [400],
    );
  }

  const flowBoard = await servicePostJson(options, "/boards", boardBody(options, wallet, flowBoardId));
  expectSuccess(checks, "service-authenticated flow board registration", flowBoard);

  const holderBoard = await servicePostJson(options, "/boards", {
    ...boardBody(options, wallet, holderBoardId),
    visibility_mode: "holder_gated",
  });
  expectSuccess(checks, "service-authenticated holder-gated board registration", holderBoard);

  if (isSuccess(holderBoard)) {
    const holderEvent = await signedPostJson(options, wallet, `/boards/${holderBoardId}/events`, holderBoardId, {
      client_event_id: `client-holder-${runId}`,
      tx_hash: `near-tx-holder-${runId}`,
      reason: "Holder-only event reason.",
    });
    expectSuccess(checks, "holder-gated signed event is created", holderEvent);

    const blockedRead = await getJson(options.baseUrl, `/boards/${holderBoardId}/events`);
    expectRejected(checks, "holder-gated event timeline rejects missing read token", blockedRead, [403]);

    const readToken = `read-token-${runId}`;
    const grant = await servicePostJson(options, `/boards/${holderBoardId}/read-access/near-key-market`, {
      rpc_url: mockRpc.url,
      key_contract_id: "mock-clawhouse-key.testnet",
      holder_account_id: wallet.walletAddress,
      access_level: "key_holder_detail",
      read_token: readToken,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    expectSuccess(checks, "service grants holder read token after NEAR key-market balance check", grant);

    const allowedRead = await getJson(options.baseUrl, `/boards/${holderBoardId}/events`, {
      "x-clawhouse-read-token": readToken,
    });
    checks.push({
      name: "holder-gated event timeline accepts valid read token",
      ok: isSuccess(allowedRead) && arrayAt(allowedRead.json, ["events"]).length === 1,
      status: allowedRead.status,
      expected: "one holder-gated event with valid read token",
      detail: {
        eventCount: arrayAt(allowedRead.json, ["events"]).length,
      },
    });
  }

  const ftBoard = await servicePostJson(options, "/boards", boardBody(options, wallet, ftBoardId));
  expectSuccess(checks, "service-authenticated FT watcher board registration", ftBoard);

  if (isSuccess(ftBoard)) {
    const ftWatch = await servicePostJson(options, `/boards/${ftBoardId}/watch/near-ft`, {
      rpc_url: mockRpc.url,
      token_contract_id: "mock-usdc.testnet",
      price_usd: 1,
      price_source: "acceptance-workbench-mock-near-rpc",
      tx_hash: `near-ft-edge-${runId}`,
    });
    expectSuccess(checks, "NEAR FT watcher records token balance through RPC", ftWatch);
    const ftPriceId = stringAt(ftWatch.json, ["price", "id"]);

    const ftCron = await servicePostJson(options, "/cron/tick", {});
    expectSuccess(checks, "cron snapshots FT watcher observation", ftCron);
    const ftPnl = await getJson(options.baseUrl, `/boards/${ftBoardId}/pnl`);

    checks.push({
      name: "FT watcher P&L links the RPC price snapshot",
      ok: isSuccess(ftPnl)
        && numberEquals(numberAt(ftPnl.json, ["latest", "pnl_usd"]), 12)
        && stringAt(ftPnl.json, ["latest", "price_snapshot_id"]) === ftPriceId,
      status: ftPnl.status,
      expected: "FT balance of 112 mock USDC produces $12 P&L and links its price snapshot",
      detail: {
        pnlUsd: numberAt(ftPnl.json, ["latest", "pnl_usd"]),
        priceSnapshotId: stringAt(ftPnl.json, ["latest", "price_snapshot_id"]),
        expectedPriceSnapshotId: ftPriceId,
      },
    });
  }

  let eventId = "";
  const clientEventId = `client-edge-${runId}`;
  const txHash = `near-tx-edge-${runId}`;
  const intentId = `near-intent-edge-${runId}`;

  if (isSuccess(flowBoard)) {
    const event = await signedPostJson(options, wallet, `/boards/${flowBoardId}/events`, flowBoardId, {
      client_event_id: clientEventId,
      tx_hash: txHash,
      intent_id: intentId,
      event_type: "agent_reported",
      status_claim: "filled",
      asset_in: "USDC",
      amount_in: 25,
      asset_out: "NEAR",
      amount_out: 10,
      reason: "Edge-case flow verifies signed event still works after service hardening.",
      metadata: {
        venue: "near-intents",
        source: "acceptance-workbench-edge",
      },
    });
    expectSuccess(checks, "wallet-signed event still works", event);
    eventId = stringAt(event.json, ["event", "id"]) ?? "";

    if (eventId) {
      const attachment = await signedPostJson(
        options,
        wallet,
        `/boards/${flowBoardId}/events/${eventId}/attachments`,
        flowBoardId,
        {
          attachment_type: "analysis",
          reason: "Edge-case flow verifies append-only attachment still works.",
          metadata: {
            source: "acceptance-workbench-edge",
          },
        },
      );
      expectSuccess(checks, "wallet-signed attachment still works", attachment);
    } else {
      checks.push({
        name: "wallet-signed attachment still works",
        ok: false,
        expected: "event id from signed event response",
      });
    }

    const observation = await servicePostJson(options, `/boards/${flowBoardId}/observations`, {
      wallet_address: wallet.walletAddress,
      observed_at: new Date().toISOString(),
      current_value_usd: options.currentValueUsd,
      client_event_id: clientEventId,
      tx_hash: txHash,
      intent_id: intentId,
      status_claim: "observed_on_wallet",
      asset_in: "USDC",
      amount_in: 25,
      asset_out: "NEAR",
      amount_out: 10,
      metadata: {
        source: "acceptance-workbench-edge",
      },
    });
    expectSuccess(checks, "service-authenticated observation still works", observation);
    const observationId = stringAt(observation.json, ["observation", "id"]);
    const observationObservedAt = stringAt(observation.json, ["observation", "observed_at"]);

    const price = await servicePostJson(options, `/boards/${flowBoardId}/prices`, {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      price_usd: 2,
      price_source: "acceptance-workbench-edge",
      observed_at: observationObservedAt,
    });
    expectSuccess(checks, "service-authenticated price snapshot still works", price);
    const priceId = stringAt(price.json, ["prices", "0", "id"]);

    const balanceChange = await servicePostJson(options, `/boards/${flowBoardId}/balance-changes`, {
      asset_id: "native:near",
      asset_symbol: "NEAR",
      normalized_amount: 56,
      delta_amount: 6,
      delta_value_usd: 12,
      change_type: "trade",
      source_observation_id: observationId,
      tx_hash: txHash,
      intent_id: intentId,
    });
    expectSuccess(checks, "service-authenticated balance change still works", balanceChange);

    const firstCron = await servicePostJson(options, "/cron/tick", {});
    expectSuccess(checks, "service-authenticated cron tick still works", firstCron);

    const events = await getJson(options.baseUrl, `/boards/${flowBoardId}/events`);
    const portfolio = await getJson(options.baseUrl, `/boards/${flowBoardId}/portfolio`);
    const pnl = await getJson(options.baseUrl, `/boards/${flowBoardId}/pnl`);
    const firstPortfolioId = stringAt(portfolio.json, ["latest", "id"]);
    const firstPnlId = stringAt(pnl.json, ["latest", "id"]);
    const firstPortfolioCreatedAt = stringAt(portfolio.json, ["latest", "created_at"]);
    const firstPnlCreatedAt = stringAt(pnl.json, ["latest", "created_at"]);
    const firstSnapshotFieldsPresent = Boolean(
      firstPortfolioId
        && firstPnlId
        && firstPortfolioCreatedAt
        && firstPnlCreatedAt,
    );

    checks.push({
      name: "P&L readback still works",
      ok: isSuccess(portfolio) && isSuccess(pnl) && numberEquals(
        numberAt(pnl.json, ["latest", "pnl_usd"]) ?? numberAt(pnl.json, ["latest", "total_pnl_usd"]),
        options.currentValueUsd - options.startingValueUsd,
      ) && stringAt(pnl.json, ["latest", "price_snapshot_id"]) === priceId,
      status: pnl.status,
      expected: `pnl ${options.currentValueUsd - options.startingValueUsd} with linked price snapshot`,
      detail: {
        portfolioLatestId: firstPortfolioId,
        pnlLatestId: firstPnlId,
        pnlUsd: numberAt(pnl.json, ["latest", "pnl_usd"]) ?? numberAt(pnl.json, ["latest", "total_pnl_usd"]),
        priceSnapshotId: stringAt(pnl.json, ["latest", "price_snapshot_id"]),
        expectedPriceSnapshotId: priceId,
      },
    });

    const secondCron = await servicePostJson(options, "/cron/tick", {});
    const secondPortfolio = await getJson(options.baseUrl, `/boards/${flowBoardId}/portfolio`);
    const secondPnl = await getJson(options.baseUrl, `/boards/${flowBoardId}/pnl`);
    const secondCronSnapshotsValue = valueAt(secondCron.json, ["snapshots"]);
    const secondCronSnapshots = Array.isArray(secondCronSnapshotsValue) ? secondCronSnapshotsValue : [];
    const secondPortfolioId = stringAt(secondPortfolio.json, ["latest", "id"]);
    const secondPnlId = stringAt(secondPnl.json, ["latest", "id"]);
    const secondPortfolioCreatedAt = stringAt(secondPortfolio.json, ["latest", "created_at"]);
    const secondPnlCreatedAt = stringAt(secondPnl.json, ["latest", "created_at"]);

    checks.push({
      name: "duplicate cron tick does not duplicate snapshots or freshness",
      ok: isSuccess(secondCron)
        && firstSnapshotFieldsPresent
        && Array.isArray(secondCronSnapshotsValue)
        && secondCronSnapshots.length === 0
        && firstPortfolioId === secondPortfolioId
        && firstPnlId === secondPnlId
        && firstPortfolioCreatedAt === secondPortfolioCreatedAt
        && firstPnlCreatedAt === secondPnlCreatedAt,
      status: secondCron.status,
      expected: "first snapshot ids/timestamps are present, second cron returns zero new snapshots, and latest snapshot ids/timestamps stay unchanged",
      detail: {
        firstSnapshotFieldsPresent,
        secondCronSnapshotsFieldIsArray: Array.isArray(secondCronSnapshotsValue),
        secondCronSnapshotCount: secondCronSnapshots.length,
        firstPortfolioId,
        secondPortfolioId,
        firstPnlId,
        secondPnlId,
        firstPortfolioCreatedAt,
        secondPortfolioCreatedAt,
        firstPnlCreatedAt,
        secondPnlCreatedAt,
      },
    });

    checks.push({
      name: "event timeline has one event with one attachment",
      ok: isSuccess(events)
        && arrayAt(events.json, ["events"]).length === 1
        && countTimelineAttachments(events.json) === 1,
      status: events.status,
      expected: "one event and one attachment",
      detail: {
        eventCount: arrayAt(events.json, ["events"]).length,
        attachmentCount: countTimelineAttachments(events.json),
      },
    });
  }

  const failed = checks.filter((check) => !check.ok);
  mockRpc.stop();
  activeMockRpc = null;
  return {
    ok: failed.length === 0,
    baseUrl: options.baseUrl,
    wallet: {
      walletAddress: wallet.walletAddress,
      publicKey: wallet.publicKey,
      keyId: wallet.keyId,
      keyFile: wallet.keyFile,
    },
    boards: {
      rejectionBoardId,
      flowBoardId,
      ftBoardId,
    },
    summary: {
      passed: checks.length - failed.length,
      failed: failed.length,
      failedChecks: failed.map((check) => check.name),
    },
    checks,
  };
}

function boardBody(options: Options, wallet: NearWalletPublicInfo, boardId: string) {
  return {
    board_id: boardId,
    agent_id: options.agentId,
    wallet_address: wallet.walletAddress,
    public_key: wallet.publicKey,
    starting_value_usd: options.startingValueUsd,
    base_currency: "USD",
    public_status: "active",
    visibility_mode: "public",
  };
}

async function loadOrCreateWallet(keyFile: string): Promise<NearWalletPublicInfo> {
  await mkdir(dirname(keyFile), { recursive: true });
  if (existsSync(keyFile)) {
    return await inspectNearWallet({ keyFile });
  }
  return await generateNearWallet({ keyFile });
}

async function signedPostJson(
  options: Options,
  wallet: NearWalletPublicInfo,
  path: string,
  boardId: string,
  body: JsonRecord,
) {
  const rawBody = JSON.stringify(body);
  const signed = await signAgentBoardLedgerRequest({
    keyFile: wallet.keyFile,
    method: "POST",
    path,
    body: rawBody,
    boardId,
    agentId: options.agentId,
  });
  return await requestJson(options.baseUrl, path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...signed.headers,
    },
    body: rawBody,
  });
}

async function servicePostJson(options: Options, path: string, body: JsonRecord) {
  if (!options.serviceToken) {
    throw new Error("Missing ledgerAdminToken input or AGENT_BOARD_LEDGER_ADMIN_TOKEN for service-authorized ledger writes");
  }

  return await requestJson(options.baseUrl, path, {
    method: "POST",
    headers: serviceHeaders(options.serviceToken),
    body: JSON.stringify(body),
  });
}

async function postJson(baseUrl: string, path: string, body: JsonRecord) {
  return await requestJson(baseUrl, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getJson(baseUrl: string, path: string, headers: Record<string, string> = {}) {
  return await requestJson(baseUrl, path, { method: "GET", headers });
}

async function requestJson(baseUrl: string, path: string, init: RequestInit): Promise<HttpResult> {
  const url = new URL(path, ensureTrailingSlash(baseUrl));
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(`Ledger request failed for ${init.method ?? "GET"} ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const text = await response.text();
  const json = parseJson(text, path);
  return {
    responseOk: response.ok,
    status: response.status,
    text,
    json,
  };
}

function parseArgs(args: string[]): Options {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    values[key] = value;
    index += 1;
  }

  return {
    baseUrl: values["base-url"] || "http://127.0.0.1:4321",
    keyFile: resolvePath(values["key-file"] || "work/acceptance-workbench/agent-board-ledger/edge-wallet.json"),
    serviceToken: optionalString(values["admin-token"])
      ?? optionalString(process.env.AGENT_BOARD_LEDGER_ADMIN_TOKEN)
      ?? optionalString(process.env.ledgerAdminToken),
    boardId: optionalString(values["board-id"]),
    agentId: values["agent-id"] || "ironclaw-workbench",
    startingValueUsd: numberOption(values["starting-value-usd"], 100, "starting-value-usd"),
    currentValueUsd: numberOption(values["current-value-usd"], 112, "current-value-usd"),
  };
}

function serviceHeaders(serviceToken: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${serviceToken}`,
  };
}

function expectSuccess(checks: CheckResult[], name: string, result: HttpResult) {
  checks.push({
    name,
    ok: isSuccess(result),
    status: result.status,
    expected: "2xx response with ok !== false",
    detail: isSuccess(result) ? undefined : safeDetail(result),
  });
}

function expectRejected(
  checks: CheckResult[],
  name: string,
  result: HttpResult,
  expectedStatuses: number[],
) {
  checks.push({
    name,
    ok: !result.responseOk && expectedStatuses.includes(result.status),
    status: result.status,
    expected: `HTTP ${expectedStatuses.join(" or ")}`,
    detail: safeDetail(result),
  });
}

function isSuccess(result: HttpResult) {
  const json = asRecord(result.json);
  return result.responseOk && json?.ok !== false;
}

function safeDetail(result: HttpResult) {
  return {
    status: result.status,
    json: result.json,
    text: result.text.slice(0, 500),
  };
}

function resolvePath(value: string) {
  return value.startsWith("/") ? value : resolve(repoRoot, value);
}

function optionalString(value: string | undefined) {
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function numberOption(value: string | undefined, fallback: number, name: string) {
  const raw = optionalString(value);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${value}`);
  return parsed;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function parseJson(text: string, path: string): JsonRecord | null {
  try {
    return text ? JSON.parse(text) as JsonRecord : null;
  } catch {
    throw new Error(`Ledger returned non-JSON for ${path}: ${text}`);
  }
}

function stringAt(value: unknown, path: string[]) {
  const result = valueAt(value, path);
  return typeof result === "string" && result !== "" ? result : undefined;
}

function numberAt(value: unknown, path: string[]) {
  const result = valueAt(value, path);
  return typeof result === "number" && Number.isFinite(result) ? result : undefined;
}

function arrayAt(value: unknown, path: string[]) {
  const result = valueAt(value, path);
  return Array.isArray(result) ? result : [];
}

function valueAt(value: unknown, path: string[]): unknown {
  let current = value;
  for (const part of path) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as JsonRecord)[part];
  }
  return current;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function numberEquals(actual: number | undefined, expected: number) {
  return actual !== undefined && Math.abs(actual - expected) < 0.000001;
}

function countTimelineAttachments(events: unknown) {
  return arrayAt(events, ["events"]).reduce((total, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return total;
    const attachments = (item as JsonRecord).attachments;
    return total + (Array.isArray(attachments) ? attachments.length : 0);
  }, 0);
}

function startMockNearRpc() {
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const body = await request.json() as JsonRecord;
      const params = asRecord(body.params);
      const methodName = typeof params?.method_name === "string" ? params.method_name : "";
      if (body.method !== "query" || params?.request_type !== "call_function") {
        return nearRpcResponse({ error: { message: "Unsupported mock RPC request" } });
      }
      if (methodName === "get_balance") return nearRpcResponse({ result: "1" });
      if (methodName === "ft_metadata") {
        return nearRpcResponse({
          result: {
            spec: "ft-1.0.0",
            name: "Mock USDC",
            symbol: "USDC",
            decimals: 6,
          },
        });
      }
      if (methodName === "ft_balance_of") return nearRpcResponse({ result: "112000000" });
      return nearRpcResponse({ error: { message: `Unsupported mock method: ${methodName}` } });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}

function nearRpcResponse(value: { result?: unknown; error?: unknown }) {
  if (value.error) {
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "clawhouse-agent-board-ledger",
      error: value.error,
    }), { headers: { "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: "clawhouse-agent-board-ledger",
    result: {
      block_hash: "mock-near-block",
      block_height: 1,
      logs: [],
      result: Array.from(Buffer.from(JSON.stringify(value.result))),
    },
  }), { headers: { "content-type": "application/json" } });
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main()
  .then((result) => {
    printJson(result);
    if (!result.ok) process.exitCode = 1;
  })
  .catch((error) => {
    activeMockRpc?.stop();
    activeMockRpc = null;
    printJson({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
