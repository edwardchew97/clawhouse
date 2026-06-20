import { NextResponse } from "next/server";

const defaultBackendBaseUrl = "https://clawhouse-backend-staging.vercel.app";
const defaultBoardId = "terminal_chad6";

type BackendFetchOptions = {
  headers?: HeadersInit;
};

export function getBackendConfig() {
  const baseUrl = trimTrailingSlash(
    firstEnv([
      "CLAWHOUSE_AGENT_API_BASE_URL",
      "CLAWHOUSE_LEDGER_BASE_URL",
      "NEXT_PUBLIC_CLAWHOUSE_AGENT_API_BASE_URL",
    ]) ?? defaultBackendBaseUrl,
  );

  return {
    baseUrl,
    defaultBoardId: firstEnv(["CLAWHOUSE_DEFAULT_LEDGER_BOARD_ID"]) ?? defaultBoardId,
    readToken: firstEnv(["CLAWHOUSE_LEDGER_READ_TOKEN"]),
  };
}

export function publicBackendConfig() {
  const { baseUrl, defaultBoardId } = getBackendConfig();
  return {
    baseUrl,
    defaultBoardId,
    environment: backendEnvironment(baseUrl),
  };
}

export function requireBoardId(value: string | null) {
  if (!value || !/^[a-zA-Z0-9_.:-]{3,96}$/.test(value)) {
    throw new BackendInputError("Invalid boardId");
  }
  return value;
}

export async function fetchBackendJson<T>(path: string, options: BackendFetchOptions = {}) {
  const { baseUrl, readToken } = getBackendConfig();
  const headers = new Headers(options.headers);
  if (readToken && !headers.has("x-clawhouse-read-token")) {
    headers.set("x-clawhouse-read-token", readToken);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    cache: "no-store",
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new BackendHttpError(response.status, errorFromBody(body) ?? `Backend request failed: ${response.status}`);
  }
  return body as T;
}

export function backendError(error: unknown) {
  if (error instanceof BackendInputError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  if (error instanceof BackendHttpError) {
    return NextResponse.json({ ok: false, error: error.message, status: error.status }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unknown backend error";
  return NextResponse.json({ ok: false, error: message }, { status: 502 });
}

class BackendInputError extends Error {}

class BackendHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function backendEnvironment(baseUrl: string) {
  const normalized = baseUrl.toLowerCase();
  if (normalized.includes("staging")) return "staging";
  if (normalized.includes("prod") || normalized.includes("production")) return "production";
  return "custom";
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function errorFromBody(body: unknown) {
  if (body && typeof body === "object" && "error" in body) {
    const value = (body as { error?: unknown }).error;
    return typeof value === "string" ? value : null;
  }
  return null;
}
