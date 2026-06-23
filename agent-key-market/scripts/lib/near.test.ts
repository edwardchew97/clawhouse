import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractTransactionHash, formatTransactionResult, readPrivateKey } from "./near";

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
