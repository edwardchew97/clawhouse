import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { baseDecode } from "near-api-js";
import { boardIdPattern } from "../board-id";

const challengeMaxAgeMs = 5 * 60 * 1000;
const readTokenTtlMs = 12 * 60 * 60 * 1000;
const walletSessionTtlMs = 30 * 24 * 60 * 60 * 1000;
export const holderReadCookieName = "clawhouse_holder_read";
export const walletSessionCookieName = "clawhouse_wallet_session";

export type ReadAccessChallengePayload = {
  v: 1;
  purpose: "holder_read_access";
  boardId: string;
  holderAccountId: string;
  recipient: string;
  message: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  walletSessionExpiresAt: string;
};

export type SignedNearMessage = {
  accountId: string;
  publicKey: string;
  signature: string;
};

export type HolderReadCookiePayload = {
  v: 1;
  purpose: "holder_read_cookie";
  boardId: string;
  holderAccountId: string;
  readToken: string;
  issuedAt: string;
  expiresAt: string;
};

export type WalletSessionPayload = {
  v: 1;
  purpose: "wallet_session";
  accountId: string;
  publicKey: string;
  issuedAt: string;
  expiresAt: string;
};

export class ReadTokenInputError extends Error {}

export function createReadAccessChallenge(input: {
  boardId: string;
  holderAccountId: string;
  recipient: string;
  secret: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + challengeMaxAgeMs).toISOString();
  const walletSessionExpiresAt = new Date(now.getTime() + walletSessionTtlMs).toISOString();
  const nonce = randomBytes(32).toString("base64url");
  const message = JSON.stringify({
    domain: "clawhouse.app",
    version: "1",
    purpose: "holder_read_access",
    board_id: input.boardId,
    holder_account_id: input.holderAccountId,
    issued_at: issuedAt,
    expires_at: expiresAt,
    wallet_session_expires_at: walletSessionExpiresAt,
  });
  const payload: ReadAccessChallengePayload = {
    v: 1,
    purpose: "holder_read_access",
    boardId: input.boardId,
    holderAccountId: input.holderAccountId,
    recipient: input.recipient,
    message,
    nonce,
    issuedAt,
    expiresAt,
    walletSessionExpiresAt,
  };

  return {
    ...payload,
    challenge: signChallenge(payload, input.secret),
  };
}

export function verifyReadAccessChallenge(token: string, secret: string, now = new Date()) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new ReadTokenInputError("Invalid read-access challenge");

  const expected = hmac(encoded, secret);
  if (!safeEqual(signature, expected)) throw new ReadTokenInputError("Invalid read-access challenge");

  const payload = parseJson<ReadAccessChallengePayload>(Buffer.from(encoded, "base64url").toString("utf8"));
  if (payload.v !== 1 || payload.purpose !== "holder_read_access") {
    throw new ReadTokenInputError("Invalid read-access challenge");
  }
  if (Date.parse(payload.expiresAt) <= now.getTime()) {
    throw new ReadTokenInputError("Read-access challenge expired");
  }
  if (now.getTime() - Date.parse(payload.issuedAt) > challengeMaxAgeMs) {
    throw new ReadTokenInputError("Read-access challenge expired");
  }
  requireBoardIdValue(payload.boardId);
  requireAccountIdValue(payload.holderAccountId);
  requireNonEmpty(payload.recipient, "recipient");
  requireNonEmpty(payload.message, "message");
  if (!Number.isFinite(Date.parse(payload.walletSessionExpiresAt))) {
    throw new ReadTokenInputError("Invalid read-access challenge");
  }
  decodeNonce(payload.nonce);
  return payload;
}

export function decodeNonce(value: string) {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== 32) throw new ReadTokenInputError("Invalid nonce");
  return new Uint8Array(bytes);
}

export function decodeSignature(value: unknown) {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (typeof value !== "string") throw new ReadTokenInputError("Invalid signature");

  const encoded = value.includes(":") ? value.slice(value.indexOf(":") + 1) : value;
  const candidates = [
    () => new Uint8Array(Buffer.from(encoded, "base64url")),
    () => new Uint8Array(Buffer.from(encoded, "base64")),
    () => baseDecode(encoded),
  ];

  for (const decode of candidates) {
    try {
      const bytes = decode();
      if (bytes.length === 64 || bytes.length === 65) return bytes;
    } catch {
      // Try the next common wallet encoding.
    }
  }

  throw new ReadTokenInputError("Invalid signature");
}

export function normalizeSignedMessage(value: unknown): SignedNearMessage {
  if (!value || typeof value !== "object") throw new ReadTokenInputError("Missing signedMessage");
  const record = value as Record<string, unknown>;
  return {
    accountId: requireAccountIdValue(record.accountId),
    publicKey: requirePublicKeyValue(record.publicKey),
    signature: requireNonEmpty(record.signature, "signature"),
  };
}

export function requireBoardIdValue(value: unknown) {
  if (typeof value !== "string" || !boardIdPattern.test(value)) {
    throw new ReadTokenInputError("Invalid boardId");
  }
  return value;
}

export function requireAccountIdValue(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9._-]{2,64}$/.test(value)) {
    throw new ReadTokenInputError("Invalid holderAccountId");
  }
  return value;
}

export function requirePublicKeyValue(value: unknown) {
  const text = requireNonEmpty(value, "publicKey");
  if (!/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]+$/.test(text)) {
    throw new ReadTokenInputError("Invalid publicKey");
  }
  return text;
}

