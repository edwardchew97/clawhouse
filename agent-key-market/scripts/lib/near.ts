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

const DEFAULT_TGAS = "100";

export type Env = {
  networkId: string;
  nodeUrl: string;
  contractId: string;
  accountId: string;
};

export function readEnv(): Env {
  const networkId = firstEnv(["NEAR_NETWORK_ID", "nearNetworkId"]) ?? "testnet";
  const nodeUrl =
    firstEnv(["NEAR_NODE_URL", "nearRpcUrl"]) ??
    `https://rpc.${networkId}.near.org`;
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
  return account.callFunction({
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
  const response = raw as {
    transaction?: { hash?: string };
    transaction_outcome?: { id?: string };
  };

  return {
    ok: true,
    methodName,
    txHash: response.transaction?.hash ?? response.transaction_outcome?.id ?? "",
    result: getTransactionLastResult(raw as never),
    raw,
    ...extra,
  };
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

async function readPrivateKey(env: Env): Promise<KeyPairString> {
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

function firstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function toNearString(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return "";
  return yoctoToNear(BigInt(value));
}
