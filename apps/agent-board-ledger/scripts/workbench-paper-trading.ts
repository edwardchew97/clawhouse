import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import {
  generateNearWallet,
  inspectNearWallet,
  type NearWalletPublicInfo,
} from "../../../tools/near-wallet/src/wallet";
import { canonicalPaperAuthPayload } from "../src/paper-trading";

type Options = {
  baseUrl: string;
  keyFile: string;
  serviceToken?: string;
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
      usage: "bun scripts/workbench-paper-trading.ts [--base-url <url>] [--key-file <path>] [--admin-token <token>]",
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
  const paperAccountId = options.paperAccountId || `paper-workbench-${runId}`;
  const agentId = options.agentId || "ironclaw-paper-workbench";

  const account = await servicePostJson(options, "/paper/accounts", {
    paper_account_id: paperAccountId,
    agent_id: agentId,
    agent_public_key: wallet.publicKey,
    starting_balance_usd: options.startingBalanceUsd,
    allowed_markets: ["BTC", "ETH"],
    metadata: {
      source: "acceptance-workbench",
      run_id: runId,
    },
  });
  expectSuccess(checks, "service creates paper account", account);

  const btcSnapshot = await servicePostJson(options, "/paper/market-snapshots", {
    coin: "BTC",
    source: "acceptance-workbench-hyperliquid-paper",
    mark_px: 100,
    maintenance_margin_rate: 0.005,
    observed_at: new Date().toISOString(),
    bids: [{ px: 99, sz: 5 }],
    asks: [{ px: 100, sz: 1 }, { px: 101, sz: 5 }],
  });
  expectSuccess(checks, "service records BTC market snapshot", btcSnapshot);

  const ioc = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `ioc-${runId}`,
    coin: "BTC",
    side: "buy",
    tif: "Ioc",
    size: 1.2,
    margin_mode: "cross",
    leverage: 10,
    max_slippage_bps: 200,
    reason: "Workbench opens a signed cross-margin paper long.",
  });
  expectOrderStatus(checks, "agent-signed IOC order fills from book depth", ioc, "filled");
  const iocOrderId = stringAt(ioc.json, ["order", "id"]);

  const reduceOnlyIncrease = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `reduce-only-increase-${runId}`,
    coin: "BTC",
    side: "buy",
    tif: "Ioc",
    size: 0.1,
    reduce_only: true,
    margin_mode: "cross",
    leverage: 10,
    reason: "Workbench verifies reduce-only cannot add to a long.",
  });
  expectRejectedOrder(checks, "reduce-only order cannot increase exposure", reduceOnlyIncrease, "reduce_only_would_increase");

  const ethSnapshot = await servicePostJson(options, "/paper/market-snapshots", {
    coin: "ETH",
    source: "acceptance-workbench-hyperliquid-paper",
    mark_px: 2000,
    maintenance_margin_rate: 0.005,
    observed_at: new Date().toISOString(),
    bids: [{ px: 1995, sz: 5 }],
    asks: [{ px: 2005, sz: 5 }],
  });
  expectSuccess(checks, "service records ETH market snapshot", ethSnapshot);

  const gtc = await paperPostJson(options, wallet, keyPair, "/paper/orders", paperAccountId, agentId, {
    paper_account_id: paperAccountId,
    client_order_id: `gtc-${runId}`,
    coin: "ETH",
    side: "buy",
    tif: "Gtc",
    limit_px: 1900,
    size: 0.1,
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
    size: 0.1,
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
    size: 1,
    margin_mode: "isolated",
    leverage: 10,
    reason: "Workbench opens isolated margin before adverse mark.",
  });
  expectOrderStatus(checks, "isolated IOC paper order fills", isolated, "filled");

  const adverseSnapshot = await servicePostJson(options, "/paper/market-snapshots", {
    coin: "BTC",
    source: "acceptance-workbench-hyperliquid-paper",
    mark_px: 90,
    maintenance_margin_rate: 0.005,
    observed_at: new Date().toISOString(),
    bids: [{ px: 89, sz: 5 }],
    asks: [{ px: 90, sz: 5 }],
  });
  expectSuccess(checks, "service records adverse BTC mark", adverseSnapshot);

  const riskCheck = await servicePostJson(options, `/paper/accounts/${paperAccountId}/risk-check`, {});
  checks.push({
    name: "risk check liquidates breached isolated position",
    ok: isSuccess(riskCheck)
      && arrayAt(riskCheck.json, ["liquidations"]).some((item) => stringAt(item, ["reason"]) === "isolated_maintenance_margin_breach"),
    status: riskCheck.status,
    expected: "one isolated liquidation event",
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
  return await requestJsonResult(options.baseUrl, path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.serviceToken}`,
    },
    body: JSON.stringify(body),
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
  const rawBody = JSON.stringify(body);
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
    paperAccountId: optionalString(values["paper-account-id"]),
    agentId: optionalString(values["agent-id"]) ?? "ironclaw-paper-workbench",
    startingBalanceUsd: numberOption(values["starting-balance-usd"], 1000, "starting-balance-usd"),
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
