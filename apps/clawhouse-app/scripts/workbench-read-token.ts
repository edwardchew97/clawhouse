import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { KeyPairSigner, type KeyPairString } from "near-api-js";

type Options = {
  appUrl: string;
  boardId: string;
  holderAccountId: string;
  networkId: string;
  privateKey?: KeyPairString;
};

type ChallengeResponse = {
  ok: boolean;
  challenge: {
    challenge: string;
    message: string;
    recipient: string;
    nonce: string;
  };
};

async function main() {
  const options = await parseArgs(process.argv.slice(2));
  const signer = KeyPairSigner.fromSecretKey(await readPrivateKey(options));
  const challenge = await requestJson<ChallengeResponse>(options.appUrl, "/api/backend/read-token/nonce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      boardId: options.boardId,
      holderAccountId: options.holderAccountId,
    }),
  });
  const signed = await signer.signNep413Message(options.holderAccountId, {
    message: challenge.challenge.message,
    recipient: challenge.challenge.recipient,
    nonce: new Uint8Array(Buffer.from(challenge.challenge.nonce, "base64url")),
  });
  const response = await requestJson<Record<string, unknown>>(options.appUrl, "/api/backend/read-token", {
    method: "POST",
    headers: { "content-type": "application/json", "x-clawhouse-client": "script" },
    body: JSON.stringify({
      challenge: challenge.challenge.challenge,
      signedMessage: {
        accountId: signed.accountId,
        publicKey: signed.publicKey.toString(),
        signature: Buffer.from(signed.signature).toString("base64url"),
      },
    }),
  });

  printJson({
    ok: true,
    appUrl: options.appUrl,
    boardId: options.boardId,
    holderAccountId: options.holderAccountId,
    readToken: response.readToken,
    expiresAt: response.expiresAt,
    access: response.access,
  });
}

async function parseArgs(args: string[]): Promise<Options> {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    values[key] = value;
    index += 1;
  }

  return {
    appUrl: ensureNoTrailingSlash(values["app-url"] ?? process.env.clawhouseAppBaseUrl ?? "http://127.0.0.1:3000"),
    boardId: values["board-id"] ?? process.env.ledgerBoardId ?? "",
    holderAccountId: values["holder-account-id"] ?? process.env.testUserAccountId ?? process.env.ACCOUNT_ID ?? "",
    networkId: values["network-id"] ?? process.env.NEAR_NETWORK_ID ?? process.env.nearNetworkId ?? "testnet",
    privateKey: (values["private-key"] ?? process.env.NEAR_PRIVATE_KEY ?? process.env.testUserPrivateKey) as KeyPairString | undefined,
  };
}

async function readPrivateKey(options: Options): Promise<KeyPairString> {
  if (!options.boardId) throw new Error("Missing --board-id");
  if (!options.holderAccountId) throw new Error("Missing --holder-account-id");
  if (options.privateKey) return options.privateKey;

  const credentialPath = `${homedir()}/.near-credentials/${options.networkId}/${options.holderAccountId}.json`;
  const raw = await readFile(credentialPath, "utf8").catch(() => {
    throw new Error(`Missing NEAR_PRIVATE_KEY/testUserPrivateKey and could not read ${credentialPath}`);
  });
  const credential = JSON.parse(raw) as {
    private_key?: string;
    privateKey?: string;
  };
  const privateKey = credential.private_key ?? credential.privateKey;
  if (!privateKey) throw new Error(`No private key found in ${credentialPath}`);
  return privateKey as KeyPairString;
}

async function requestJson<T>(baseUrl: string, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) as T & { ok?: boolean; error?: string } : null;
  if (!response.ok || json?.ok === false) {
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${text}`);
  }
  return json as T;
}

function ensureNoTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
