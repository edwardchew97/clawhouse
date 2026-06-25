import { spawn as spawnNode } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

type ServiceConfig = {
  id: string;
  name: string;
  cwd: string;
  command: string[];
  healthUrl: string;
  requiredEnv: string[];
};

type RuntimeConfig = {
  runtimeWorktree: string;
  stateDir: string;
  devPollIntervalMs: number;
  healthPollIntervalMs: number;
  startupTimeoutMs: number;
  installDirs: string[];
  services: ServiceConfig[];
};

type ServiceRuntime = ServiceConfig & {
  process?: ReturnType<typeof Bun.spawn>;
  lastHealth?: HealthResult;
  lastExitCode?: number | null;
};

type HealthResult = {
  ok: boolean;
  status?: number;
  error?: string;
  checkedAt: string;
};

type RuntimeStatus = {
  ok: boolean;
  mode: "starting" | "running" | "degraded" | "stopping" | "stopped";
  pid: number;
  sourceRepoRoot: string;
  runtimeRepoRoot: string;
  originDev?: string;
  runtimeHead?: string;
  updatedAt: string;
  logPath: string;
  services: Array<{
    id: string;
    name: string;
    pid?: number;
    command: string[];
    cwd: string;
    healthUrl: string;
    health?: HealthResult;
    lastExitCode?: number | null;
    missingEnv: string[];
  }>;
  checks: {
    databaseUrl: boolean;
    ledgerAdminToken: boolean;
    workbenchEncryptionKey: boolean;
    databaseMigrated?: boolean;
    databaseChecked?: boolean;
    databaseError?: string;
  };
};

const defaultConfig: RuntimeConfig = {
  runtimeWorktree: ".worktrees/clawhouse-local-runtime-dev",
  stateDir: "work/clawhouse-local-runtime",
  devPollIntervalMs: 60_000,
  healthPollIntervalMs: 5_000,
  startupTimeoutMs: 120_000,
  installDirs: [
    "apps/agent-board-ledger",
    "apps/clawhouse-app",
    "agent-key-market",
    "tools/near-wallet",
  ],
  services: [
    {
      id: "ledger",
      name: "Agent Board Ledger",
      cwd: "apps/agent-board-ledger",
      command: ["bun", "run", "dev"],
      healthUrl: "http://127.0.0.1:4321/health",
      requiredEnv: ["AGENT_BOARD_LEDGER_DATABASE_URL", "AGENT_BOARD_LEDGER_ADMIN_TOKEN"],
    },
    {
      id: "clawhouse-app",
      name: "ClawHouse App",
      cwd: "apps/clawhouse-app",
      command: ["bun", "run", "dev", "--hostname", "127.0.0.1", "--port", "4320"],
      healthUrl: "http://127.0.0.1:4320/api/key-market/config",
      requiredEnv: [],
    },
    {
      id: "workbench",
      name: "Acceptance Workbench",
      cwd: ".",
      command: ["bun", "run", "workbench"],
      healthUrl: "http://127.0.0.1:4318/health",
      requiredEnv: ["ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY"],
    },
  ],
};

const args = Bun.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) ?? "start";
const sourceRepoRoot = resolve(option("source-repo") ?? findRepoRoot(process.cwd()));
const config = loadConfig(sourceRepoRoot);
const runtimeRepoRoot = resolve(sourceRepoRoot, config.runtimeWorktree);
const stateDir = resolve(sourceRepoRoot, config.stateDir);
const statusPath = join(stateDir, "status.json");
const pidPath = join(stateDir, "daemon.pid");
const logPath = join(stateDir, "runtime.log");
const managedGeneratedPaths = ["apps/clawhouse-app/next-env.d.ts"];

switch (command) {
  case "start":
    await startDaemon();
    break;
  case "daemon":
    await runDaemon();
    break;
  case "status":
    printJson(readStatus());
    break;
  case "stop":
    await stopDaemon();
    break;
  default:
    fail(`Unknown command: ${command}`);
}

async function startDaemon() {
  mkdirSync(stateDir, { recursive: true });
  const existing = readStatus();
  if (existing && processIsAlive(existing.pid)) {
    printJson(existing);
    return;
  }

  const out = openSync(logPath, "a");
  const child = spawnNode(process.execPath, [currentScriptPath(), "daemon", `--source-repo=${sourceRepoRoot}`], {
    cwd: sourceRepoRoot,
    detached: true,
    env: process.env,
    stdio: ["ignore", out, out],
  });
  child.unref();

  const started = Date.now();
  while (Date.now() - started < config.startupTimeoutMs) {
    await sleep(1000);
    const status = readStatus();
    if (!status || status.pid !== child.pid) continue;
    if (status.mode === "running" || hasFatalReadinessGap(status)) {
      printJson(status);
      return;
    }
  }

  const status = readStatus();
  printJson(status ?? { ok: false, error: "Timed out waiting for daemon status", logPath });
  if (!status?.ok) process.exitCode = 1;
}

