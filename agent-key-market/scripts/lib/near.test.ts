import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extractTransactionHash, formatTransactionResult, readEnv, readPrivateKey } from "./near";

const contracts = JSON.parse(
  readFileSync(resolve(import.meta.dir, "../../../apps/clawhouse-app/config/public-onboarding-contracts.json"), "utf8"),
) as {
  environments: {
    testnet: {
      network_id: string;
      rpc_url: string;
    };
  };
};

describe("transaction hash formatting", () => {
  test("reads the hash from the signed transaction view", () => {
    expect(
      extractTransactionHash({
        transaction: { hash: "tx-from-transaction" },
        transaction_outcome: { id: "tx-from-outcome" },
      }),
    ).toBe("tx-from-transaction");
  });

  test("falls back to the transaction outcome id", () => {
    expect(
      extractTransactionHash({
        transaction_outcome: { id: "tx-from-outcome" },
      }),
    ).toBe("tx-from-outcome");
  });

  test("supports flat hash fields from runner-compatible responses", () => {
    expect(extractTransactionHash({ transaction_hash: "flat-tx" })).toBe("flat-tx");
    expect(extractTransactionHash({ txHash: "camel-tx" })).toBe("camel-tx");
    expect(extractTransactionHash({ hash: "hash-tx" })).toBe("hash-tx");
  });

  test("fails loudly instead of returning an empty txHash", () => {
    expect(() => formatTransactionResult("buy_key", { status: {} })).toThrow(
      "Transaction completed, but NEAR did not return a transaction hash",
    );
  });
});

describe("operation key file loading", () => {
  test("defaults to the public onboarding testnet RPC", () => {
    const previousContractId = process.env.CONTRACT_ID;
    const previousAccountId = process.env.ACCOUNT_ID;
    const previousNetworkId = process.env.NEAR_NETWORK_ID;
    const previousNodeUrl = process.env.NEAR_NODE_URL;

    try {
      process.env.CONTRACT_ID = "contract.testnet";
      process.env.ACCOUNT_ID = "agent.testnet";
      delete process.env.NEAR_NETWORK_ID;
      delete process.env.NEAR_NODE_URL;

      expect(readEnv()).toMatchObject({
        networkId: contracts.environments.testnet.network_id,
        nodeUrl: contracts.environments.testnet.rpc_url,
        contractId: "contract.testnet",
        accountId: "agent.testnet",
      });
    } finally {
      restoreEnv("CONTRACT_ID", previousContractId);
      restoreEnv("ACCOUNT_ID", previousAccountId);
      restoreEnv("NEAR_NETWORK_ID", previousNetworkId);
      restoreEnv("NEAR_NODE_URL", previousNodeUrl);
    }
  });

  test("requires an explicit RPC for unsupported networks", () => {
    const previousContractId = process.env.CONTRACT_ID;
    const previousAccountId = process.env.ACCOUNT_ID;
    const previousNetworkId = process.env.NEAR_NETWORK_ID;
    const previousNodeUrl = process.env.NEAR_NODE_URL;

    try {
      process.env.CONTRACT_ID = "contract.sandbox";
      process.env.ACCOUNT_ID = "agent.sandbox";
      process.env.NEAR_NETWORK_ID = "sandbox";
      delete process.env.NEAR_NODE_URL;

      expect(() => readEnv()).toThrow("Unsupported NEAR_NETWORK_ID sandbox");
    } finally {
      restoreEnv("CONTRACT_ID", previousContractId);
      restoreEnv("ACCOUNT_ID", previousAccountId);
      restoreEnv("NEAR_NETWORK_ID", previousNetworkId);
      restoreEnv("NEAR_NODE_URL", previousNodeUrl);
    }
  });

  test("reads a ClawHouse operation key file", async () => {
    const previousKeyFile = process.env.CLAWHOUSE_OPERATION_KEY_FILE;
    const dir = await mkdtemp(join(tmpdir(), "clawhouse-operation-key-"));
    const keyFile = join(dir, "operation-key.json");

    try {
      await writeFile(
        keyFile,
        JSON.stringify({
          account_id: "agent.testnet",
          private_key: "ed25519:operation-key",
        }),
      );
      process.env.CLAWHOUSE_OPERATION_KEY_FILE = keyFile;

      await expect(
        readPrivateKey({
          networkId: "testnet",
          nodeUrl: "https://rpc.testnet.near.org",
          contractId: "contract.testnet",
          accountId: "agent.testnet",
        }),
      ).resolves.toBe("ed25519:operation-key");
    } finally {
      if (previousKeyFile === undefined) {
        delete process.env.CLAWHOUSE_OPERATION_KEY_FILE;
      } else {
        process.env.CLAWHOUSE_OPERATION_KEY_FILE = previousKeyFile;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects an operation key file for a different account", async () => {
    const previousKeyFile = process.env.CLAWHOUSE_OPERATION_KEY_FILE;
    const dir = await mkdtemp(join(tmpdir(), "clawhouse-operation-key-"));
    const keyFile = join(dir, "operation-key.json");

    try {
      await writeFile(
        keyFile,
        JSON.stringify({
          account_id: "agent.testnet",
          private_key: "ed25519:operation-key",
        }),
      );
      process.env.CLAWHOUSE_OPERATION_KEY_FILE = keyFile;

      await expect(
        readPrivateKey({
          networkId: "testnet",
          nodeUrl: "https://rpc.testnet.near.org",
          contractId: "contract.testnet",
          accountId: "other.testnet",
        }),
      ).rejects.toThrow(
        "Operation key file account_id agent.testnet does not match ACCOUNT_ID other.testnet",
      );
    } finally {
      if (previousKeyFile === undefined) {
        delete process.env.CLAWHOUSE_OPERATION_KEY_FILE;
      } else {
        process.env.CLAWHOUSE_OPERATION_KEY_FILE = previousKeyFile;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
