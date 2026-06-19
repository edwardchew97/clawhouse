import { createHash } from "node:crypto";
import { PublicKey } from "@near-js/crypto";

export const AUTH_DOMAIN = "clawhouse.agent-board-ledger.v0";
export const AUTH_VERSION = 1;
export const AUTH_FRESHNESS_MS = 5 * 60 * 1000;

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

export type SignedHeaders = {
  walletAddress: string;
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