async function stopDaemon() {
  const status = readStatus();
  const pid = status?.pid ?? readPid();
  if (!pid) {
    printJson({ ok: true, stopped: true, reason: "No daemon pid found" });
    return;
  }
  if (!processIsAlive(pid)) {
    rmIfExists(pidPath);
    printJson({ ok: true, stopped: true, reason: "Daemon was not running", pid });
    return;
  }
  process.kill(pid, "SIGTERM");
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    await sleep(500);
    if (!processIsAlive(pid)) {
      rmIfExists(pidPath);
      printJson({ ok: true, stopped: true, pid });
      return;
    }
  }
  printJson({ ok: false, stopped: false, pid, error: "Daemon did not stop after SIGTERM" });
  process.exitCode = 1;
}

async function runDaemon() {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(pidPath, `${process.pid}\n`);
  appendLog(`daemon started from ${sourceRepoRoot}`);

  const services = config.services.map((service) => ({ ...service })) as ServiceRuntime[];
  let stopping = false;
  let env = await prepareEnvironment();
  let checks = runtimeChecks(env);

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    writeStatus("stopping", services, checks);
    await stopServices(services);
    writeStatus("stopped", services, checks);
    rmIfExists(pidPath);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  try {
    await prepareRuntimeWorktree();
    await installDependencies(env);
    checks = await prepareDatabase(env, checks);
    startServices(services, env);
    writeStatus("starting", services, checks);
  } catch (error) {
    appendLog(`startup failed: ${errorMessage(error)}`);
    writeStatus("degraded", services, { ...checks, databaseError: errorMessage(error) });
  }

  let lastDevSha = await safeOriginDevSha();
  let lastDevPoll = Date.now();

  while (!stopping) {
    await updateHealth(services);
    writeStatus(allHealthy(services) && checks.databaseChecked !== false ? "running" : "degraded", services, checks);

    if (Date.now() - lastDevPoll >= config.devPollIntervalMs) {
      lastDevPoll = Date.now();
      const nextSha = await safeOriginDevSha();
      if (nextSha && lastDevSha && nextSha !== lastDevSha) {
        appendLog(`origin/dev changed ${lastDevSha} -> ${nextSha}; refreshing runtime`);
        await stopServices(services);
        try {
          await prepareRuntimeWorktree();
          env = await prepareEnvironment();
          await installDependencies(env);
          checks = await prepareDatabase(env, runtimeChecks(env));
          startServices(services, env);
          lastDevSha = nextSha;
        } catch (error) {
          appendLog(`refresh failed: ${errorMessage(error)}`);
          checks = { ...checks, databaseError: errorMessage(error) };
        }
      } else if (nextSha) {
        lastDevSha = nextSha;
      }
    }

    await sleep(config.healthPollIntervalMs);
  }
}

async function prepareRuntimeWorktree() {
  await run(["git", "fetch", "origin", "dev"], sourceRepoRoot);
  if (!existsSync(runtimeRepoRoot)) {
    await run(["git", "worktree", "add", "--detach", runtimeRepoRoot, "origin/dev"], sourceRepoRoot);
    return;
  }
  await restoreManagedGeneratedFiles();
  const status = await capture(["git", "status", "--short"], runtimeRepoRoot);
  if (status.stdout.trim()) {
    throw new Error(`Runtime worktree is dirty: ${runtimeRepoRoot}`);
  }
  await run(["git", "fetch", "origin", "dev"], runtimeRepoRoot);
  await run(["git", "checkout", "--detach", "origin/dev"], runtimeRepoRoot);
}

async function restoreManagedGeneratedFiles() {
  const status = await capture(["git", "status", "--short", "--", ...managedGeneratedPaths], runtimeRepoRoot);
  if (!status.stdout.trim()) return;
  appendLog(`restoring generated runtime files:\n${status.stdout}`);
  await run(["git", "restore", "--", ...managedGeneratedPaths], runtimeRepoRoot);
}

async function installDependencies(env: Record<string, string>) {
  for (const dir of config.installDirs) {
    const cwd = join(runtimeRepoRoot, dir);
    if (!existsSync(join(cwd, "package.json"))) continue;
    await run(["bun", "install", "--frozen-lockfile"], cwd, env);
  }
}

async function prepareDatabase(env: Record<string, string>, checks: RuntimeStatus["checks"]) {
  if (!checks.databaseUrl) {
    return {
      ...checks,
      databaseMigrated: false,
      databaseChecked: false,
      databaseError: "Missing AGENT_BOARD_LEDGER_DATABASE_URL or DATABASE_URL",
    };
  }
  const cwd = join(runtimeRepoRoot, "apps/agent-board-ledger");
  await run(["bun", "run", "db:migrate"], cwd, env);
  await run(["bun", "run", "db:check"], cwd, env);
  return { ...checks, databaseMigrated: true, databaseChecked: true, databaseError: undefined };
}

