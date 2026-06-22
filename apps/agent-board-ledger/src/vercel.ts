import { ADMIN_TOKEN_ENV, tokensMatch } from "./auth.js";
import { openRuntimeLedgerDb, type LedgerDb } from "./db.js";
import { createApp } from "./server.js";

export const CRON_SECRET_ENV = "CRON_SECRET";

type RuntimeEnv = Record<string, string | undefined>;

type HandlerOptions = {
  db?: LedgerDb;
  env?: RuntimeEnv;
  rpcFetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

export async function handleVercelLedgerRequest(request: Request, options: HandlerOptions = {}) {
  const env = options.env ?? process.env;
  const prepared = prepareVercelLedgerRequest(request, env);
  if (prepared instanceof Response) return prepared;

  const ownsDb = !options.db;
  const db = options.db ?? await openRuntimeLedgerDb(env);

  try {
    const app = createApp({
      db,
      adminToken: env[ADMIN_TOKEN_ENV],
      env,
      rpcFetch: options.rpcFetch,
    });
    return await app.fetch(prepared);
  } finally {
    if (ownsDb) await db.close();
  }
}

export function prepareVercelLedgerRequest(request: Request, env: RuntimeEnv = process.env) {
  const url = normalizeVercelLedgerUrl(request.url);

  if (request.method.toUpperCase() === "GET" && url.pathname === "/cron/tick") {
    return prepareCronTickRequest(request, url, env);
  }

  if (url.toString() === request.url) return request;
  return cloneRequestWithUrl(request, url);
}

export function normalizeVercelLedgerUrl(input: string | URL) {
  const url = new URL(input);
  const ledgerPath = url.searchParams.get("ledgerPath");

  if (ledgerPath) {
    url.pathname = ledgerPath.startsWith("/") ? ledgerPath : `/${ledgerPath}`;
    url.searchParams.delete("ledgerPath");
  } else if (url.pathname === "/api/cron") {
    url.pathname = "/cron/tick";
  } else if (url.pathname === "/api") {
    url.pathname = "/";
  } else if (url.pathname.startsWith("/api/")) {
    url.pathname = url.pathname.slice("/api".length);
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url;
}

function prepareCronTickRequest(request: Request, url: URL, env: RuntimeEnv) {
  const cronSecret = env[CRON_SECRET_ENV]?.trim();
  const authorization = request.headers.get("authorization")?.trim();
  const bearerToken = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : "";
  if (!cronSecret || !bearerToken || !tokensMatch(bearerToken, cronSecret)) {
    return json({ ok: false, error: "Unauthorized cron request" }, 401);
  }

  const adminToken = env[ADMIN_TOKEN_ENV]?.trim();
  if (!adminToken) {
    return json({ ok: false, error: `${ADMIN_TOKEN_ENV} is not configured` }, 500);
  }

  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${adminToken}`);
  headers.set("content-type", "application/json");

  return new Request(url.toString(), {
    method: "POST",
    headers,
    body: "{}",
  });
}

function cloneRequestWithUrl(request: Request, url: URL) {
  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
  };

  if (request.method.toUpperCase() !== "GET" && request.method.toUpperCase() !== "HEAD") {
    init.body = request.body;
    (init as RequestInit & { duplex: "half" }).duplex = "half";
  }

  return new Request(url.toString(), init);
}

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
