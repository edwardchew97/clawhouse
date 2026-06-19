import {
  KeyPair,
  PublicKey,
  keyToImplicitAddress,
  type KeyPairString,
} from "@near-js/crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const LOCAL_DEV_KEYSTORE_SCHEMA =
  "clawhouse.near.local-dev-keystore.v1";

export type NearWalletPublicInfo = {
  walletAddress: string;
  publicKey: string;
  keyId: string;
  keyFile: string;
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
