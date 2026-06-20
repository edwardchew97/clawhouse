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
  mode: "ledger" | "gob0";
  baseUrl: string;
  keyFile: string;
  serviceToken?: string;
  boardId?: string;
  agentId: string;
  agentName?: string;
  metadataUri?: string;
  keyAmount: string;
  keyContractId?: string;
  keyRpcUrl?: string;
  keyStorageDepositNear: string;
  keyBuyStorageDepositNear: string;
  holderAccountId?: string;
  readToken?: string;
  readTokenExpiresAt?: string;
  startingValueUsd: number;
  currentValueUsd: number;
  clientEventId?: string;
  txHash?: string;
  intentId?: string;
};

type JsonRecord = Record<string, unknown>;

const repoRoot = resolve(import.meta.dir, "../../..");
const keyMarketDir = resolve(repoRoot, "agent-key-market");

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;

  if (options.mode === "gob0") {
    await runGoB0Flow(options, runId);
    return;
  }

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

  const boardBody = {
    board_id: boardId,
    agent_id: agentId,
    wallet_address: wallet.walletAddress,
    public_key: wallet.publicKey,
    starting_value_usd: options.startingValueUsd,
    base_currency: "USD",
    public_status: "active",
    visibility_mode: "public",
  };
  const board = await signedServicePostJson(scopedOptions, "/boards", boardId, boardBody);

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

