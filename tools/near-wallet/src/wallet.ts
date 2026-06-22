import {
  KeyPair,
  PublicKey,
  keyToImplicitAddress,
  type KeyPairString,
} from "@near-js/crypto";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const LOCAL_DEV_KEYSTORE_SCHEMA =
  "clawhouse.near.local-dev-keystore.v1";
export const AGENT_BOARD_LEDGER_SIGNATURE_DOMAIN =
  "clawhouse.agent-board-ledger.v0";
export const AGENT_BOARD_LEDGER_SIGNATURE_VERSION = 1;

export type NearWalletPublicInfo = {
  walletAddress: string;
  publicKey: string;
  keyId: string;
  keyFile: string;
};

export type NearWalletPrivateInfo = NearWalletPublicInfo & {
  privateKey: KeyPairString;
};

type LocalDevKeyStore = {
  schema: typeof LOCAL_DEV_KEYSTORE_SCHEMA;
  account_id: string;
  public_key: string;
  private_key: KeyPairString;
  key_id: string;
};

type GenerateWalletOptions = {
  keyFile: string;
  overwrite?: boolean;
  cwd?: string;
};

type InspectWalletOptions = {
  keyFile: string;
  cwd?: string;
};

type AgentBoardLedgerRequestInput = {
  method: string;
  path: string;
  body?: string;
  bodyHash?: string;
  timestamp?: string;
  nonce?: string;
  boardId: string;
  agentId: string;
  walletAddress: string;
};

type SignAgentBoardLedgerRequestOptions = Omit<
  AgentBoardLedgerRequestInput,
  "walletAddress"
> & {
  keyFile: string;
  cwd?: string;
};

type AgentBoardLedgerAgentRequestInput = {
  method: string;
  path: string;
  body?: string;
  bodyHash?: string;
  timestamp?: string;
  nonce?: string;
  purpose: "agent_registration" | "board_registration" | "paper_account_registration";
  agentId: string;
  agentPublicKey: string;
  boardId: string | null;
};

type SignAgentBoardLedgerAgentRequestOptions = AgentBoardLedgerAgentRequestInput & {
  keyFile: string;
  cwd?: string;
};

export type AgentBoardLedgerCanonicalPayload = {
  domain: typeof AGENT_BOARD_LEDGER_SIGNATURE_DOMAIN;
  version: typeof AGENT_BOARD_LEDGER_SIGNATURE_VERSION;
  method: string;
  path: string;
  bodyHash: string;
  timestamp: string;
  nonce: string;
  boardId: string;
  agentId: string;
  walletAddress: string;
};

