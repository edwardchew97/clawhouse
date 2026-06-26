import { describe, expect, test } from "bun:test";
import { nearBlocksTxUrl, shortAccount, shortHash } from "../app/lib/format";
import { agentSelectionKey, errorMessage, firstRejectedMessage, normalizedAmount } from "../app/lib/key-market-utils";
import { initialChainState, mergeChainState } from "../app/store/key-market-store";

describe("format helpers", () => {
  test("shortAccount truncates only long ids", () => {
    expect(shortAccount("alice.testnet")).toBe("alice.testnet");
    expect(shortAccount("a-very-long-account-name.testnet")).toBe("a-very-lon...testnet");
  });

  test("shortHash keeps head and tail", () => {
    expect(shortHash("abcdef1234567890")).toBe("abcdef...7890");
  });

  test("nearBlocksTxUrl picks host by network and returns null for empty hash", () => {
    expect(nearBlocksTxUrl("", "testnet")).toBeNull();
    expect(nearBlocksTxUrl("0xabc", "testnet")).toBe("https://testnet.nearblocks.io/txns/0xabc");
    expect(nearBlocksTxUrl("0xabc", "mainnet")).toBe("https://nearblocks.io/txns/0xabc");
  });
});

describe("key-market utils", () => {
  test("agentSelectionKey prefers boardId", () => {
    expect(agentSelectionKey({ id: "a", name: "A" })).toBe("a");
    expect(agentSelectionKey({ id: "a", name: "A", boardId: "board-1" })).toBe("board-1");
  });

  test("normalizedAmount coerces invalid input to 1", () => {
    expect(normalizedAmount(" 12 ")).toBe("12");
    expect(normalizedAmount("0")).toBe("1");
    expect(normalizedAmount("abc")).toBe("1");
    expect(normalizedAmount("9999999")).toBe("1"); // 7 digits, out of range
  });

  test("errorMessage and firstRejectedMessage surface messages", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(errorMessage("nope", "fallback")).toBe("fallback");
    const results: PromiseSettledResult<unknown>[] = [
      { status: "fulfilled", value: 1 },
      { status: "rejected", reason: new Error("rejected-1") },
    ];
    expect(firstRejectedMessage(results)).toBe("rejected-1");
    expect(firstRejectedMessage([{ status: "fulfilled", value: 1 }])).toBeNull();
  });
});

describe("mergeChainState mirrors legacy setChainState loading-clears", () => {
  test("arrival of a data field forces its matching loading flag false", () => {
    const loading = { ...initialChainState, stateLoading: true, quoteLoading: true };
    const merged = mergeChainState(loading, { state: { holder_balance: "0" } });
    expect(merged.stateLoading).toBe(false); // implicitly cleared
    expect(merged.quoteLoading).toBe(true); // untouched
    expect(merged.state).toEqual({ holder_balance: "0" });
  });

  test("readAccessError also clears readAccessLoading", () => {
    const loading = { ...initialChainState, readAccessLoading: true };
    expect(mergeChainState(loading, { readAccessError: "denied" }).readAccessLoading).toBe(false);
    expect(mergeChainState(loading, { readAccess: null }).readAccessLoading).toBe(false);
  });

  test("explicit caller values win over implicit clears", () => {
    const merged = mergeChainState(initialChainState, { backend: {}, backendLoading: true });
    expect(merged.backendLoading).toBe(true);
  });
});
