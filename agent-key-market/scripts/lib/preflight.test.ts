import { describe, expect, test } from "bun:test";
import { ContractPreflightError, preflightKeyMarketContract } from "./preflight";

const input = {
  rpcUrl: "https://rpc.testnet.fastnear.com",
  contractId: "clawhouse-key.testnet",
  preflightMethod: "get_agent",
  missingAgentId: "missing-agent",
};

describe("key-market contract preflight", () => {
  test("passes when account, code, and get_agent(null) are available", async () => {
    const result = await preflightKeyMarketContract(mockRpc([
      { result: { amount: "1" } },
      { result: { code_base64: "AGFzbQ==" } },
      { result: { result: jsonBytes(null) } },
    ]), input);

    expect(result).toEqual({
      ok: true,
      contract_id: input.contractId,
      preflight_method: input.preflightMethod,
      missing_agent_result: null,
    });
  });

  test("classifies missing contract account", async () => {
    await expect(preflightKeyMarketContract(mockRpc([
      { error: { cause: { name: "UNKNOWN_ACCOUNT" } } },
    ]), input)).rejects.toMatchObject({ code: "CONTRACT_ACCOUNT_NOT_FOUND" });
  });

  test("keeps transient account lookup errors as RPC errors", async () => {
    await expect(preflightKeyMarketContract(mockRpc([
      { error: { cause: { name: "RATE_LIMITED" }, message: "Too many requests" } },
    ]), input)).rejects.toMatchObject({ code: "RPC_ERROR" });
  });

  test("classifies missing contract code", async () => {
    await expect(preflightKeyMarketContract(mockRpc([
      { result: { amount: "1" } },
      { result: {} },
    ]), input)).rejects.toMatchObject({ code: "CONTRACT_CODE_MISSING" });
  });

  test("classifies RPC contract-code errors", async () => {
    await expect(preflightKeyMarketContract(mockRpc([
      { result: { amount: "1" } },
      { error: { cause: { name: "NO_CONTRACT_CODE" } } },
    ]), input)).rejects.toMatchObject({ code: "CONTRACT_CODE_MISSING" });
  });

  test("classifies unavailable preflight method", async () => {
    await expect(preflightKeyMarketContract(mockRpc([
      { result: { amount: "1" } },
      { result: { code_base64: "AGFzbQ==" } },
      { error: { cause: { name: "METHOD_NOT_FOUND" } } },
    ]), input)).rejects.toMatchObject({ code: "CONTRACT_METHOD_UNAVAILABLE" });
  });

  test("keeps transient preflight method errors as RPC errors", async () => {
    await expect(preflightKeyMarketContract(mockRpc([
      { result: { amount: "1" } },
      { result: { code_base64: "AGFzbQ==" } },
      { error: { cause: { name: "TIMEOUT" }, message: "Gateway timeout" } },
    ]), input)).rejects.toMatchObject({ code: "RPC_ERROR" });
  });

  test("rejects non-null missing-agent preflight results", async () => {
    await expect(preflightKeyMarketContract(mockRpc([
      { result: { amount: "1" } },
      { result: { code_base64: "AGFzbQ==" } },
      { result: { result: jsonBytes({ agent_id: input.missingAgentId }) } },
    ]), input)).rejects.toBeInstanceOf(ContractPreflightError);
  });
});

function mockRpc(responses: Array<Record<string, unknown>>) {
  let index = 0;
  return async (_request: string | URL | Request, _init?: RequestInit) => {
    const payload = responses[index++] ?? { error: { name: "UNEXPECTED_CALL" } };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function jsonBytes(value: unknown) {
  return [...Buffer.from(JSON.stringify(value), "utf8")];
}