export type AgentBoardLedgerAgentCanonicalPayload = {
  domain: typeof AGENT_BOARD_LEDGER_SIGNATURE_DOMAIN;
  version: typeof AGENT_BOARD_LEDGER_SIGNATURE_VERSION;
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

export type SignedAgentBoardLedgerRequest = NearWalletPublicInfo &
  AgentBoardLedgerCanonicalPayload & {
    signature: string;
    headers: Record<string, string>;
  };

export type SignedAgentBoardLedgerAgentRequest = NearWalletPublicInfo &
  AgentBoardLedgerAgentCanonicalPayload & {
    signature: string;
    headers: Record<string, string>;
  };

export type VerifyAgentBoardLedgerRequestOptions = AgentBoardLedgerRequestInput & {
  publicKey: string;
  signature: string;
};

export async function generateNearWallet(
  options: GenerateWalletOptions,
): Promise<NearWalletPublicInfo> {
  const keyFile = resolveLocalKeyFilePath(options.keyFile, options.cwd);

  await prepareKeyFilePath(keyFile, options.overwrite === true);

  const keyPair = KeyPair.fromRandom("ed25519");
  const publicKey = keyPair.getPublicKey().toString();
  const publicInfo = publicInfoFromPublicKey(publicKey, keyFile);
  const keyStore: LocalDevKeyStore = {
    schema: LOCAL_DEV_KEYSTORE_SCHEMA,
    account_id: publicInfo.walletAddress,
    public_key: publicInfo.publicKey,
    private_key: keyPair.toString(),
    key_id: publicInfo.keyId,
  };

  await writeFile(keyFile, `${JSON.stringify(keyStore, null, 2)}\n`, {
    flag: options.overwrite === true ? "w" : "wx",
    mode: 0o600,
  });
  await chmod(keyFile, 0o600);

  return publicInfo;
}

export async function inspectNearWallet(
  options: InspectWalletOptions,
): Promise<NearWalletPublicInfo> {
  const keyFile = resolveLocalKeyFilePath(options.keyFile, options.cwd);
  const raw = await readFile(keyFile, "utf8");
  const keyStore = parseKeyStore(raw, keyFile);
  const publicInfo = publicInfoFromPublicKey(keyStore.public_key, keyFile);

  if (keyStore.account_id !== publicInfo.walletAddress) {
    throw new Error("Key file account_id does not match public_key");
  }
  if (keyStore.key_id !== publicInfo.keyId) {
    throw new Error("Key file key_id does not match public_key");
  }

  return publicInfo;
}

export async function inspectNearWalletPrivateInfo(
  options: InspectWalletOptions,
): Promise<NearWalletPrivateInfo> {
  const keyFile = resolveLocalKeyFilePath(options.keyFile, options.cwd);
  const raw = await readFile(keyFile, "utf8");
  const keyStore = parseKeyStore(raw, keyFile);
  const publicInfo = publicInfoFromPublicKey(keyStore.public_key, keyFile);

  if (keyStore.account_id !== publicInfo.walletAddress) {
    throw new Error("Key file account_id does not match public_key");
  }
  if (keyStore.key_id !== publicInfo.keyId) {
    throw new Error("Key file key_id does not match public_key");
  }
  const keyPair = KeyPair.fromString(keyStore.private_key);
  if (keyPair.getPublicKey().toString() !== publicInfo.publicKey) {
    throw new Error("Key file private_key does not match public_key");
  }

  return {
    ...publicInfo,
    privateKey: keyStore.private_key,
  };
}

export async function signAgentBoardLedgerRequest(
  options: SignAgentBoardLedgerRequestOptions,
): Promise<SignedAgentBoardLedgerRequest> {
  const keyFile = resolveLocalKeyFilePath(options.keyFile, options.cwd);
  const raw = await readFile(keyFile, "utf8");
  const keyStore = parseKeyStore(raw, keyFile);
  const publicInfo = publicInfoFromPublicKey(keyStore.public_key, keyFile);

  if (keyStore.account_id !== publicInfo.walletAddress) {
    throw new Error("Key file account_id does not match public_key");
  }
  if (keyStore.key_id !== publicInfo.keyId) {
    throw new Error("Key file key_id does not match public_key");
  }
  const keyPair = KeyPair.fromString(keyStore.private_key);
  if (keyPair.getPublicKey().toString() !== publicInfo.publicKey) {
    throw new Error("Key file private_key does not match public_key");
  }

  const payload = buildAgentBoardLedgerRequestPayload({
    ...options,
    walletAddress: publicInfo.walletAddress,
  });
  const message = new TextEncoder().encode(
    serializeAgentBoardLedgerRequestPayload(payload),
  );
  const signature = encodeBase64Url(keyPair.sign(message).signature);

  return {
    ...publicInfo,
    ...payload,
    signature,
    headers: {
      "x-clawhouse-wallet-address": publicInfo.walletAddress,
      "x-clawhouse-public-key": publicInfo.publicKey,
      "x-clawhouse-timestamp": payload.timestamp,
      "x-clawhouse-nonce": payload.nonce,
      "x-clawhouse-body-sha256": payload.bodyHash,
      "x-clawhouse-signature": signature,
    },
  };
}

export async function signAgentBoardLedgerAgentRequest(
  options: SignAgentBoardLedgerAgentRequestOptions,
): Promise<SignedAgentBoardLedgerAgentRequest> {
  const keyFile = resolveLocalKeyFilePath(options.keyFile, options.cwd);
  const raw = await readFile(keyFile, "utf8");
  const keyStore = parseKeyStore(raw, keyFile);
  const publicInfo = publicInfoFromPublicKey(keyStore.public_key, keyFile);

  if (publicInfo.publicKey !== options.agentPublicKey) {
    throw new Error("Agent public key does not match key file");
  }
  const keyPair = KeyPair.fromString(keyStore.private_key);
  if (keyPair.getPublicKey().toString() !== publicInfo.publicKey) {
    throw new Error("Key file private_key does not match public_key");
  }

  const payload = buildAgentBoardLedgerAgentPayload(options);
  const message = new TextEncoder().encode(
    serializeAgentBoardLedgerAgentPayload(payload),
  );
  const signature = encodeBase64Url(keyPair.sign(message).signature);

  return {
    ...publicInfo,
    ...payload,
    signature,
    headers: {
      "x-clawhouse-agent-public-key": publicInfo.publicKey,
      "x-clawhouse-agent-timestamp": payload.timestamp,
      "x-clawhouse-agent-nonce": payload.nonce,
      "x-clawhouse-agent-body-sha256": payload.bodyHash,
      "x-clawhouse-agent-signature": signature,
    },
  };
}

export function buildAgentBoardLedgerRequestPayload(
  input: AgentBoardLedgerRequestInput,
): AgentBoardLedgerCanonicalPayload {
  const bodyHash = input.bodyHash ?? hashRequestBody(input.body ?? "");

  if (!/^[0-9a-f]{64}$/.test(bodyHash)) {
    throw new Error("bodyHash must be a sha256 hex string");
  }

  return {
    domain: AGENT_BOARD_LEDGER_SIGNATURE_DOMAIN,
    version: AGENT_BOARD_LEDGER_SIGNATURE_VERSION,
    method: normalizeRequired(input.method, "method").toUpperCase(),
    path: normalizeRequired(input.path, "path"),
    bodyHash,
    timestamp: input.timestamp ?? new Date().toISOString(),
    nonce: input.nonce ?? randomUUID(),
    boardId: normalizeRequired(input.boardId, "boardId"),
    agentId: normalizeRequired(input.agentId, "agentId"),
    walletAddress: normalizeRequired(input.walletAddress, "walletAddress"),
  };
}

export function serializeAgentBoardLedgerRequestPayload(
  payload: AgentBoardLedgerCanonicalPayload,
): string {
  return JSON.stringify({
    domain: payload.domain,
    version: payload.version,
    method: payload.method,
    path: payload.path,
    bodyHash: payload.bodyHash,
    timestamp: payload.timestamp,
    nonce: payload.nonce,
    boardId: payload.boardId,
    agentId: payload.agentId,
    walletAddress: payload.walletAddress,
  });
}

export function buildAgentBoardLedgerAgentPayload(
  input: AgentBoardLedgerAgentRequestInput,
): AgentBoardLedgerAgentCanonicalPayload {
  const bodyHash = input.bodyHash ?? hashRequestBody(input.body ?? "");

  if (!/^[0-9a-f]{64}$/.test(bodyHash)) {
    throw new Error("bodyHash must be a sha256 hex string");
  }

  return {
    domain: AGENT_BOARD_LEDGER_SIGNATURE_DOMAIN,
    version: AGENT_BOARD_LEDGER_SIGNATURE_VERSION,
    purpose: input.purpose,
    method: normalizeRequired(input.method, "method").toUpperCase(),
    path: normalizeRequired(input.path, "path"),
    bodyHash,
    timestamp: input.timestamp ?? new Date().toISOString(),
    nonce: input.nonce ?? randomUUID(),
    agentId: normalizeRequired(input.agentId, "agentId"),
    agentPublicKey: normalizeRequired(input.agentPublicKey, "agentPublicKey"),
    boardId: input.boardId,
  };
}

export function serializeAgentBoardLedgerAgentPayload(
  payload: AgentBoardLedgerAgentCanonicalPayload,
): string {
  return JSON.stringify({
    domain: payload.domain,
    version: payload.version,
    purpose: payload.purpose,
    method: payload.method,
    path: payload.path,
    bodyHash: payload.bodyHash,
    timestamp: payload.timestamp,
    nonce: payload.nonce,
    agentId: payload.agentId,
    agentPublicKey: payload.agentPublicKey,
    boardId: payload.boardId,
  });
}

export function verifyAgentBoardLedgerRequestSignature(
  options: VerifyAgentBoardLedgerRequestOptions,
): boolean {
  const publicInfo = publicInfoFromPublicKey(options.publicKey, "");
  if (publicInfo.walletAddress !== options.walletAddress) {
    return false;
  }

  const payload = buildAgentBoardLedgerRequestPayload(options);
  const message = new TextEncoder().encode(
    serializeAgentBoardLedgerRequestPayload(payload),
  );
  const signature = decodeBase64Url(options.signature);

  if (!signature) {
    return false;
  }

  return PublicKey.fromString(options.publicKey).verify(message, signature);
}

export function hashRequestBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function publicInfoFromPublicKey(
  publicKey: string,
  keyFile: string,
): NearWalletPublicInfo {
  if (!publicKey.startsWith("ed25519:")) {
    throw new Error("Only ed25519 NEAR public keys are supported");
  }

  const parsedPublicKey = PublicKey.fromString(publicKey);
  const walletAddress = keyToImplicitAddress(parsedPublicKey);

  if (!/^[0-9a-f]{64}$/.test(walletAddress)) {
    throw new Error("Derived implicit account address is not valid");
  }

  return {
    walletAddress,
    publicKey: parsedPublicKey.toString(),
    keyId: `near-ed25519:${walletAddress}`,
    keyFile,
  };
}

export function resolveLocalKeyFilePath(
  keyFile: string,
  cwd = process.cwd(),
): string {
  if (!keyFile || keyFile.trim() === "") {
    throw new Error("Missing key file path");
  }
  if (keyFile === "-") {
    throw new Error("Key file path must be a local file, not stdout");
  }
  if (keyFile.includes("\0")) {
    throw new Error("Key file path must not contain NUL bytes");
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(keyFile)) {
    throw new Error("Key file path must be a local filesystem path, not a URL");
  }

  return resolve(cwd, keyFile);
}

function normalizeRequired(value: string, name: string): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    return undefined;
  }

  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return new Uint8Array(
    Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  );
}

async function prepareKeyFilePath(keyFile: string, overwrite: boolean) {
  await mkdir(dirname(keyFile), { recursive: true });

  const existing = await stat(keyFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });

  if (existing?.isDirectory()) {
    throw new Error("Key file path points to a directory");
  }
  if (existing && !overwrite) {
    throw new Error("Key file already exists; pass --overwrite to replace it");
  }
}

function parseKeyStore(raw: string, keyFile: string): LocalDevKeyStore {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  if (parsed.schema !== LOCAL_DEV_KEYSTORE_SCHEMA) {
    throw new Error(`Unsupported key file schema in ${keyFile}`);
  }
  if (typeof parsed.account_id !== "string" || parsed.account_id === "") {
    throw new Error("Key file is missing account_id");
  }
  if (typeof parsed.public_key !== "string" || parsed.public_key === "") {
    throw new Error("Key file is missing public_key");
  }
  if (typeof parsed.private_key !== "string" || parsed.private_key === "") {
    throw new Error("Key file is missing private_key");
  }
  if (typeof parsed.key_id !== "string" || parsed.key_id === "") {
    throw new Error("Key file is missing key_id");
  }

  return parsed as LocalDevKeyStore;
}
