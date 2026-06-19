import { describe, expect, test } from "bun:test";
import { extractTransactionHash, formatTransactionResult } from "./near";

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
