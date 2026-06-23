import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import {
  generateNearWallet,
  inspectNearWallet,
  signAgentBoardLedgerAgentRequest,
  signAgentBoardLedgerRequest,
  type NearWalletPublicInfo,
} from "../../../tools/near-wallet/src/wallet";

type Options = {
  baseUrl: string;
  keyFile: string;
  serviceToken?: string;
  boardId?: string;
  agentId: string;
  startingBalanceUsd: number;
  currentValueUsd: number;
  clientEventId?: string;
  txHash?: string;
  intentId?: string;
};

type JsonRecord = Record<string, unknown>;

const repoRoot = resolve(import.meta.dir, "../../..");

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;

  const wallet = await loadOrCreateWallet(options.keyFile);
  await runLedgerFlow(options, wallet, runId);
}

async function runLedgerFlow(options: Options, wallet: NearWalletPublicInfo, runId: string) {
  const agentId = options.agentId || "ironclaw-workbench";
  const scopedOptions = { ...options, agentId };
  const boardId = options.boardId || `ledger-board-${runId}`;
  const clientEventId = options.clientEventId || `client-${runId}`;
  const txHash = options.txHash || `near-tx-${runId}`;
  const intentId = options.intentId || `near-intent-${runId}`;

  await ensureAgentRegistration(scopedOptions, wallet);
  const boardBody = {
    board_id: boardId,
    agent_id: agentId,
    agent_public_key: wallet.publicKey,
    wallet_address: wallet.walletAddress,
    public_key: wallet.publicKey,
    base_currency: "USD",
    public_status: "active",
    visibility_mode: "public",
  };
  const board = await ensureBoard(scopedOptions, wallet, boardId, boardBody);
  const paperAccountId = `${boardId}-paper`;
  const paperAccount = await ensurePaperAccount(scopedOptions, wallet, boardId, paperAccountId, runId);

  const eventBody = {
    client_event_id: clientEventId,
    tx_hash: txHash,
    intent_id: intentId,
    event_type: "agent_reported",
    status_claim: "filled",
    asset_in: "USDC",
    amount_in: 25,
    asset_out: "NEAR",
    amount_out: 10,
    reason: "Workbench verifies a wallet-signed real ledger event.",
    metadata: {
      venue: "near-intents",
      source: "acceptance-workbench",
    },
  };
  const event = await signedPostJson(
    scopedOptions,
    `/boards/${boardId}/events`,
    boardId,
    eventBody,
  );
  const eventId = stringAt(event, ["event", "id"]);

  const attachment = await signedPostJson(
    scopedOptions,
    `/boards/${boardId}/events/${eventId}/attachments`,
    boardId,
    {
      attachment_type: "analysis",
      reason: "Post-trade note attached after the original event.",
      metadata: {
        source: "acceptance-workbench",
      },
    },
  );

  const observation = await servicePostJson(scopedOptions, `/boards/${boardId}/observations`, {
    wallet_address: wallet.walletAddress,
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
      source: "acceptance-workbench",
    },
  });
  const observedAt = stringAt(observation, ["observation", "observed_at"]);
  const observationId = stringAt(observation, ["observation", "id"]);

  const nearPriceUsd = 2;
  const reconciledNearAmount = options.currentValueUsd / nearPriceUsd;
  const price = await servicePostJson(scopedOptions, `/boards/${boardId}/prices`, {
    asset_id: "native:near",
    asset_symbol: "NEAR",
    price_usd: nearPriceUsd,
    price_source: "acceptance-workbench",
    observed_at: observedAt,
  });

  const balanceChange = await servicePostJson(scopedOptions, `/boards/${boardId}/balance-changes`, {
    asset_id: "native:near",
    asset_symbol: "NEAR",
    normalized_amount: reconciledNearAmount,
    delta_amount: 10,
    delta_value_usd: 10 * nearPriceUsd,
    change_type: "trade",
    source_observation_id: observationId,
    tx_hash: txHash,
    intent_id: intentId,
    metadata: {
      source: "acceptance-workbench",
    },
  });

  const cron = await servicePostJson(scopedOptions, "/cron/tick", {});
  const events = await getJson(options.baseUrl, `/boards/${boardId}/events`);
  const portfolio = await getJson(options.baseUrl, `/boards/${boardId}/portfolio`);
  const pnl = await getJson(options.baseUrl, `/boards/${boardId}/pnl`);

  printJson({
    ok: true,
    baseUrl: options.baseUrl,
    wallet: {
      walletAddress: wallet.walletAddress,
      publicKey: wallet.publicKey,
      keyId: wallet.keyId,
      keyFile: wallet.keyFile,
    },
    boardId,
    agentId,
    clientEventId,
    txHash,
    intentId,
    board: board.board,
    paperAccount: paperAccount.account,
    event: event.event,
    attachment: attachment.attachment,
    observation: observation.observation,
    price: valueAt(price, ["prices", "0"]),
    balanceChange: valueAt(balanceChange, ["balance_changes", "0"]),
    cron,
    events,
    portfolio,
    pnl,
    summary: {
      eventCount: Array.isArray(events.events) ? events.events.length : 0,
      attachmentCount: countTimelineAttachments(events),
      currentValueUsd: valueAt(portfolio, ["latest", "current_value_usd"]),
      pnlUsd: valueAt(pnl, ["latest", "pnl_usd"]),
    },
  });
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
  path: string,
  boardId: string,
  body: JsonRecord,
) {
  const rawBody = JSON.stringify(body);
  const signed = await signAgentBoardLedgerRequest({
    keyFile: options.keyFile,
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

async function signedServicePostJson(
  options: Options,
  path: string,
  boardId: string,
  body: JsonRecord,
) {
  if (!options.serviceToken) {
    throw new Error("Missing ledgerAdminToken input or AGENT_BOARD_LEDGER_ADMIN_TOKEN for service-authorized ledger writes");
  }
  const rawBody = JSON.stringify(body);
  const signed = await signAgentBoardLedgerRequest({
    keyFile: options.keyFile,
    method: "POST",
    path,
    body: rawBody,
    boardId,
    agentId: options.agentId,
  });
  const agentPublicKey = typeof body.agent_public_key === "string" ? body.agent_public_key : "";
  const agentSigned = path === "/boards" ? await signAgentBoardLedgerAgentRequest({
    keyFile: options.keyFile,
    method: "POST",
    path,
    body: rawBody,
    purpose: "board_registration",
    boardId,
    agentId: options.agentId,
    agentPublicKey,
  }) : null;
  return await requestJson(options.baseUrl, path, {
    method: "POST",
    headers: {
      ...serviceHeaders(options.serviceToken),
      ...signed.headers,
      ...(agentSigned?.headers ?? {}),
    },
    body: rawBody,
  });
}

async function ensureAgentRegistration(options: Options, wallet: NearWalletPublicInfo) {
  if (!options.serviceToken) {
    throw new Error("Missing ledgerAdminToken input or AGENT_BOARD_LEDGER_ADMIN_TOKEN for service-authorized agent registration");
  }
  const body = {
    agent_id: options.agentId,
    agent_public_key: wallet.publicKey,
    metadata: {
      source: "acceptance-workbench",
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
    agentId: options.agentId,
    agentPublicKey: wallet.publicKey,
  });
  return await requestJson(options.baseUrl, "/agents", {
    method: "POST",
    headers: {
      ...serviceHeaders(options.serviceToken),
      ...signed.headers,
    },
    body: rawBody,
  });
}

async function ensureBoard(
  options: Options,
  wallet: NearWalletPublicInfo,
  boardId: string,
  body: JsonRecord,
) {
  const existing = await requestJsonResult(options.baseUrl, `/boards/${boardId}`, { method: "GET" });
  if (existing.responseOk) {
    const board = asRecord(asRecord(existing.json)?.board) ?? asRecord(existing.json);
    if (board?.wallet_address !== wallet.walletAddress || board?.agent_id !== options.agentId) {
      throw new Error(`Existing board ${boardId} does not match this wallet/agent`);
    }
    return { ok: true, board };
  }

  return await signedServicePostJson(options, "/boards", boardId, body);
}

async function ensurePaperAccount(
  options: Options,
  wallet: NearWalletPublicInfo,
  boardId: string,
  paperAccountId: string,
  runId: string,
) {
  const existing = await requestJsonResult(options.baseUrl, `/paper/accounts/${paperAccountId}`, { method: "GET" });
  if (existing.responseOk) {
    const account = asRecord(asRecord(existing.json)?.account);
    if (
      account?.board_id !== boardId
        || account?.agent_id !== options.agentId
        || account?.agent_public_key !== wallet.publicKey
        || Number(account?.starting_balance_usd) !== options.startingBalanceUsd
    ) {
      throw new Error(`Existing paper account ${paperAccountId} does not match this board/agent/wallet/starting balance`);
    }
    return { ok: true, account };
  }

  return await servicePostJson(options, "/paper/accounts", {
    paper_account_id: paperAccountId,
    board_id: boardId,
    agent_id: options.agentId,
    agent_public_key: wallet.publicKey,
    starting_balance_usd: options.startingBalanceUsd,
    allowed_markets: ["BTC", "ETH"],
    metadata: {
      source: "acceptance-workbench",
      run_id: runId,
    },
  });
}

async function servicePostJson(options: Options, path: string, body: JsonRecord) {
  if (!options.serviceToken) {
    throw new Error("Missing ledgerAdminToken input or AGENT_BOARD_LEDGER_ADMIN_TOKEN for service-authorized ledger writes");
  }
  const rawBody = JSON.stringify(body);
  const headers = serviceHeaders(options.serviceToken);
  if (path === "/paper/accounts") {
    const agentId = jsonString(body.agent_id) ?? options.agentId;
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

  return await requestJson(options.baseUrl, path, {
    method: "POST",
    headers,
    body: rawBody,
  });
}

async function getJson(baseUrl: string, path: string) {
  return await requestJson(baseUrl, path, { method: "GET" });
}

async function requestJson(baseUrl: string, path: string, init: RequestInit) {
  const result = await requestJsonResult(baseUrl, path, init);
  if (!result.responseOk || asRecord(result.json)?.ok === false) {
    throw new Error(`Ledger returned ${result.status} for ${init.method ?? "GET"} ${path}: ${result.text}`);
  }
  return asRecord(result.json) ?? {};
}

async function requestJsonResult(baseUrl: string, path: string, init: RequestInit) {
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
    keyFile: resolvePath(values["key-file"] || "work/acceptance-workbench/agent-board-ledger/workbench-wallet.json"),
    serviceToken: optionalString(values["admin-token"])
      ?? optionalString(process.env.AGENT_BOARD_LEDGER_ADMIN_TOKEN)
      ?? optionalString(process.env.ledgerAdminToken),
    boardId: optionalString(values["board-id"]),
    agentId: optionalString(values["agent-id"]) ?? "ironclaw-workbench",
    startingBalanceUsd: numberOption(values["starting-balance-usd"], 10000, "starting-balance-usd"),
    currentValueUsd: numberOption(values["current-value-usd"], 10012, "current-value-usd"),
    clientEventId: optionalString(values["client-event-id"]),
    txHash: optionalString(values["tx-hash"]),
    intentId: optionalString(values["intent-id"]),
  };
}

function printHelp() {
  process.stdout.write(`Usage: bun scripts/workbench-flow.ts [options]

Options:
  --base-url <url>
  --key-file <path>
  --admin-token <token>
  --board-id <id>
  --agent-id <id>
  --starting-balance-usd <number>
  --current-value-usd <number>
  --client-event-id <id>
  --tx-hash <hash>
  --intent-id <id>
`);
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

function serviceHeaders(serviceToken: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${serviceToken}`,
  };
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

function stringAt(value: JsonRecord, path: string[]) {
  const result = valueAt(value, path);
  if (typeof result !== "string" || result === "") {
    throw new Error(`Missing response field: ${path.join(".")}`);
  }
  return result;
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

function countTimelineAttachments(events: JsonRecord) {
  if (!Array.isArray(events.events)) return 0;
  return events.events.reduce((total, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return total;
    const attachments = (item as JsonRecord).attachments;
    return total + (Array.isArray(attachments) ? attachments.length : 0);
  }, 0);
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
