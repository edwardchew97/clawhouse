import { KeyPair } from "@near-js/crypto";
import { sha256Hex } from "./auth.js";
import { cleanString, requiredString, RequestError } from "./db.js";
import { canonicalPaperAuthPayload } from "./paper-trading.js";
import type { JsonObject } from "./types.js";

type BodyInput = {
  raw: string;
  json: unknown;
};

type LocalSigner = {
  keyPair: KeyPair;
  publicKey: string;
  agentId: string | null;
  createdAt: string;
};

const localSigners = new Map<string, LocalSigner>();
const BRUNO_GOLD_MODE_HEADER = "x-clawhouse-bruno-gold-mode";
const TEST_HELPERS_ENV = "CLAWHOUSE_TEST_ENABLE_BRUNO_HELPERS";

export function isBrunoGoldModeRequest(request: Request, url: URL, env: Record<string, string | undefined>) {
  return request.headers.get(BRUNO_GOLD_MODE_HEADER) === "true" && localBrunoHelpersAllowed(url, env);
}

export function assertBrunoGoldModeRequest(request: Request, url: URL, env: Record<string, string | undefined>) {
  if (!isBrunoGoldModeRequest(request, url, env)) {
    throw new RequestError("Bruno gold mode helpers are only available on localhost", 403);
  }
}

export function createBrunoGoldModeSigner(body: BodyInput, createdAt: string) {
  const data = asObject(body.json);
  const signerId = cleanString(data.signerId ?? data.signer_id) ?? `bruno_signer_${crypto.randomUUID()}`;
  const keyPair = KeyPair.fromRandom("ed25519");
  const publicKey = keyPair.getPublicKey().toString();
  const signer: LocalSigner = {
    keyPair,
    publicKey,
    agentId: cleanString(data.agentId ?? data.agent_id),
    createdAt,
  };

  localSigners.set(signerId, signer);

  return {
    ok: true,
    signer: {
      signer_id: signerId,
      agent_id: signer.agentId,
      agent_public_key: publicKey,
      created_at: createdAt,
      local_only: true,
    },
  };
}

export function signBrunoGoldModePaperOrder(body: BodyInput, createdAt: string) {
  const data = asObject(body.json);
  const signerId = requiredString(data.signerId ?? data.signer_id, "signer_id");
  const signer = localSigners.get(signerId);
  if (!signer) throw new RequestError("Missing local signer. Run Create Local Paper Signer first.", 400);

  const order = asObject(data.order ?? data.body);
  const method = cleanString(data.method) ?? "POST";
  const path = cleanString(data.path) ?? "/paper/orders";
  const paperAccountId = requiredString(
    data.paperAccountId ?? data.paper_account_id ?? order.paperAccountId ?? order.paper_account_id,
    "paper_account_id",
  );
  const agentId = requiredString(data.agentId ?? data.agent_id ?? signer.agentId, "agent_id");
  const rawBody = JSON.stringify(order);
  const timestamp = Date.parse(createdAt).toString();
  const nonce = crypto.randomUUID();
  const bodyHash = sha256Hex(rawBody);
  const payload = canonicalPaperAuthPayload({
    method,
    path,
    bodyHash,
    timestamp,
    nonce,
    paperAccountId,
    agentId,
  });
  const signature = signer.keyPair.sign(new TextEncoder().encode(payload)).signature;

  return {
    ok: true,
    method: method.toUpperCase(),
    path,
    body: order,
    raw_body: rawBody,
    headers: {
      "content-type": "application/json",
      "x-clawhouse-paper-account-id": paperAccountId,
      "x-clawhouse-agent-id": agentId,
      "x-clawhouse-paper-timestamp": timestamp,
      "x-clawhouse-paper-nonce": nonce,
      "x-clawhouse-paper-body-sha256": bodyHash,
      "x-clawhouse-paper-signature": Buffer.from(signature).toString("base64url"),
    },
  };
}

function localBrunoHelpersAllowed(url: URL, env: Record<string, string | undefined>) {
  if (isHostedDeployment(env)) return false;
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return true;
  return env[TEST_HELPERS_ENV] === "true";
}

function isHostedDeployment(env: Record<string, string | undefined>) {
  return env.VERCEL === "1" || Boolean(env.VERCEL_ENV) || env.NODE_ENV === "production";
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("Request body must be a JSON object", 400);
  }
  return value as JsonObject;
}