function startServices(services: ServiceRuntime[], env: Record<string, string>) {
  for (const service of services) {
    if (service.process && processIsAlive(service.process.pid)) continue;
    const missing = missingEnv(service.requiredEnv, env);
    if (service.id === "ledger" && missing.includes("AGENT_BOARD_LEDGER_DATABASE_URL")) {
      appendLog(`skipping ${service.id}; missing database URL`);
      continue;
    }
    appendLog(`starting ${service.id}: ${service.command.join(" ")}`);
    service.lastExitCode = undefined;
    service.process = Bun.spawn(service.command, {
      cwd: join(runtimeRepoRoot, service.cwd),
      env: serviceEnv(service, env),
      stdout: "inherit",
      stderr: "inherit",
      stdin: "ignore",
    });
    service.process.exited.then((code) => {
      service.lastExitCode = code;
      appendLog(`${service.id} exited with code ${code}`);
      service.process = undefined;
    });
  }
}

async function stopServices(services: ServiceRuntime[]) {
  for (const service of services) service.process?.kill();
  await sleep(1000);
  for (const service of services) {
    if (service.process && processIsAlive(service.process.pid)) service.process.kill("SIGKILL");
    service.process = undefined;
  }
}

async function updateHealth(services: ServiceRuntime[]) {
  await Promise.all(services.map(async (service) => {
    service.lastHealth = await checkHealth(service.healthUrl);
  }));
}

async function checkHealth(url: string): Promise<HealthResult> {
  try {
    const headers = await healthHeaders(url);
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(1500) });
    return {
      ok: response.ok,
      status: response.status,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error),
      checkedAt: new Date().toISOString(),
    };
  }
}

async function healthHeaders(url: string) {
  const parsed = new URL(url);
  if (parsed.pathname !== "/health" || parsed.port !== "4318") return {};

  const response = await fetch(parsed.origin, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) return {};

  const html = await response.text();
  const token = html.match(/name="clawhouse-workbench-token" content="([^"]+)"/)?.[1] ?? "";
  return token ? { "x-clawhouse-workbench-token": token } : {};
}

function allHealthy(services: ServiceRuntime[]) {
  return services.every((service) => service.lastHealth?.ok === true);
}

async function prepareEnvironment() {
  const env = loadRuntimeEnv(sourceRepoRoot);
  ensureWorkbenchEncryptionKey(env);
  env.CLAWHOUSE_AGENT_API_BASE_URL = env.CLAWHOUSE_LOCAL_RUNTIME_APP_BACKEND_URL ?? "http://127.0.0.1:4321";
  env.NEXT_PUBLIC_CLAWHOUSE_AGENT_API_BASE_URL = env.CLAWHOUSE_AGENT_API_BASE_URL;
  return env;
}

function loadRuntimeEnv(repoRoot: string) {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const envFiles = [
    ".env",
    ".env.local",
    "apps/agent-board-ledger/.env",
    "apps/agent-board-ledger/.env.local",
    "apps/clawhouse-app/.env",
    "apps/clawhouse-app/.env.local",
    "agent-key-market/.env",
    "agent-key-market/.env.local",
    "tools/near-wallet/.env",
    "tools/near-wallet/.env.local",
  ];
  for (const file of envFiles) {
    Object.assign(env, readEnvFile(join(repoRoot, file)));
  }
  if (env.AGENT_BOARD_LEDGER_DATABASE_URL && !env.DATABASE_URL) {
    env.DATABASE_URL = env.AGENT_BOARD_LEDGER_DATABASE_URL;
  }
  return env;
}

function ensureWorkbenchEncryptionKey(env: Record<string, string>) {
  if (env.ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY) return;
  const envPath = join(sourceRepoRoot, ".env");
  mkdirSync(dirname(envPath), { recursive: true });
  const key = randomBytes(32).toString("base64");
  appendFileSync(envPath, `${existsSync(envPath) ? "\n" : ""}ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY=${key}\n`);
  env.ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY = key;
  appendLog("generated local ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY in ignored .env");
}

function serviceEnv(service: ServiceRuntime, env: Record<string, string>) {
  const next = { ...env };
  if (service.id === "clawhouse-app") {
    next.PORT = "4320";
  }
  return next;
}

function runtimeChecks(env: Record<string, string>): RuntimeStatus["checks"] {
  return {
    databaseUrl: Boolean(env.AGENT_BOARD_LEDGER_DATABASE_URL || env.DATABASE_URL || env.ledgerDatabaseUrl),
    ledgerAdminToken: Boolean(env.AGENT_BOARD_LEDGER_ADMIN_TOKEN),
    workbenchEncryptionKey: Boolean(env.ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY),
  };
}

