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
  boardId?: string;
  agentId: string;
  startingValueUsd: number;
  currentValueUsd: number;
  clientEventId?: string;
  txHash?: string;
  intentId?: string;
};

type JsonRecord = Record<string, unknown>;

const repoRoot = resolve(import.meta.dir, "../../..");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const wallet = await loadOrCreateWallet(options.keyFile);
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const boardId = options.boardId || `ledger-board-${runId}`;
  const clientEventId = options.clientEventId || `client-${runId}`;
  const txHash = options.txHash || `near-tx-${runId}`;
  const intentId = options.intentId || `near-intent-${runId}`;

  const board = await postJson(options.baseUrl, "/boards", {
    board_id: boardId,
    agent_id: options.agentId,
    wallet_address: wallet.walletAddress,
    public_key: wallet.publicKey,
    starting_value_usd: options.startingValueUsd,
    base_currency: "USD",
    public_status: "active",
    visibility_mode: "public",
  });

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
    options,
    `/boards/${boardId}/events`,
    boardId,
    eventBody,
  );
  const eventId = stringAt(event, ["event", "id"]);

  const attachment = await signedPostJson(
    options,
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

  const observation = await postJson(options.baseUrl, `/boards/${boardId}/observations`, {
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

  const cron = await postJson(options.baseUrl, "/cron/tick", {});
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
    agentId: options.agentId,
    clientEventId,
    txHash,
    intentId,
    board: board.board,
    event: event.event,
    attachment: attachment.attachment,
    observation: observation.observation,
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

async function postJson(baseUrl: string, path: string, body: JsonRecord) {
  return await requestJson(baseUrl, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getJson(baseUrl: string, path: string) {
  return await requestJson(baseUrl, path, { method: "GET" });
}

async function requestJson(baseUrl: string, path: string, init: RequestInit) {
  const url = new URL(path, ensureTrailingSlash(baseUrl));
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(`Ledger request failed for ${init.method ?? "GET"} ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const text = await response.text();
  const json = parseJson(text, path);
  if (!response.ok || json.ok === false) {
    throw new Error(`Ledger returned ${response.status} for ${init.method ?? "GET"} ${path}: ${text}`);
  }
  return json;
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
    boardId: optionalString(values["board-id"]),
    agentId: values["agent-id"] || "ironclaw-workbench",
    startingValueUsd: numberOption(values["starting-value-usd"], 100, "starting-value-usd"),
    currentValueUsd: numberOption(values["current-value-usd"], 112, "current-value-usd"),
    clientEventId: optionalString(values["client-event-id"]),
    txHash: optionalString(values["tx-hash"]),
    intentId: optionalString(values["intent-id"]),
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
    return JSON.parse(text) as JsonRecord;
  } catch {
    throw new Error(`Ledger returned non-JSON for ${path}: ${text}`);
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
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as JsonRecord)[part];
  }
  return current;
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
