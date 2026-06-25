import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import {
  generateNearWallet,
  inspectNearWallet,
  signAgentBoardLedgerAgentRequest,
  type NearWalletPublicInfo,
} from "../../../tools/near-wallet/src/wallet";
import { canonicalPaperAuthPayload } from "../src/paper-trading";

type Options = {
  baseUrl: string;
  keyFile: string;
  serviceToken?: string;
  boardId?: string;
  paperAccountId?: string;
  agentId: string;
  startingBalanceUsd: number;
};

type JsonRecord = Record<string, unknown>;

type HttpResult = {
  responseOk: boolean;
  status: number;
  text: string;
  json: JsonRecord;
};

type CheckResult = {
  name: string;
  ok: boolean;
  status?: number;
  expected?: string;
  detail?: unknown;
};

const repoRoot = resolve(import.meta.dir, "../../..");

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    return {
      ok: true,
      usage: "bun scripts/workbench-paper-trading.ts [--base-url <url>] [--key-file <path>] [--board-id <id>] [--admin-token <token>]",
      env: ["AGENT_BOARD_LEDGER_ADMIN_TOKEN", "ledgerAdminToken"],
    };
  }

  const options = parseArgs(process.argv.slice(2));
  const wallet = await loadOrCreateWallet(options.keyFile);
  const keyPair = await loadKeyPair(options.keyFile, wallet);
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  return await runPaperTradingFlow(options, wallet, keyPair, runId);
}

