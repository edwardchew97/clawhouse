import { rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createApp } from "../src/server";
import { openSqliteLedgerDb } from "../src/db";
import {
  generateNearWallet,
  signAgentBoardLedgerRequest,
} from "../../../tools/near-wallet/src/wallet";

type JsonRecord = Record<string, unknown>;

const repoRoot = resolve(import.meta.dir, "../../..");
const adminToken = "local-creator-onboarding-token";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workDir = resolvePath(options.workDir);
  assertRepoWorkPath(workDir);
  if (options.reset) await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const dbPath = join(workDir, "ledger.sqlite");
  const keyFile = join(workDir, "ironclaw-agent-wallet.json");
  const db = openSqliteLedgerDb(dbPath);
  const now = new Date();
  const app = createApp({
    db,
    now: () => now,
    adminToken,
    env: {},
  });

  try {
    const wallet = await generateNearWallet({ keyFile });
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
      visibility_mode: "public",
    };
    const rawBody = JSON.stringify(body);
    const signed = await signAgentBoardLedgerRequest({
      keyFile,
      method: "POST",
      path: "/creator-onboarding/setup",
      body: rawBody,
      boardId: options.boardId,
      agentId: options.agentId,
      timestamp: now.toISOString(),
    });
    const setupResponse = await app.fetch(new Request("http://ledger.test/creator-onboarding/setup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
        ...signed.headers,
      },
      body: rawBody,
    }));
    const setup = await jsonOf<JsonRecord>(setupResponse);
    if (!setupResponse.ok || setup.ok === false) {
      throw new Error(`Setup failed with ${setupResponse.status}: ${JSON.stringify(setup)}`);
    }

    const boardResponse = await app.fetch(new Request(`http://ledger.test/boards/${options.boardId}`));
    const board = await jsonOf<JsonRecord>(boardResponse);
    const trackedWallet = await db.get<JsonRecord>(
      "SELECT * FROM tracked_wallets WHERE board_id = ? AND wallet_address = ?",
      [options.boardId, wallet.walletAddress],
    );
    const boardsCount = await countRows(db, "boards");
    const trackedWalletsCount = await countRows(db, "tracked_wallets");

    printJson({
      ok: true,
      reset: options.reset,
      dbPath,
      keyFile,
      installPrompt: setup.install_prompt,
      setupStatus: setup.status,
      userStatus: setup.user_status,
      funding: setup.funding,
      board,
      wallet,
      proof: {
        boardsCount,
        trackedWalletsCount,
        trackedWalletRegistered: Boolean(trackedWallet),
        fundingAddressMatchesWallet: readNested(setup, ["funding", "options", "0", "address"]) === wallet.walletAddress,
        boardReadbackStatus: boardResponse.status,
      },
    });
  } finally {
    await db.close();
  }
}

function parseArgs(args: string[]) {
  const values: Record<string, string> = {};
  let reset = true;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-reset") {
      reset = false;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values[key] = value;
    index += 1;
  }

  return {
    reset,
    workDir: values["work-dir"] || "work/ironclaw-onboarding-smoke",
    boardId: values["board-id"] || "ironclaw-smoke-board",
    agentId: values["agent-id"] || "ironclaw-smoke-agent",
    agentName: values["agent-name"] || "IronClaw Smoke Agent",
    agentDescription: values["agent-description"] || "Smoke-test agent for ClawHouse creator onboarding.",
    avatarReference: values["avatar-reference"] || "none",
    tradingStrategy: values["trading-strategy"] || "NEAR/USDC long-only spot rotation through NEAR Intents. Do not trade when route or slippage checks fail.",
    fundingMinimumUsd: numberOption(values["funding-minimum-usd"], 100, "funding-minimum-usd"),
  };
}

function resolvePath(value: string) {
  return value.startsWith("/") ? value : resolve(repoRoot, value);
}

function assertRepoWorkPath(path: string) {
  const workRoot = join(repoRoot, "work");
  if (path !== workRoot && !path.startsWith(`${workRoot}/`)) {
    throw new Error(`Refusing to reset outside repo work/: ${path}`);
  }
}

function numberOption(value: string | undefined, fallback: number, name: string) {
  if (!value || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --${name}: ${value}`);
  return parsed;
}

async function countRows(db: { get<T>(sql: string, params?: unknown[]): Promise<T | undefined> }, table: "boards" | "tracked_wallets") {
  return (await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`))?.count ?? 0;
}

async function jsonOf<T>(response: Response) {
  return (await response.json()) as T;
}

function readNested(value: unknown, path: string[]) {
  let current = value;
  for (const part of path) {
    if (Array.isArray(current)) {
      current = current[Number(part)];
      continue;
    }
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