function writeStatus(mode: RuntimeStatus["mode"], services: ServiceRuntime[], checks: RuntimeStatus["checks"]) {
  const status: RuntimeStatus = {
    ok: mode === "running",
    mode,
    pid: process.pid,
    sourceRepoRoot,
    runtimeRepoRoot,
    originDev: safeGitSha(sourceRepoRoot, "origin/dev"),
    runtimeHead: existsSync(runtimeRepoRoot) ? safeGitSha(runtimeRepoRoot, "HEAD") : undefined,
    updatedAt: new Date().toISOString(),
    logPath,
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      pid: service.process?.pid,
      command: service.command,
      cwd: join(runtimeRepoRoot, service.cwd),
      healthUrl: service.healthUrl,
      health: service.lastHealth,
      lastExitCode: service.lastExitCode,
      missingEnv: missingEnv(service.requiredEnv, loadRuntimeEnv(sourceRepoRoot)),
    })),
    checks,
  };
  writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
}

function readStatus(): RuntimeStatus | null {
  if (!existsSync(statusPath)) return null;
  try {
    return JSON.parse(readFileSync(statusPath, "utf8")) as RuntimeStatus;
  } catch {
    return null;
  }
}

function readPid() {
  if (!existsSync(pidPath)) return null;
  const value = Number(readFileSync(pidPath, "utf8").trim());
  return Number.isFinite(value) ? value : null;
}

async function safeOriginDevSha() {
  try {
    await run(["git", "fetch", "origin", "dev"], sourceRepoRoot);
    return safeGitSha(sourceRepoRoot, "origin/dev");
  } catch (error) {
    appendLog(`failed to fetch origin/dev: ${errorMessage(error)}`);
    return null;
  }
}

function safeGitSha(cwd: string, ref: string) {
  try {
    const result = Bun.spawnSync(["git", "rev-parse", ref], { cwd, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) return undefined;
    return new TextDecoder().decode(result.stdout).trim();
  } catch {
    return undefined;
  }
}

async function run(command: string[], cwd: string, env: Record<string, string> = process.env as Record<string, string>) {
  const result = await capture(command, cwd, env);
  appendLog(`$ (${cwd}) ${command.join(" ")}\n${redact(result.stdout)}${redact(result.stderr)}`);
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit ${result.exitCode}`);
  }
}

async function capture(command: string[], cwd: string, env: Record<string, string> = process.env as Record<string, string>) {
  const child = Bun.spawn(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function loadConfig(repoRoot: string): RuntimeConfig {
  const path = join(repoRoot, "scripts/clawhouse-local-runtime.services.json");
  if (!existsSync(path)) return defaultConfig;
  return { ...defaultConfig, ...JSON.parse(readFileSync(path, "utf8")) };
}

function readEnvFile(path: string) {
  const values: Record<string, string> = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquote(match[2]);
  }
  return values;
}

function unquote(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function missingEnv(keys: string[], env: Record<string, string>) {
  return keys.filter((key) => {
    if (key === "AGENT_BOARD_LEDGER_DATABASE_URL") {
      return !env.AGENT_BOARD_LEDGER_DATABASE_URL && !env.DATABASE_URL && !env.ledgerDatabaseUrl;
    }
    return !env[key];
  });
}

function findRepoRoot(start: string) {
  let current = resolve(start);
  while (current !== dirname(current)) {
    if (existsSync(join(current, "package.json")) && existsSync(join(current, ".git"))) return current;
    current = dirname(current);
  }
  const fallback = "/Users/Edward/Documents/clawhouse";
  if (existsSync(fallback)) return fallback;
  throw new Error("Could not locate Clawhouse repo root");
}

function currentScriptPath() {
  return new URL(import.meta.url).pathname;
}

function option(name: string) {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function processIsAlive(pid: number | undefined | null) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function rmIfExists(path: string) {
  if (existsSync(path)) rmSync(path, { force: true });
}

function appendLog(message: string) {
  mkdirSync(stateDir, { recursive: true });
  appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
}

function redact(value: string) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]")
    .replace(/((?:TOKEN|SECRET|PRIVATE_KEY|DATABASE_URL)[A-Z0-9_]*=)[^\s]+/g, "$1[redacted]");
}

function hasFatalReadinessGap(status: RuntimeStatus) {
  if (status.mode !== "degraded") return false;
  if (!status.checks.databaseUrl || !status.checks.ledgerAdminToken || !status.checks.workbenchEncryptionKey) return true;
  return status.services.some((service) => service.missingEnv.length > 0 && !service.pid);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