async function runPaperTradingFlow(
  options: Options,
  wallet: NearWalletPublicInfo,
  keyPair: KeyPair,
  runId: string,
) {
  const checks: CheckResult[] = [];
  const paperAccountId = options.paperAccountId || (options.boardId ? `${options.boardId}-paper` : `paper-workbench-${runId}`);
  const agentId = options.agentId || "ironclaw-paper-workbench";

  await ensureAgentRegistration(options, wallet, agentId);
  const account = await ensurePaperAccount(options, wallet, paperAccountId, agentId, runId);
  expectSuccess(checks, "service creates or reuses paper account", account);

  const ioc = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `ioc-${runId}`,
    coin: "BTC",
    side: "buy",
    tif: "Ioc",
    size: 0.01,
    margin_mode: "cross",
    leverage: 10,
    max_slippage_bps: 200,
    reason: "Workbench opens a signed cross-margin paper long.",
  });
  expectOrderStatus(checks, "agent-signed IOC order fills from book depth", ioc, "filled");
  const iocOrderId = stringAt(ioc.json, ["order", "id"]);

  const missingSlippage = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `missing-slippage-${runId}`,
    coin: "BTC",
    side: "buy",
    tif: "Ioc",
    size: 0.1,
    margin_mode: "cross",
    leverage: 10,
    reason: "Workbench verifies market-like IOC orders carry explicit slippage.",
  });
  expectRejectedOrder(checks, "market-like IOC without max_slippage_bps is an auditable reject", missingSlippage, "max_slippage_bps_required");

  const duplicateChangedBody = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `ioc-${runId}`,
    coin: "BTC",
    side: "sell",
    tif: "Ioc",
    size: 0.002,
    margin_mode: "cross",
    leverage: 10,
    max_slippage_bps: 200,
    reason: "Workbench verifies idempotency keys cannot mask changed order bodies.",
  });
  expectHttpError(checks, "duplicate client_order_id with changed body conflicts", duplicateChangedBody, 409, "client_order_id body mismatch");

  const spotBuy = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `spot-buy-${runId}`,
    market_type: "spot",
    coin: "PURR/USDC",
    side: "buy",
    tif: "Ioc",
    size: 10,
    margin_mode: "spot",
    max_slippage_bps: 200,
    reason: "Workbench opens a signed Hyperliquid paper spot position.",
  });
  expectOrderStatus(checks, "agent-signed spot IOC order fills from spot book depth", spotBuy, "filled");

  const spotOversell = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `spot-oversell-${runId}`,
    market_type: "spot",
    coin: "PURR/USDC",
    side: "sell",
    tif: "Ioc",
    size: 11,
    margin_mode: "spot",
    max_slippage_bps: 200,
    reason: "Workbench verifies paper spot cannot sell more than held.",
  });
  expectRejectedOrder(checks, "spot sell rejects when size exceeds paper holding", spotOversell, "spot_insufficient_position");

  const reduceOnlyIncrease = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `reduce-only-increase-${runId}`,
    coin: "BTC",
    side: "buy",
    tif: "Ioc",
    size: 0.001,
    reduce_only: true,
    margin_mode: "cross",
    leverage: 10,
    max_slippage_bps: 200,
    reason: "Workbench verifies reduce-only cannot add to a long.",
  });
  expectRejectedOrder(checks, "reduce-only order cannot increase exposure", reduceOnlyIncrease, "reduce_only_would_increase");

  const reduceOnlyClose = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `reduce-only-close-${runId}`,
    coin: "BTC",
    side: "sell",
    tif: "Ioc",
    size: 0.01,
    reduce_only: true,
    margin_mode: "cross",
    leverage: 10,
    max_slippage_bps: 200,
    reason: "Workbench closes the open cross BTC paper long with reduce-only.",
  });
  expectOrderStatus(checks, "reduce-only order closes the open long", reduceOnlyClose, "filled");

  const afterCloseAccount = await getJson(options.baseUrl, `/paper/accounts/${paperAccountId}`);
  checks.push({
    name: "paper account readback shows the cross BTC long is closed",
    ok: isSuccess(afterCloseAccount)
      && !arrayAt(afterCloseAccount.json, ["positions"]).some((position) => (
        stringAt(position, ["coin"]) === "BTC"
          && stringAt(position, ["margin_mode"]) === "cross"
          && stringAt(position, ["status"]) === "open"
          && Math.abs(numberAt(position, ["signed_size"]) ?? 0) > 0
      )),
    status: afterCloseAccount.status,
    expected: "no open cross BTC position after reduce-only close",
  });

  const ethCross = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `eth-cross-${runId}`,
    coin: "ETH",
    side: "buy",
    tif: "Ioc",
    size: 0.05,
    margin_mode: "cross",
    leverage: 5,
    max_slippage_bps: 200,
    reason: "Workbench verifies cross margin values existing positions with each coin's own mark.",
  });
  expectOrderStatus(checks, "multi-coin cross-margin IOC fills with per-coin marks", ethCross, "filled");

  const isolatedMarginReject = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `isolated-margin-reject-${runId}`,
    coin: "ETH",
    side: "buy",
    tif: "Ioc",
    size: 50,
    margin_mode: "isolated",
    leverage: 1,
    max_slippage_bps: 200,
    reason: "Workbench verifies insufficient margin is persisted as a paper rejection.",
  });
  expectRejectedOrder(checks, "insufficient isolated margin is an auditable reject", isolatedMarginReject, "insufficient_isolated_paper_margin");

  const gtc = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `gtc-${runId}`,
    coin: "ETH",
    side: "buy",
    tif: "Gtc",
    limit_px: 1900,
    size: 0.01,
    margin_mode: "cross",
    leverage: 5,
    reason: "Workbench rests a non-crossing GTC bid.",
  });
  expectOrderStatus(checks, "GTC order rests when not crossing", gtc, "resting");

  const alo = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `alo-cross-${runId}`,
    coin: "ETH",
    side: "buy",
    tif: "Alo",
    limit_px: 2005,
    size: 0.01,
    margin_mode: "cross",
    leverage: 5,
    reason: "Workbench verifies post-only crossing rejection.",
  });
  expectRejectedOrder(checks, "ALO post-only order rejects crossing price", alo, "post_only_would_cross");

  const isolated = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `isolated-${runId}`,
    coin: "BTC",
    side: "buy",
    tif: "Ioc",
    size: 0.01,
    margin_mode: "isolated",
    leverage: 10,
    max_slippage_bps: 200,
    reason: "Workbench opens isolated margin before adverse mark.",
  });
  expectOrderStatus(checks, "isolated IOC paper order fills", isolated, "filled");

  const riskCheck = await servicePostJson(options, `/paper/accounts/${paperAccountId}/risk-check`, {});
  checks.push({
    name: "service-authorized risk check runs against backend market state",
    ok: isSuccess(riskCheck),
    status: riskCheck.status,
    expected: "successful risk check response",
    detail: {
      liquidationCount: arrayAt(riskCheck.json, ["liquidations"]).length,
      reasons: arrayAt(riskCheck.json, ["liquidations"]).map((item) => stringAt(item, ["reason"])),
    },
  });

  const leaderboard = await getJson(options.baseUrl, "/paper/leaderboard");
  checks.push({
    name: "paper leaderboard includes account with paper label",
    ok: isSuccess(leaderboard)
      && stringAt(leaderboard.json, ["label"]) === "paper"
      && arrayAt(leaderboard.json, ["leaderboard"]).some((item) => stringAt(item, ["paper_account_id"]) === paperAccountId),
    status: leaderboard.status,
    expected: "paper-labeled leaderboard row for the workbench account",
  });

  const replay = iocOrderId
    ? await getJson(options.baseUrl, `/paper/orders/${iocOrderId}/replay`)
    : missingResult("missing IOC order id");
  checks.push({
    name: "replay exposes order, book snapshot, fills, and audit events",
    ok: isSuccess(replay)
      && stringAt(replay.json, ["replay", "order", "id"]) === iocOrderId
      && stringAt(replay.json, ["replay", "market_snapshot", "coin"]) === "BTC"
      && arrayAt(replay.json, ["replay", "fills"]).length > 0
      && arrayAt(replay.json, ["replay", "audit"]).length > 0,
    status: replay.status,
    expected: "deterministic replay packet for the IOC order",
  });

  const failed = checks.filter((check) => !check.ok);
  return {
    ok: failed.length === 0,
    baseUrl: options.baseUrl,
    boardId: options.boardId ?? null,
    paperAccountId,
    agentId,
    wallet: {
      walletAddress: wallet.walletAddress,
      publicKey: wallet.publicKey,
      keyId: wallet.keyId,
      keyFile: wallet.keyFile,
    },
    ids: {
      iocOrderId,
      isolatedOrderId: stringAt(isolated.json, ["order", "id"]),
    },
    checks,
    summary: {
      passed: checks.length - failed.length,
      failed: failed.length,
    },
  };
}

