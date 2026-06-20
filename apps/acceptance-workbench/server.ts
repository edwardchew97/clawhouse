import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";

type JsonRecord = Record<string, unknown>;

const appDir = import.meta.dir;
const repoRoot = normalize(join(appDir, "../.."));
const port = Number(Bun.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1] ?? "4317");
const flowsPath = join(appDir, "flows.json");
const envPath = join(repoRoot, ".env");
const encryptedPrefix = "enc:v1:";
const runnerTimeoutMs = 180_000;

loadDotEnv(envPath);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function text(data: string, contentType = "text/plain; charset=utf-8") {
  return new Response(data, {
    headers: { "content-type": contentType }
  });
}

async function readJson<T>(request: Request): Promise<T> {
  return await request.json() as T;
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function withoutEmptyValues(value: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")
  );
}

function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquoteEnvValue(rawValue);
  }
}

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function interpolate(value: unknown, variables: JsonRecord): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
      const trimmed = key.trim();
      const next = variables[trimmed];
      return next === undefined || next === null ? "" : String(next);
    });
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, variables));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolate(item, variables)]));
  }
  return value;
}

async function loadFlows() {
  return JSON.parse(await readFile(flowsPath, "utf8")) as JsonRecord;
}

function getEncryptionKey() {
  const raw = process.env.ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY in .env");
  }

  const encoded = raw.startsWith("base64:") ? raw.slice("base64:".length) : raw;
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY must be base64 for 32 bytes");
  }
  return key;
}

function encryptValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encryptedPrefix}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptValue(value: string) {
  if (!value.startsWith(encryptedPrefix)) {
    throw new Error("Encrypted value has an unsupported format");
  }
  const parts = value.slice(encryptedPrefix.length).split(".");
  if (parts.length !== 3) {
    throw new Error("Encrypted value is malformed");
  }
  const [ivPart, tagPart, ciphertextPart] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function hasEncryptionKey() {
  return Boolean(process.env.ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY);
}

function sanitizeSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeSecrets(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      const normalized = key.toLowerCase().replace(/[_-]/g, "");
      const sensitive = normalized.includes("privatekey")
        || normalized.includes("secret")
        || normalized.includes("token")
        || normalized.includes("apikey");
      return [key, sensitive ? "[redacted]" : sanitizeSecrets(item)];
    }));
  }
  return value;
}

function redactPrivateKeyText(value: string) {
  return value
    .replace(
      /("(?:private[_-]?key|secret[_-]?key|seed[_-]?phrase|mnemonic)"\s*:\s*")[^"]*(")/gi,
      "$1[redacted]$2"
    )
    .replace(
      /((?:private[_-]?key|secret[_-]?key|seed[_-]?phrase|mnemonic)\s*[:=]\s*)[^\s,}]+/gi,
      "$1[redacted]"
    );
}