async function runGoB0Flow(options: Options, runId: string) {
  const agentId = options.agentId || `gob0-agent-${runId}`;
  const scopedOptions = { ...options, agentId };
  const agentName = options.agentName || "goB0 Workbench Agent";
  const metadataUri = options.metadataUri || `workbench://gob0/${agentId}`;
  const boardId = options.boardId || `gob0-board-${runId}`;
  const keyAmount = options.keyAmount || "1";
  const clientEventId = options.clientEventId || `client-gob0-${runId}`;
  const txHash = options.txHash || `near-trade-${runId}`;
  const intentId = options.intentId || `near-intent-${runId}`;
  const readToken = options.readToken || `gob0-read-${runId}`;
  const readTokenExpiresAt = options.readTokenExpiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const keyContractId = requiredConfig(
    options.keyContractId
      ?? process.env.CONTRACT_ID
      ?? process.env.contractId,
    "contractId or --key-contract-id",
  );
  const nearNetworkId = optionalString(process.env.NEAR_NETWORK_ID)
    ?? optionalString(process.env.nearNetworkId)
    ?? "testnet";
  const keyRpcUrl = options.keyRpcUrl
    ?? optionalString(process.env.NEAR_NODE_URL)
    ?? optionalString(process.env.nearRpcUrl)
    ?? `https://rpc.${nearNetworkId}.near.org`;
  const holderAccountId = requiredConfig(
    options.holderAccountId
      ?? process.env.ACCOUNT_ID
      ?? process.env.NEAR_ACCOUNT_ID
      ?? process.env.testUserAccountId
      ?? process.env.accountId,
    "testUserAccountId or --holder-account-id",
  );
  const nearPrivateKey = requiredConfig(
    process.env.NEAR_PRIVATE_KEY ?? process.env.testUserPrivateKey,
    "testUserPrivateKey or NEAR_PRIVATE_KEY",
  );
  const keyEnv = {
    CONTRACT_ID: keyContractId,
    NEAR_ACCOUNT_ID: holderAccountId,
    ACCOUNT_ID: holderAccountId,
    NEAR_PRIVATE_KEY: nearPrivateKey,
    NEAR_NETWORK_ID: nearNetworkId,
    NEAR_NODE_URL: keyRpcUrl,
    testUserAccountId: holderAccountId,
    contractId: keyContractId,
    nearRpcUrl: keyRpcUrl,
  };
  const wallet = await loadOrCreateWallet(options.keyFile);

  const keyCreate = await runKeyMarketScript([
    "run",
    "create",
    agentId,
    agentName,
    metadataUri,
    options.keyStorageDepositNear,
  ], keyEnv);

  const boardBody = {
    board_id: boardId,
    agent_id: agentId,
    wallet_address: wallet.walletAddress,
    public_key: wallet.publicKey,
    starting_value_usd: options.startingValueUsd,
    base_currency: "USD",
    public_status: "active",
    visibility_mode: "holder_gated",
    owner_wallet_address: holderAccountId,
    metadata: {
      source: "acceptance-workbench-gob0",
      key_contract_id: keyContractId,
      holder_account_id: holderAccountId,
      strategy_summary: "goB0 holder-gated strategy readback from the real Ledger board.",
      detail_scope: "Board metadata, signed trade reason, attachment, portfolio, and PnL are readable only with a holder read token.",
    },
  };
  const board = await signedServicePostJson(scopedOptions, "/boards", boardId, boardBody);
  const createdBoardId = stringAt(board, ["board", "id"]);
  assertCondition(createdBoardId === boardId, `Ledger returned board id ${createdBoardId}, expected ${boardId}`);

  const blockedBoardRead = await requestJsonResult(options.baseUrl, `/boards/${boardId}`, { method: "GET" });
  assertCondition(
    !blockedBoardRead.responseOk && blockedBoardRead.status === 403,
    `Expected holder-gated board read without token to return 403, got ${blockedBoardRead.status}`,
  );

  const quoteBuy = await runKeyMarketScript([
    "run",
    "quote",
    "buy",
    agentId,
    keyAmount,
  ], keyEnv);
  const buyMaxPriceNear = stringAt(quoteBuy.json, ["total_cost_near"]);
  const buy = await runKeyMarketScript([
    "run",
    "buy",
    agentId,
    keyAmount,
    buyMaxPriceNear,
    options.keyBuyStorageDepositNear,
  ], keyEnv);
  const buyTxHash = stringAt(buy.json, ["txHash"]);
  const stateAfterBuy = await runKeyMarketScript([
    "run",
    "state",
    agentId,
    holderAccountId,
  ], keyEnv);
  assertPositiveInteger(valueAt(stateAfterBuy.json, ["holder_balance"]), "holder_balance after buy");

  const readAccess = await servicePostJson(scopedOptions, `/boards/${boardId}/read-access/near-key-market`, {
    rpc_url: keyRpcUrl,
    key_contract_id: keyContractId,
    holder_account_id: holderAccountId,
    agent_id: agentId,
    access_level: "key_holder_detail",
    read_token: readToken,
    expires_at: readTokenExpiresAt,
    metadata: {
      source: "acceptance-workbench-gob0",
      buy_tx_hash: buyTxHash,
    },
  });
  assertCondition(
    valueAt(readAccess, ["access_result"]) === "granted",
    `Expected key-market read access to be granted, got ${String(valueAt(readAccess, ["access_result"]))}`,
  );

  const holderBoard = await getJsonWithReadToken(options.baseUrl, `/boards/${boardId}`, readToken);
  const holderEventsBeforeReport = await getJsonWithReadToken(options.baseUrl, `/boards/${boardId}/events`, readToken);
  assertCondition(
    arrayAt(holderEventsBeforeReport, ["events"]).length === 0,
    "Expected holder-gated event timeline to be empty before the Trading Agent report",
  );

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
    reason: "goB0 Trading Agent bought NEAR after key-holder gated review.",
    metadata: {
      venue: "near-intents",
      source: "acceptance-workbench-gob0",
      user_key_buy_tx_hash: buyTxHash,
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
      reason: "Holder detail: acceptance event includes the post-trade strategy note and links back to the user buy.",
      metadata: {
        source: "acceptance-workbench-gob0",
        buy_tx_hash: buyTxHash,
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
      source: "acceptance-workbench-gob0-watcher-input",
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
    price_source: "acceptance-workbench-gob0",
    observed_at: observedAt,
  });
  const priceId = stringAt(price, ["prices", "0", "id"]);

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
      source: "acceptance-workbench-gob0",
    },
  });
  const balanceChangeId = stringAt(balanceChange, ["balance_changes", "0", "id"]);

  const cron = await servicePostJson(scopedOptions, "/cron/tick", {});
  const events = await getJsonWithReadToken(options.baseUrl, `/boards/${boardId}/events`, readToken);
  const portfolio = await getJsonWithReadToken(options.baseUrl, `/boards/${boardId}/portfolio`, readToken);
  const pnl = await getJsonWithReadToken(options.baseUrl, `/boards/${boardId}/pnl`, readToken);
  const prices = await getJsonWithReadToken(options.baseUrl, `/boards/${boardId}/prices`, readToken);
  const balanceChanges = await getJsonWithReadToken(options.baseUrl, `/boards/${boardId}/balance-changes`, readToken);
  const attachmentCount = countTimelineAttachments(events);
  const pnlUsd = valueAt(pnl, ["latest", "pnl_usd"]);

  assertCondition(arrayAt(events, ["events"]).length > 0, "Expected holder-gated event readback to include the agent trade event");
  assertCondition(attachmentCount > 0, "Expected holder-gated event readback to include the signed attachment");
  assertCondition(
    typeof pnlUsd === "number" && Math.abs(pnlUsd - (options.currentValueUsd - options.startingValueUsd)) < 0.000001,
    `Expected PnL to equal current-starting value, got ${String(pnlUsd)}`,
  );

  printJson({
    ok: true,
    mode: "gob0",
    baseUrl: options.baseUrl,
    keyMarket: {
      contractId: keyContractId,
      rpcUrl: keyRpcUrl,
      holderAccountId,
      agentId,
      keyAmount,
      create: keyCreate.json,
      quoteBuy: quoteBuy.json,
      buy: buy.json,
      stateAfterBuy: stateAfterBuy.json,
    },
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
    readToken,
    readTokenExpiresAt,
    board: board.board,
    blockedBoardRead: {
      status: blockedBoardRead.status,
      json: blockedBoardRead.json,
    },
    readAccess,
    holderBoard,
    holderEventsBeforeReport,
    event: event.event,
    attachment: attachment.attachment,
    observation: observation.observation,
    price: valueAt(price, ["prices", "0"]),
    balanceChange: valueAt(balanceChange, ["balance_changes", "0"]),
    cron,
    events,
    portfolio,
    pnl,
    prices,
    balanceChanges,
    summary: {
      holderBalance: valueAt(stateAfterBuy.json, ["holder_balance"]),
      buyTxHash,
      readAccessResult: valueAt(readAccess, ["access_result"]),
      eventCount: arrayAt(events, ["events"]).length,
      attachmentCount,
      priceSnapshotId: priceId,
      balanceChangeId,
      currentValueUsd: valueAt(portfolio, ["latest", "current_value_usd"]),
      pnlUsd,
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
  return await requestJson(options.baseUrl, path, {
    method: "POST",
    headers: {
      ...serviceHeaders(options.serviceToken),
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

async function getJson(baseUrl: string, path: string) {
  return await requestJson(baseUrl, path, { method: "GET" });
}

async function getJsonWithReadToken(baseUrl: string, path: string, readToken: string) {
  return await requestJson(baseUrl, path, {
    method: "GET",
    headers: {
      "x-clawhouse-read-token": readToken,
    },
  });
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

async function runKeyMarketScript(args: string[], env: Record<string, string>) {
  const command = ["bun", ...args.filter((value) => value !== "")];
  const proc = Bun.spawn(command, {
    cwd: keyMarketDir,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`Key Market command failed (${command.join(" ")}): ${stderr || stdout}`);
  }
  return {
    command,
    cwd: keyMarketDir,
    exitCode,
    json: parseJson(stdout, command.join(" ")),
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

  const mode = values.mode === "gob0" ? "gob0" : "ledger";

  return {
    mode,
    baseUrl: values["base-url"] || "http://127.0.0.1:4321",
    keyFile: resolvePath(values["key-file"] || "work/acceptance-workbench/agent-board-ledger/workbench-wallet.json"),
    serviceToken: optionalString(values["admin-token"])
      ?? optionalString(process.env.AGENT_BOARD_LEDGER_ADMIN_TOKEN)
      ?? optionalString(process.env.ledgerAdminToken),
    boardId: optionalString(values["board-id"]),
    agentId: optionalString(values["agent-id"]) ?? (mode === "gob0" ? "" : "ironclaw-workbench"),
    agentName: optionalString(values["agent-name"]),
    metadataUri: optionalString(values["metadata-uri"]),
    keyAmount: values["key-amount"] || "1",
    keyContractId: optionalString(values["key-contract-id"]),
    keyRpcUrl: optionalString(values["key-rpc-url"]),
    keyStorageDepositNear: values["key-storage-deposit-near"] || "1",
    keyBuyStorageDepositNear: values["key-buy-storage-deposit-near"] || "0.2",
    holderAccountId: optionalString(values["holder-account-id"]),
    readToken: optionalString(values["read-token"]),
    readTokenExpiresAt: optionalString(values["read-token-expires-at"]),
    startingValueUsd: numberOption(values["starting-value-usd"], 100, "starting-value-usd"),
    currentValueUsd: numberOption(values["current-value-usd"], 112, "current-value-usd"),
    clientEventId: optionalString(values["client-event-id"]),
    txHash: optionalString(values["tx-hash"]),
    intentId: optionalString(values["intent-id"]),
  };
}

function printHelp() {
  process.stdout.write(`Usage: bun scripts/workbench-flow.ts [options]

Modes:
  --mode ledger   Run the existing Ledger-only signed event/cron flow (default).
  --mode gob0     Run the goB0 end-to-end flow: key market create, key buy,
                  holder-gated read token, signed event, attachment, watcher
                  observation, cron, and readback.

Common options:
  --base-url <url>
  --key-file <path>
  --admin-token <token>
  --board-id <id>
  --agent-id <id>
  --starting-value-usd <number>
  --current-value-usd <number>
  --client-event-id <id>
  --tx-hash <hash>
  --intent-id <id>

goB0 options:
  --agent-name <name>
  --metadata-uri <uri>
  --key-amount <integer>
  --key-contract-id <near-account>
  --key-rpc-url <url>
  --holder-account-id <near-account>
  --read-token <token>
  --read-token-expires-at <iso-date>
  --key-storage-deposit-near <amount>
  --key-buy-storage-deposit-near <amount>

goB0 also requires real NEAR signing env from the Workbench Environment JSON:
  contractId, nearRpcUrl, testUserAccountId, testUserPrivateKey
`);
}

function resolvePath(value: string) {
  return value.startsWith("/") ? value : resolve(repoRoot, value);
}

function optionalString(value: string | undefined) {
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function requiredConfig(value: string | undefined, name: string) {
  const raw = optionalString(value);
  if (!raw) throw new Error(`Missing ${name} for goB0 Workbench flow`);
  return raw;
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

function arrayAt(value: unknown, path: string[]) {
  const result = valueAt(value, path);
  return Array.isArray(result) ? result : [];
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function assertCondition(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertPositiveInteger(value: unknown, name: string) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return;
  if (typeof value !== "string" || !/^\d+$/.test(value) || BigInt(value) <= 0n) {
    throw new Error(`Expected positive integer ${name}, got ${String(value)}`);
  }
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