async function loadOrCreateWallet(keyFile: string) {
  await mkdir(dirname(keyFile), { recursive: true });
  if (existsSync(keyFile)) return await inspectNearWallet({ keyFile });
  return await generateNearWallet({ keyFile });
}

async function loadKeyPair(keyFile: string, wallet: NearWalletPublicInfo) {
  const raw = await readFile(keyFile, "utf8");
  const parsed = asRecord(JSON.parse(raw));
  const privateKey = typeof parsed?.private_key === "string" ? parsed.private_key : "";
  const keyPair = KeyPair.fromString(privateKey as KeyPairString);
  if (keyPair.getPublicKey().toString() !== wallet.publicKey) {
    throw new Error("Paper signing key file private_key does not match public_key");
  }
  return keyPair;
}

async function servicePostJson(options: Options, path: string, body: JsonRecord) {
  if (!options.serviceToken) {
    throw new Error("Missing ledgerAdminToken input or AGENT_BOARD_LEDGER_ADMIN_TOKEN for service-authorized paper writes");
  }
  const rawBody = JSON.stringify(body);
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${options.serviceToken}`,
  };
  if (path === "/paper/accounts") {
    const agentId = requiredJsonString(body.agent_id, "agent_id");
    const agentPublicKey = requiredJsonString(body.agent_public_key, "agent_public_key");
    const signed = await signAgentBoardLedgerAgentRequest({
      keyFile: options.keyFile,
      method: "POST",
      path,
      body: rawBody,
      purpose: "paper_account_registration",
      boardId: jsonString(body.board_id),
      agentId,
      agentPublicKey,
    });
    Object.assign(headers, signed.headers);
  }
  return await requestJsonResult(options.baseUrl, path, {
    method: "POST",
    headers,
    body: rawBody,
  });
}

async function ensureAgentRegistration(options: Options, wallet: NearWalletPublicInfo, agentId: string) {
  if (!options.serviceToken) {
    throw new Error("Missing ledgerAdminToken input or AGENT_BOARD_LEDGER_ADMIN_TOKEN for service-authorized agent registration");
  }
  const body = {
    agent_id: agentId,
    agent_public_key: wallet.publicKey,
    metadata: {
      source: "acceptance-workbench-paper-trading",
    },
  };
  const rawBody = JSON.stringify(body);
  const signed = await signAgentBoardLedgerAgentRequest({
    keyFile: options.keyFile,
    method: "POST",
    path: "/agents",
    body: rawBody,
    purpose: "agent_registration",
    boardId: null,
    agentId,
    agentPublicKey: wallet.publicKey,
  });
  const result = await requestJsonResult(options.baseUrl, "/agents", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.serviceToken}`,
      ...signed.headers,
    },
    body: rawBody,
  });
  if (!result.responseOk || result.json?.ok === false) {
    throw new Error(`Ledger returned ${result.status} for POST /agents: ${result.text}`);
  }
  return result;
}