function redactPrivateKeyOutput(value: unknown): unknown {
  if (typeof value === "string") return redactPrivateKeyText(value);
  return sanitizeSecrets(value);
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function repoRootPathViolation(values: string[]) {
  return values.find((value) => {
    if (isRequestPathArg(value)) return false;
    if (!isAbsolute(value)) return false;
    const normalized = normalize(value);
    return normalized !== repoRoot && !normalized.startsWith(`${repoRoot}/`);
  });
}

function isRequestPathArg(value: string) {
  return /^\/(?:api|boards|cron|health)(?:\/|$)/.test(value);
}

function findScriptStep(flows: JsonRecord, stepId: string): JsonRecord | null {
  const flowList = Array.isArray(flows.flows) ? flows.flows : [];
  for (const flow of flowList) {
    const steps = Array.isArray(asObject(flow).steps) ? asObject(flow).steps as unknown[] : [];
    for (const step of steps) {
      const item = asObject(step);
      if (item.id === stepId && item.type === "script") return item;
    }
  }
  return null;
}

async function runHttp(payload: JsonRecord) {
  const headers = Object.fromEntries(
    Object.entries(asObject(payload.headers)).filter(([, value]) => value !== "")
  ) as Record<string, string>;
  const init: RequestInit = {
    method: String(payload.method || "GET"),
    headers
  };
  if (!["GET", "HEAD"].includes(init.method || "GET") && payload.body !== undefined) {
    init.body = typeof payload.body === "string" ? payload.body : JSON.stringify(payload.body);
  }
  const started = Date.now();
  const timeout = timeoutSignal();
  let response: Response;
  try {
    response = await fetch(String(payload.url), { ...init, signal: timeout.signal });
  } finally {
    timeout.clear();
  }
  const bodyText = await response.text();
  let bodyJson: unknown = null;
  try {
    bodyJson = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    bodyJson = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    durationMs: Date.now() - started,
    headers: Object.fromEntries(response.headers.entries()),
    text: bodyText,
    json: bodyJson
  };
}

async function runNearView(payload: JsonRecord) {
  const args = JSON.stringify(payload.args ?? {});
  const argsBase64 = Buffer.from(args).toString("base64");
  const rpcBody = {
    jsonrpc: "2.0",
    id: `clawhouse-${Date.now()}`,
    method: "query",
    params: {
      request_type: "call_function",
      finality: "final",
      account_id: payload.contractId,
      method_name: payload.methodName,
      args_base64: argsBase64
    }
  };
  const timeout = timeoutSignal();
  let response: Response;
  try {
    response = await fetch(String(payload.rpcUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rpcBody),
      signal: timeout.signal
    });
  } finally {
    timeout.clear();
  }
  const rpcJson = await response.json() as JsonRecord;
  const result = asObject(rpcJson.result);
  const bytes = Array.isArray(result.result) ? result.result as number[] : [];
  const decoded = bytes.length ? Buffer.from(bytes).toString("utf8") : "";
  let decodedJson: unknown = null;
  try {
    decodedJson = decoded ? JSON.parse(decoded) : null;
  } catch {
    decodedJson = null;
  }
  return {
    ok: response.ok && !rpcJson.error,
    status: response.status,
    rpc: rpcJson,
    text: decoded,
    json: decodedJson
  };
}

