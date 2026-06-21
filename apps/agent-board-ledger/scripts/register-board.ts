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
  boardId?: string;
  agentId: string;
  startingBalanceUsd: number;
  visibilityMode: string;
};

type JsonRecord = Record<string, unknown>;

const repoRoot = resolve(import.meta.dir, "../../..");

async function main() {
  if (process.argv.includes("--help")) {
    printJson({
      usage: "bun scripts/register-board.ts --base-url <url> --key-file <path> --agent-id <id>",
      options: ["--starting-balance-usd <number>"],
      env: ["AGENT_BOARD_LEDGER_ADMIN_TOKEN", "ledgerAdminToken"],
    });
    return;
  }
  const options = parseArgs(process.argv.slice(2));
  if (!options.serviceToken) {
    throw new Error("Missing ledgerAdminToken input or AGENT_BOARD_LEDGER_ADMIN_TOKEN for service-authorized board registration");
  }

  const wallet = await loadOrCreateWallet(options.keyFile);
  const boardId = options.boardId || `ledger-board-${crypto.randomUUID().slice(0, 8)}`;
  const body = {
    board_id: boardId,
    agent_id: options.agentId,
    wallet_address: wallet.walletAddress,
    public_key: wallet.publicKey,
    base_currency: "USD",
    public_status: "active",
    visibility_mode: options.visibilityMode,
    metadata: {
      source: "acceptance-workbench",
      strategy_summary: "Workbench-registered agent board metadata.",
    },
  };
  const rawBody = JSON.stringify(body);
  const signed = await signAgentBoardLedgerRequest({
    keyFile: options.keyFile,
    method: "POST",
    path: "/boards",
    body: rawBody,
    boardId,
    agentId: options.agentId,
  });
  const response = await requestJson(options.baseUrl, "/boards", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.serviceToken}`,
      ...signed.headers,
    },
    body: rawBody,
  });
  const paperAccountId = `${boardId}-paper`;
  const paperAccount = await requestJson(options.baseUrl, "/paper/accounts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.serviceToken}`,
    },
    body: JSON.stringify({
      paper_account_id: paperAccountId,
      board_id: boardId,
      agent_id: options.agentId,
      agent_public_key: wallet.publicKey,
      starting_balance_usd: options.startingBalanceUsd,
      allowed_markets: ["BTC", "ETH"],
      metadata: {
        source: "acceptance-workbench",
      },
    }),
  });

  printJson({
    ok: true,
    baseUrl: options.baseUrl,
    wallet,
    boardId,
    agentId: options.agentId,
    paperAccountId,
    board: response.board,
    paperAccount: paperAccount.account,
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
    keyFile: resolvePath(values["key-file"] || "work/acceptance-workbench/agent-board-ledger/workbench-wallet.json"),
    serviceToken: optionalString(values["admin-token"])
      ?? optionalString(process.env.AGENT_BOARD_LEDGER_ADMIN_TOKEN)
      ?? optionalString(process.env.ledgerAdminToken),
    boardId: optionalString(values["board-id"]),
    agentId: values["agent-id"] || "ironclaw-workbench",
    startingBalanceUsd: numberOption(values["starting-balance-usd"], 10000, "starting-balance-usd"),
    visibilityMode: values["visibility-mode"] || "public",
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