async function ensurePaperAccount(
  options: Options,
  wallet: NearWalletPublicInfo,
  paperAccountId: string,
  agentId: string,
  runId: string,
) {
  const existing = await getJson(options.baseUrl, `/paper/accounts/${paperAccountId}`);
  if (existing.responseOk) {
    const account = asRecord(existing.json.account);
    if (
      (options.boardId && account?.board_id !== options.boardId)
        || account?.agent_id !== agentId
        || account?.agent_public_key !== wallet.publicKey
        || Number(account?.starting_balance_usd) !== options.startingBalanceUsd
    ) {
      throw new Error(`Existing paper account ${paperAccountId} does not match this board/agent/wallet/starting balance`);
    }
    return existing;
  }

  return await servicePostJson(options, "/paper/accounts", {
    paper_account_id: paperAccountId,
    board_id: options.boardId,
    agent_id: agentId,
    agent_public_key: wallet.publicKey,
    starting_balance_usd: options.startingBalanceUsd,
    allowed_markets: ["BTC", "ETH", "spot:PURR/USDC"],
    metadata: {
      source: "acceptance-workbench",
      run_id: runId,
    },
  });
}

async function paperPostJson(
  options: Options,
  wallet: NearWalletPublicInfo,
  keyPair: KeyPair,
  path: string,
  paperAccountId: string,
  agentId: string,
  body: JsonRecord,
) {
  const signedBody = await withReferencePrice(options, body);
  const rawBody = JSON.stringify(signedBody);
  const timestamp = Date.now().toString();
  const nonce = randomUUID();
  const bodyHash = sha256Hex(rawBody);
  const payload = canonicalPaperAuthPayload({
    method: "POST",
    path,
    bodyHash,
    timestamp,
    nonce,
    paperAccountId,
    agentId,
  });
  const signature = keyPair.sign(new TextEncoder().encode(payload)).signature;
  return await requestJsonResult(options.baseUrl, path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-clawhouse-paper-account-id": paperAccountId,
      "x-clawhouse-agent-id": agentId,
      "x-clawhouse-paper-timestamp": timestamp,
      "x-clawhouse-paper-nonce": nonce,
      "x-clawhouse-paper-body-sha256": bodyHash,
      "x-clawhouse-paper-signature": Buffer.from(signature).toString("base64url"),
    },
    body: rawBody,
  });
}

async function withReferencePrice(options: Options, body: JsonRecord) {
  if (body.reference_px !== undefined || body.referencePx !== undefined) {
    return body;
  }
  const marketType = jsonString(body.market_type) ?? jsonString(body.marketType) ?? "perp";
  const coin = requiredJsonString(body.coin, "coin");
  const snapshot = await servicePostJson(options, "/paper/market-snapshots/hyperliquid", {
    market_type: marketType,
    coin,
  });
  if (!snapshot.responseOk) {
    throw new Error(`Unable to fetch live Hyperliquid reference price for ${marketType}:${coin}: ${snapshot.text}`);
  }
  const markPx = numberAt(snapshot.json, ["snapshots", "0", "mark_px"]);
  if (markPx === undefined || markPx <= 0) {
    throw new Error(`Live Hyperliquid snapshot for ${marketType}:${coin} did not include mark_px`);
  }
  return {
    ...body,
    reference_px: markPx,
    max_reference_deviation_bps: body.max_reference_deviation_bps ?? body.maxReferenceDeviationBps ?? 100,
  };
}