export function requireNonEmpty(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new ReadTokenInputError(`Missing ${name}`);
  return value.trim();
}

export function readAccessTokenExpiry(now = new Date()) {
  return new Date(now.getTime() + readTokenTtlMs).toISOString();
}

export function newReadToken() {
  return `clawhouse_read_${randomBytes(32).toString("base64url")}`;
}

export function createHolderReadCookie(input: {
  boardId: string;
  holderAccountId: string;
  readToken: string;
  expiresAt: string;
  secret: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const payload: HolderReadCookiePayload = {
    v: 1,
    purpose: "holder_read_cookie",
    boardId: requireBoardIdValue(input.boardId),
    holderAccountId: requireAccountIdValue(input.holderAccountId),
    readToken: requireNonEmpty(input.readToken, "readToken"),
    issuedAt: now.toISOString(),
    expiresAt: requireNonEmpty(input.expiresAt, "expiresAt"),
  };
  if (!Number.isFinite(Date.parse(payload.expiresAt))) {
    throw new ReadTokenInputError("Invalid expiresAt");
  }
  return {
    ...payload,
    cookie: signPayload(payload, input.secret),
  };
}

export function createWalletSessionCookie(input: {
  accountId: string;
  publicKey: string;
  secret: string;
  expiresAt?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const expiresAt = input.expiresAt ?? new Date(now.getTime() + walletSessionTtlMs).toISOString();
  if (!Number.isFinite(Date.parse(expiresAt))) {
    throw new ReadTokenInputError("Invalid wallet session expiry");
  }
  const payload: WalletSessionPayload = {
    v: 1,
    purpose: "wallet_session",
    accountId: requireAccountIdValue(input.accountId),
    publicKey: requirePublicKeyValue(input.publicKey),
    issuedAt: now.toISOString(),
    expiresAt,
  };
  return {
    ...payload,
    cookie: signPayload(payload, input.secret),
  };
}

export function readHolderReadCookie(request: Request, secret: string, now = new Date()) {
  const value = readCookieValue(request, holderReadCookieName);
  if (!value) return null;
  return verifyHolderReadCookie(value, secret, now);
}

export function readWalletSessionCookie(request: Request, secret: string, now = new Date()) {
  const value = readCookieValue(request, walletSessionCookieName);
  if (!value) return null;
  return verifyWalletSessionCookie(value, secret, now);
}

export function setHolderReadCookie(
  response: NextResponse,
  cookie: Pick<HolderReadCookiePayload, "expiresAt"> & { cookie: string },
) {
  response.cookies.set(holderReadCookieName, cookie.cookie, {
    ...baseCookieOptions(),
    expires: new Date(cookie.expiresAt),
  });
}

export function setWalletSessionCookie(
  response: NextResponse,
  cookie: Pick<WalletSessionPayload, "expiresAt"> & { cookie: string },
) {
  response.cookies.set(walletSessionCookieName, cookie.cookie, {
    ...baseCookieOptions(),
    expires: new Date(cookie.expiresAt),
  });
}

export function clearHolderReadCookie(response: NextResponse) {
  response.cookies.set(holderReadCookieName, "", expiredCookieOptions());
}

export function clearWalletSessionCookie(response: NextResponse) {
  response.cookies.set(walletSessionCookieName, "", expiredCookieOptions());
}

export function signingRecipient(request: Request) {
  const configured = process.env.CLAWHOUSE_READ_ACCESS_SIGNING_RECIPIENT?.trim();
  if (configured) return configured;
  return new URL(request.url).host;
}

function signChallenge(payload: ReadAccessChallengePayload, secret: string) {
  return signPayload(payload, secret);
}

function verifyHolderReadCookie(value: string, secret: string, now: Date) {
  const payload = verifySignedPayload<HolderReadCookiePayload>(value, secret);
  if (payload.v !== 1 || payload.purpose !== "holder_read_cookie") {
    throw new ReadTokenInputError("Invalid holder read cookie");
  }
  requireBoardIdValue(payload.boardId);
  requireAccountIdValue(payload.holderAccountId);
  requireNonEmpty(payload.readToken, "readToken");
  if (Date.parse(payload.expiresAt) <= now.getTime()) {
    throw new ReadTokenInputError("Holder read cookie expired");
  }
  return payload;
}

function verifyWalletSessionCookie(value: string, secret: string, now: Date) {
  const payload = verifySignedPayload<WalletSessionPayload>(value, secret);
  if (payload.v !== 1 || payload.purpose !== "wallet_session") {
    throw new ReadTokenInputError("Invalid wallet session");
  }
  requireAccountIdValue(payload.accountId);
  requirePublicKeyValue(payload.publicKey);
  if (Date.parse(payload.expiresAt) <= now.getTime()) {
    throw new ReadTokenInputError("Wallet session expired");
  }
  return payload;
}

function signPayload(payload: unknown, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${hmac(encoded, secret)}`;
}

function verifySignedPayload<T>(value: string, secret: string) {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) throw new ReadTokenInputError("Invalid signed cookie");
  const expected = hmac(encoded, secret);
  if (!safeEqual(signature, expected)) throw new ReadTokenInputError("Invalid signed cookie");
  return parseJson<T>(Buffer.from(encoded, "base64url").toString("utf8"));
}

function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function parseJson<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new ReadTokenInputError("Invalid read-access challenge");
  }
}

function readCookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== name) continue;
    const value = rawValue.join("=");
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

function expiredCookieOptions() {
  return {
    ...baseCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  };
}
