import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { keyMarketConfig } from "../src/key-market";

const contracts = JSON.parse(
  readFileSync(resolve(import.meta.dir, "../../clawhouse-app/config/public-onboarding-contracts.json"), "utf8"),
) as {
  environments: {
    testnet: {
      network_id: string;
      rpc_url: string;
      key_market: { contract_id: string };
    };
  };
};

describe("key-market public contract config", () => {
  test("uses the shared public onboarding contract defaults", () => {
    expect(keyMarketConfig({})).toMatchObject({
      networkId: contracts.environments.testnet.network_id,
      rpcUrl: contracts.environments.testnet.rpc_url,
      contractId: contracts.environments.testnet.key_market.contract_id,
    });
  });
});