async function getJson(baseUrl: string, path: string) {
  return await requestJsonResult(baseUrl, path, { method: "GET" });
}

async function requestJsonResult(baseUrl: string, path: string, init: RequestInit): Promise<HttpResult> {
  let response: Response;
  try {
    response = await fetch(new URL(path, ensureTrailingSlash(baseUrl)), init);
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
    keyFile: resolvePath(values["key-file"] || "work/acceptance-workbench/agent-board-ledger/paper-wallet.json"),
    serviceToken: optionalString(values["admin-token"])
      ?? optionalString(process.env.AGENT_BOARD_LEDGER_ADMIN_TOKEN)
      ?? optionalString(process.env.ledgerAdminToken),
    boardId: optionalString(values["board-id"]),
    paperAccountId: optionalString(values["paper-account-id"]),
    agentId: optionalString(values["agent-id"]) ?? "ironclaw-paper-workbench",
    startingBalanceUsd: numberOption(values["starting-balance-usd"], 10000, "starting-balance-usd"),
  };
}

function expectSuccess(checks: CheckResult[], name: string, result: HttpResult) {
  checks.push({
    name,
    ok: isSuccess(result),
    status: result.status,
    expected: "2xx response with ok !== false",
    detail: result.responseOk ? undefined : result.text,
  });
}

function expectOrderStatus(checks: CheckResult[], name: string, result: HttpResult, expectedStatus: string) {
  checks.push({
    name,
    ok: isSuccess(result) && stringAt(result.json, ["order", "status"]) === expectedStatus,
    status: result.status,
    expected: `order.status=${expectedStatus}`,
    detail: {
      orderStatus: stringAt(result.json, ["order", "status"]),
      fillCount: arrayAt(result.json, ["fills"]).length,
    },
  });
}

function expectRejectedOrder(checks: CheckResult[], name: string, result: HttpResult, expectedRejectReason: string) {
  checks.push({
    name,
    ok: isSuccess(result)
      && stringAt(result.json, ["order", "status"]) === "rejected"
      && stringAt(result.json, ["order", "reject_reason"]) === expectedRejectReason,
    status: result.status,
    expected: `rejected with ${expectedRejectReason}`,
    detail: {
      orderStatus: stringAt(result.json, ["order", "status"]),
      rejectReason: stringAt(result.json, ["order", "reject_reason"]),
    },
  });
}

function expectHttpError(checks: CheckResult[], name: string, result: HttpResult, expectedStatus: number, expectedError: string) {
  checks.push({
    name,
    ok: result.status === expectedStatus && stringAt(result.json, ["error"]) === expectedError,
    status: result.status,
    expected: `${expectedStatus} ${expectedError}`,
    detail: {
      error: stringAt(result.json, ["error"]),
      text: result.text,
    },
  });
}

function isSuccess(result: HttpResult) {
  return result.responseOk && result.json.ok !== false;
}

function missingResult(message: string): HttpResult {
  return {
    responseOk: false,
    status: 0,
    text: message,
    json: { ok: false, error: message },
  };
}

function resolvePath(value: string) {
  return value.startsWith("/") ? value : resolve(repoRoot, value);
}

function optionalString(value: string | undefined) {
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function jsonString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function requiredJsonString(value: unknown, name: string) {
  const normalized = jsonString(value);
  if (!normalized) throw new Error(`Missing ${name}`);
  return normalized;
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

function parseJson(text: string, path: string): JsonRecord {
  try {
    const parsed = text ? JSON.parse(text) : {};
    return asRecord(parsed) ?? {};
  } catch {
    throw new Error(`Command returned non-JSON for ${path}: ${text}`);
  }
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stringAt(value: unknown, path: string[]) {
  const result = valueAt(value, path);
  return typeof result === "string" ? result : undefined;
}

function arrayAt(value: unknown, path: string[]) {
  const result = valueAt(value, path);
  return Array.isArray(result) ? result : [];
}

function numberAt(value: unknown, path: string[]) {
  const result = valueAt(value, path);
  return typeof result === "number" ? result : undefined;
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

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main()
  .then((result) => {
    printJson(result);
    if (!result.ok) process.exitCode = 1;
  })
  .catch((error) => {
    printJson({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