async function runScript(payload: JsonRecord) {
  const flows = await loadFlows();
  const stepId = String(payload.stepId || "");
  const step = findScriptStep(flows, stepId);
  if (!step) {
    return {
      ok: false,
      error: `Script step is not allowlisted: ${stepId}`
    };
  }

  const payloadEnv = asObject(payload.env);
  const payloadVars = asObject(payload.vars);
  const payloadInputs = withoutEmptyValues(asObject(payload.inputs));
  const variables = {
    ...payloadEnv,
    ...payloadVars,
    ...payloadInputs,
    repoRoot
  };
  const command = String(interpolate(step.command, variables));
  const args = interpolate(step.args ?? [], variables) as string[];
  const cwd = normalize(String(interpolate(step.cwd ?? repoRoot, variables)));
  const unsafeAbsoluteArg = repoRootPathViolation(args);

  if (cwd !== repoRoot && !cwd.startsWith(`${repoRoot}/`)) {
    return {
      ok: false,
      error: `Refusing to run outside repo root: ${cwd}`
    };
  }

  if (unsafeAbsoluteArg) {
    return {
      ok: false,
      command: [command, ...args],
      cwd,
      error: `Refusing absolute script argument outside repo root: ${unsafeAbsoluteArg}`
    };
  }

  if (!existsSync(cwd)) {
    return {
      ok: false,
      command: [command, ...args],
      cwd,
      error: `Working directory does not exist: ${cwd}`
    };
  }

  const started = Date.now();
  const scriptEnv = Object.fromEntries(
    Object.entries({
      ...payloadEnv,
      ...payloadVars,
      ...payloadInputs
    }).map(([key, value]) => [key, String(value ?? "")])
  );
  const nearAccountId = String(payloadEnv.testUserAccountId || payloadEnv.accountId || "");
  const nearPrivateKey = String(payloadEnv.testUserPrivateKey || "");
  const nearNetworkId = String(payloadEnv.nearNetworkId || "testnet");
  const nearRpcUrl = String(payloadEnv.nearRpcUrl || "");
  const contractId = String(payloadEnv.contractId || "");
  const proc = Bun.spawn([command, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...scriptEnv,
      ACCOUNT_ID: nearAccountId,
      CONTRACT_ID: contractId,
      NEAR_ACCOUNT_ID: nearAccountId,
      NEAR_PRIVATE_KEY: nearPrivateKey,
      NEAR_NETWORK_ID: nearNetworkId,
      NEAR_NODE_URL: nearRpcUrl
    }
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, runnerTimeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]).finally(() => clearTimeout(timeout));
  let parsed: unknown = null;
  try {
    parsed = stdout.trim() ? JSON.parse(stdout) : null;
  } catch {
    parsed = null;
  }
  const expectedExitCode = Number.isInteger(step.expectedExitCode) ? Number(step.expectedExitCode) : 0;
  const expectedOutputIncludes = typeof step.expectedOutputIncludes === "string"
    ? step.expectedOutputIncludes
    : "";
  const exitMatched = exitCode === expectedExitCode;
  const combinedOutput = `${stdout}\n${stderr}`;
  const outputMatched = !expectedOutputIncludes
    || combinedOutput.toLowerCase().includes(expectedOutputIncludes.toLowerCase());
  const forbiddenOutputMatch = stringList(step.forbiddenOutputIncludes).find((text) => (
    combinedOutput.toLowerCase().includes(text.toLowerCase())
  ));
  const redactOutput = step.redactPrivateKeyOutput === true;
  return {
    ok: !timedOut && exitMatched && outputMatched && !forbiddenOutputMatch,
    exitCode,
    ...(step.expectedExitCode !== undefined ? { expectedExitCode } : {}),
    ...(expectedOutputIncludes ? { expectedOutputIncludes } : {}),
    ...(forbiddenOutputMatch ? { forbiddenOutputMatch } : {}),
    timedOut,
    durationMs: Date.now() - started,
    command: [command, ...args],
    cwd,
    stdout: redactOutput ? redactPrivateKeyText(stdout) : stdout,
    stderr: redactOutput ? redactPrivateKeyText(stderr) : stderr,
    error: timedOut
      ? `Script timed out after ${runnerTimeoutMs} ms`
      : !exitMatched
        ? `Script exited ${exitCode}; expected ${expectedExitCode}`
        : !outputMatched
          ? `Script output did not include expected text: ${expectedOutputIncludes}`
          : forbiddenOutputMatch ? `Script output included forbidden text: ${forbiddenOutputMatch}` : undefined,
    json: redactOutput ? redactPrivateKeyOutput(parsed) : parsed
  };
}

function timeoutSignal() {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(`Runner timed out after ${runnerTimeoutMs} ms`);
  }, runnerTimeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/") {
        return text(await readFile(join(appDir, "index.html"), "utf8"), "text/html; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/flows.json") {
        return text(await readFile(flowsPath, "utf8"), "application/json; charset=utf-8");
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          ok: true,
          repoRoot,
          flowsPath,
          encryptedEnvConfigured: hasEncryptionKey()
        });
      }
      if (request.method === "POST" && url.pathname === "/crypto/encrypt") {
        const payload = await readJson<JsonRecord>(request);
        return json({
          ok: true,
          ciphertext: encryptValue(String(payload.value || ""))
        });
      }
      if (request.method === "POST" && url.pathname === "/crypto/decrypt") {
        const payload = await readJson<JsonRecord>(request);
        return json({
          ok: true,
          value: decryptValue(String(payload.ciphertext || ""))
        });
      }
      if (request.method === "POST" && url.pathname === "/run/http") {
        return json(await runHttp(await readJson<JsonRecord>(request)));
      }
      if (request.method === "POST" && url.pathname === "/run/near-view") {
        return json(await runNearView(await readJson<JsonRecord>(request)));
      }
      if (request.method === "POST" && url.pathname === "/run/script") {
        return json(await runScript(await readJson<JsonRecord>(request)));
      }
      return json({ ok: false, error: "Not found" }, 404);
    } catch (error) {
      return json({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }, 500);
    }
  }
});

console.log(`ClawHouse Acceptance Workbench: http://127.0.0.1:${port}`);
