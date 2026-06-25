import {
  Account,
  JsonRpcProvider,
  getTransactionLastResult,
  nearToYocto,
  teraToGas,
  yoctoToNear,
  type KeyPairString,
} from "near-api-js";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

const DEFAULT_TGAS = "100";
const DEFAULT_RPC_URLS: Record<string, string> = {
  mainnet: "https://rpc.mainnet.fastnear.com",
  testnet: "https://rpc.testnet.fastnear.com",
};

export type Env = {
  networkId: string;
  nodeUrl: string;
  contractId: string;
  accountId: string;
};

export function readEnv(): Env {
  const networkId = firstEnv(["NEAR_NETWORK_ID", "nearNetworkId"]) ?? "testnet";
  const nodeUrl = firstEnv(["NEAR_NODE_URL", "nearRpcUrl"]) ?? DEFAULT_RPC_URLS[networkId];
  if (!nodeUrl) {
    throw new Error(`Unsupported NEAR_NETWORK_ID ${networkId}; set NEAR_NODE_URL explicitly`);
  }
  const contractId = requiredEnv(["CONTRACT_ID", "contractId"]);
  const accountId = requiredEnv([
    "ACCOUNT_ID",
    "NEAR_ACCOUNT_ID",
    "testUserAccountId",
    "accountId",
  ]);

  return { networkId, nodeUrl, contractId, accountId };
}

export async function getAccount(env = readEnv()) {
  const provider = new JsonRpcProvider({ url: env.nodeUrl });
  const privateKey = await readPrivateKey(env);

  return new Account(env.accountId, provider, privateKey);
}

export async function callFunction(
  methodName: string,
  args: Record<string, unknown>,
  attachedDepositYocto = "0",
) {
  const env = readEnv();
  const account = await getAccount(env);
  return account.callFunctionRaw({
    contractId: env.contractId,
    methodName,
    args,
    gas: teraToGas((process.env.NEAR_TGAS ?? DEFAULT_TGAS) as `${number}`),
    deposit: attachedDepositYocto,
  });
}

export async function viewFunction<T>(
  methodName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const env = readEnv();
  const provider = new JsonRpcProvider({ url: env.nodeUrl });
  const result = await provider.callFunction({
    contractId: env.contractId,
    method: methodName,
    args,
  });
  return result as T;
}

export function parseNearAmount(amount: string): string {
  return nearToYocto(amount as `${number}`).toString();
}

export function formatQuote<T extends Record<string, unknown>>(quote: T) {
  return {
    ...quote,
    price_near: toNearString(quote.price),
    protocol_fee_near: toNearString(quote.protocol_fee),
    creator_fee_near: toNearString(quote.creator_fee),
    total_cost_near: toNearString(quote.total_cost),
    payout_near: toNearString(quote.payout),
  };
}

export function formatTransactionResult(
  methodName: string,
  raw: unknown,
  extra: Record<string, unknown> = {},
) {
  const txHash = extractTransactionHash(raw);
  if (!txHash) {
    throw new Error("Transaction completed, but NEAR did not return a transaction hash");
  }

  return {
    ok: true,
    methodName,
    txHash,
    result: getTransactionLastResult(raw as never),
    raw,
    ...extra,
  };
}

export function extractTransactionHash(raw: unknown): string {
  const response = asRecord(raw);
  return firstString([
    asRecord(response.transaction).hash,
    asRecord(response.transaction_outcome).id,
    response.transaction_hash,
    response.txHash,
    response.hash,
  ]);
}

export function requiredArg(name: string, index: number): string {
  const value = process.argv[index];
  if (!value) {
    throw new Error(`Missing argument: ${name}`);
  }
  return value;
}

export function printJson(value: unknown) {
  console.log(
    JSON.stringify(
      value,
      (_key, nestedValue) =>
        typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
      2,
    ),
  );
}

function requiredEnv(names: string[]): string {
  const value = firstEnv(names);
  if (!value) {
    throw new Error(`Missing env var: ${names.join(" or ")}`);
  }
  return value;
}

export async function readPrivateKey(env: Env): Promise<KeyPairString> {
  const operationKeyFile = firstEnv([
    "CLAWHOUSE_OPERATION_KEY_FILE",
    "NEAR_KEY_FILE",
    "keyFile",
  ]);
  if (operationKeyFile) {
    const keyFile = resolveLocalPath(operationKeyFile);
    const raw = await readFile(keyFile, "utf8").catch(() => {
      throw new Error(`Missing operation key file: ${keyFile}`);
    });
    const credential = JSON.parse(raw) as {
      account_id?: string;
      accountId?: string;
      private_key?: string;
      privateKey?: string;
    };
    const accountId = credential.account_id ?? credential.accountId;
    if (accountId && accountId !== env.accountId) {
      throw new Error(
        `Operation key file account_id ${accountId} does not match ACCOUNT_ID ${env.accountId}`,
      );
    }
    const privateKey = credential.private_key ?? credential.privateKey;
    if (!privateKey) {
      throw new Error(`No private key found in operation key file: ${keyFile}`);
    }

    return privateKey as KeyPairString;
  }

  const privateKeyFromEnv = firstEnv(["NEAR_PRIVATE_KEY", "testUserPrivateKey"]);
  if (privateKeyFromEnv) {
    return privateKeyFromEnv as KeyPairString;
  }

  const credentialPath = `${homedir()}/.near-credentials/${env.networkId}/${env.accountId}.json`;
  const raw = await readFile(credentialPath, "utf8").catch(() => {
    throw new Error(
      `Missing NEAR_PRIVATE_KEY and could not read ${credentialPath}`,
    );
  });
  const credential = JSON.parse(raw) as {
    private_key?: string;
    privateKey?: string;
  };
  const privateKey = credential.private_key ?? credential.privateKey;
  if (!privateKey) {
    throw new Error(`No private key found in ${credentialPath}`);
  }

  return privateKey as KeyPairString;
}

function resolveLocalPath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function toNearString(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return "";
  return yoctoToNear(BigInt(value));
}
