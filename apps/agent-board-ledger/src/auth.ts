import { createHash, timingSafeEqual } from "node:crypto";
import { PublicKey } from "@near-js/crypto";

export const AUTH_DOMAIN = "clawhouse.agent-board-ledger.v0";
export const AUTH_VERSION = 1;
export const AUTH_FRESHNESS_MS = 5 * 60 * 1000;
export const ADMIN_TOKEN_ENV = "AGENT_BOARD_LEDGER_ADMIN_TOKEN";

export type CanonicalAuthPayload = {
  domain: typeof AUTH_DOMAIN;
  version: typeof AUTH_VERSION;
  method: string;
  path: string;
  bodyHash: string;
  timestamp: string;
  nonce: string;
  boardId: string;
  agentId: string;
  walletAddress: string;
};

export type CanonicalAgentAuthPayload = {
  domain: typeof AUTH_DOMAIN;
  version: typeof AUTH_VERSION;
  purpose: "agent_registration" | "board_registration" | "paper_account_registration";
  method: string;
  path: string;
  bodyHash: string;
  timestamp: string;
  nonce: string;
  agentId: string;
  agentPublicKey: string;
  boardId: string | null;
};

export type SignedHeaders = {
  walletAddress: string;
  publicKey: string;
  timestamp: string;
  nonce: string;
  bodyHash: string;
  signature: string;
};

export type AgentSignedHeaders = {
  publicKey: string;
  timestamp: string;
  nonce: string;
  bodyHash: string;
  signature: string;
};

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function readSignedHeaders(headers: Headers): SignedHeaders {
  const walletAddress = requiredHeader(headers, "x-clawhouse-wallet-address");
  const publicKey = requiredHeader(headers, "x-clawhouse-public-key");
  const timestamp = requiredHeader(headers, "x-clawhouse-timestamp");
  const nonce = requiredHeader(headers, "x-clawhouse-nonce");
  const bodyHash = requiredHeader(headers, "x-clawhouse-body-sha256").toLowerCase();
  const signature = requiredHeader(headers, "x-clawhouse-signature");

  return { walletAddress, publicKey, timestamp, nonce, bodyHash, signature };
}

export function readAgentSignedHeaders(headers: Headers): AgentSignedHeaders {
  const publicKey = requiredHeader(headers, "x-clawhouse-agent-public-key");
  const timestamp = requiredHeader(headers, "x-clawhouse-agent-timestamp");
  const nonce = requiredHeader(headers, "x-clawhouse-agent-nonce");
  const bodyHash = requiredHeader(headers, "x-clawhouse-agent-body-sha256").toLowerCase();
  const signature = requiredHeader(headers, "x-clawhouse-agent-signature");

  return { publicKey, timestamp, nonce, bodyHash, signature };
}

export function canonicalAuthPayload(input: Omit<CanonicalAuthPayload, "domain" | "version">) {
  return JSON.stringify({
    domain: AUTH_DOMAIN,
    version: AUTH_VERSION,
    method: input.method.toUpperCase(),
    path: input.path,
    bodyHash: input.bodyHash,
    timestamp: input.timestamp,
    nonce: input.nonce,
    boardId: input.boardId,
    agentId: input.agentId,
    walletAddress: input.walletAddress,
  } satisfies CanonicalAuthPayload);
}

export function canonicalAgentAuthPayload(input: Omit<CanonicalAgentAuthPayload, "domain" | "version">) {
  return JSON.stringify({
    domain: AUTH_DOMAIN,
    version: AUTH_VERSION,
    purpose: input.purpose,
    method: input.method.toUpperCase(),
    path: input.path,
    bodyHash: input.bodyHash,
    timestamp: input.timestamp,
    nonce: input.nonce,
    agentId: input.agentId,
    agentPublicKey: input.agentPublicKey,
    boardId: input.boardId,
  } satisfies CanonicalAgentAuthPayload);
}

export function verifySignature(
  publicKey: string,
  message: string,
  signatureBase64Url: string,
) {
  try {
    return PublicKey.fromString(publicKey).verify(
      new TextEncoder().encode(message),
      Buffer.from(signatureBase64Url, "base64url"),
    );
  } catch {
    return false;
  }
}

export function timestampIsFresh(timestamp: string, nowMs = Date.now()) {
  const parsed = Number.isFinite(Number(timestamp))
    ? Number(timestamp)
    : Date.parse(timestamp);

  if (!Number.isFinite(parsed)) return false;

  return parsed <= nowMs + 60_000 && nowMs - parsed <= AUTH_FRESHNESS_MS;
}

export function assertServiceBearer(headers: Headers, configuredToken: string | null | undefined) {
  const expected = configuredToken?.trim();
  if (!expected) {
    throw new ServiceAuthError(`${ADMIN_TOKEN_ENV} is not configured`, 500);
  }

  const authorization = headers.get("authorization")?.trim();
  if (!authorization) {
    throw new ServiceAuthError("Missing service authorization");
  }
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new ServiceAuthError("Invalid service authorization scheme");
  }

  const token = authorization.slice("bearer ".length).trim();
  if (!tokensMatch(token, expected)) {
    throw new ServiceAuthError("Invalid service authorization");
  }
}

export function tokensMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function requiredHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  if (!value || value.trim() === "") {
    throw new AuthError(`Missing ${name}`);
  }
  return value.trim();
}

export class AuthError extends Error {
  readonly status = 401;
}

export class ServiceAuthError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
  }
}
