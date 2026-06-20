import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
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
  boardId: string;
  agentId: string;
  agentName: string;
  agentDescription: string;
  avatarReference: string;
  tradingStrategy: string;
  fundingMinimumUsd: number;
  visibilityMode: string;
};

type JsonRecord = Record<string, unknown>;

const repoRoot = resolve(import.meta.dir, "../../..");

async function main() {
  if (process.argv.includes("--help")) {
    printJson({
      usage: "bun scripts/creator-onboarding-setup.ts --base-url <url> --key-file <path> --board-id <id> --agent-id <id> --agent-name <name> --agent-description <text> --avatar-reference <text> --trading-strategy <text>",
      env: ["AGENT_BOARD_LEDGER_ADMIN_TOKEN", "ledgerAdminToken"],
    });
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  if (!options.serviceToken) {
    throw new Error("Missing ledgerAdminToken input or AGENT_BOARD_LEDGER_ADMIN_TOKEN for creator onboarding setup");
  }

  const wallet = await loadOrCreateWallet(options.keyFile);
  const body = {
    board_id: options.boardId,
    agent_id: options.agentId,
    agent_name: options.agentName,
    agent_description: options.agentDescription,
    avatar_reference: options.avatarReference,
    trading_strategy: options.tradingStrategy,
    wallet_address: wallet.walletAddress,
    public_key: wallet.publicKey,
    funding_minimum_usd: options.fundingMinimumUsd,
    visibility_mode: options.visibilityMode,
  };
  const rawBody = JSON.stringify(body);
  const signed = await signAgentBoardLedgerRequest({
    keyFile: options.keyFile,
    method: "POST",
    path: "/creator-onboarding/setup",
    body: rawBody,
    boardId: options.boardId,
    agentId: options.agentId,
  });
  const setup = await requestJson(options.baseUrl, "/creator-onboarding/setup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.serviceToken}`,
      ...signed.headers,
    },
    body: rawBody,
  });

  printJson({
    ok: true,
    baseUrl: options.baseUrl,
    wallet,
    setup,
  });
}

async function loadOrCreateWallet(keyFile: string): Promise<NearWalletPublicInfo> {
  await mkdir(dirname(keyFile), { recursive: true });
  if (existsSync(keyFile)) return await inspectNearWallet({ keyFile });
  return await generateNearWallet({ keyFile });
}

async function requestJson(baseUrl: string, path: string, init: RequestInit) {
  const response = await fetch(new URL(path, ensureTrailingSlash(baseUrl)), init);
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
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values[key] = value;
    index += 1;
  }

  return {
    baseUrl: values["base-url"] || "http://127.0.0.1:4321",
    keyFile: resolvePath(values["key-file"] || "work/ironclaw-onboarding/agent-wallet.json"),
    serviceToken: optionalString(values["admin-token"])
      ?? optionalString(process.env.AGENT_BOARD_LEDGER_ADMIN_TOKEN)
      ?? optionalString(process.env.ledgerAdminToken),
    boardId: requiredArg(values["board-id"], "board-id"),
    agentId: requiredArg(values["agent-id"], "agent-id"),
    agentName: requiredArg(values["agent-name"], "agent-name"),
    agentDescription: requiredArg(values["agent-description"], "agent-description"),
    avatarReference: requiredArg(values["avatar-reference"], "avatar-reference"),
    tradingStrategy: requiredArg(values["trading-strategy"], "trading-strategy"),
    fundingMinimumUsd: numberOption(values["funding-minimum-usd"], 100, "funding-minimum-usd"),
    visibilityMode: values["visibility-mode"] || "public",
  };
}

function resolvePath(value: string) {
  return value.startsWith("/") ? value : resolve(repoRoot, value);
}

function requiredArg(value: string | undefined, name: string) {
  const cleaned = optionalString(value);
  if (!cleaned) throw new Error(`Missing --${name}`);
  return cleaned;
}

function optionalString(value: string | undefined) {
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function numberOption(value: string | undefined, fallback: number, name: string) {
  const raw = optionalString(value);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --${name}: ${value}`);
  return parsed;
}

function parseJson(text: string, path: string): JsonRecord {
  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    throw new Error(`Ledger returned non-JSON for ${path}: ${text}`);
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
