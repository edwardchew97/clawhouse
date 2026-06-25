import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import contracts from "../config/public-onboarding-contracts.json";
import { GET as keyMarketConfigGET } from "../app/api/key-market/config/route";
import { GET } from "../app/creator-onboarding/setup/route";

const contractEnvNames = [
  "CLAWHOUSE_KEY_MARKET_ENVIRONMENT",
  "CLAWHOUSE_KEY_NEAR_NETWORK_ID",
  "KEY_NEAR_NETWORK_ID",
  "NEAR_NETWORK_ID",
  "CLAWHOUSE_KEY_NEAR_RPC_URL",
  "KEY_NEAR_RPC_URL",
  "NEAR_NODE_URL",
  "CLAWHOUSE_KEY_MARKET_CONTRACT_ID",
  "KEY_MARKET_CONTRACT_ID",
  "CONTRACT_ID",
  "CLAWHOUSE_KEY_STORAGE_DEPOSIT_NEAR",
  "STORAGE_DEPOSIT",
  "CLAWHOUSE_KEY_MARKET_GAS",
  "NEAR_TGAS_YOCTO",
];
const previousContractEnv = new Map<string, string | undefined>();

describe("creator onboarding setup route", () => {
  beforeEach(() => {
    previousContractEnv.clear();
    for (const name of contractEnvNames) {
      previousContractEnv.set(name, process.env[name]);
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of contractEnvNames) {
      const value = previousContractEnv.get(name);
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  test("defaults to staging without asking the creator to choose an environment", async () => {
    const response = GET(new Request("http://clawhouse.test/creator-onboarding/setup"));
    const payload = await response.json() as {
      intake: string[];
      requiredProfilePrompt: string[];
      environment: { required: boolean; default: string; choices: string[]; userChooses: boolean };
    };

    expect(payload.intake).not.toContain("environment");
    expect(payload.requiredProfilePrompt).not.toContain("environment");
    expect(payload.environment).toMatchObject({
      required: false,
      default: "staging",
      choices: ["staging"],
      userChooses: false,
    });
  });

  test("keeps the completion template aligned with the creator onboarding skill", async () => {
    const account = "alice.testnet";
    const response = GET(new Request(`http://clawhouse.test/creator-onboarding/setup?creatorPublicAccount=${account}`));
    const payload = await response.json() as { completion: { template: string } };
    const skill = await readFile(
      join(import.meta.dir, "../../../skills/clawhouse-creator-onboarding/SKILL.md"),
      "utf8",
    );

    expect(payload.completion.template).toBe(completionTemplateFromSkill(skill, account));
  });

  test("returns exact raw URLs for every installable skill", async () => {
    const response = GET(new Request("http://clawhouse.test/creator-onboarding/setup"));
    const payload = await response.json() as {
      install: Array<{
        tool: string;
        parameters: { name: string; url: string };
      }>;
    };

    expect(payload.install).toEqual([
      skillInstall(
        "clawhouse-skill-directory",
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-skill-directory/SKILL.md",
      ),
      skillInstall(
        "clawhouse-creator-onboarding",
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-creator-onboarding/SKILL.md",
      ),
      skillInstall(
        "sign-clawhouse-backend-request",
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/sign-clawhouse-backend-request/SKILL.md",
      ),
      skillInstall(
        "clawhouse-ledger-reporting",
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/clawhouse-ledger-reporting/SKILL.md",
      ),
      skillInstall(
        "hyperliquid-paper-trading",
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/hyperliquid-paper-trading/SKILL.md",
      ),
    ]);
  });

  test("describes Hyperliquid-supported market discovery without user API keys", async () => {
    const response = GET(new Request("http://clawhouse.test/creator-onboarding/setup"));
    const payload = await response.json() as {
      marketScope: {
        scope: string;
        userProvidesMarketList: boolean;
        userProvidesHyperliquidApiKey: boolean;
        publicInfoUrl: string;
        discovery: {
          perpsMetadataRequest: { type: string };
          spotMetadataRequest: { type: string };
        };
        perps: { maxLeverageSource: string };
        spot: { requiredMarginMode: string; requiredLeverage: number };
      };
    };

    expect(payload.marketScope).toMatchObject({
      scope: "hyperliquid_supported",
      userProvidesMarketList: false,
      userProvidesHyperliquidApiKey: false,
      publicInfoUrl: "https://api.hyperliquid.xyz/info",
      discovery: {
        perpsMetadataRequest: { type: "metaAndAssetCtxs" },
        spotMetadataRequest: { type: "spotMetaAndAssetCtxs" },
      },
      perps: {
        maxLeverageSource: "metaAndAssetCtxs[0].universe[].maxLeverage",
      },
      spot: {
        requiredMarginMode: "spot",
        requiredLeverage: 1,
      },
    });
  });

  test("returns public key-market contract config from the shared source", async () => {
    const account = "alice.testnet";
    const response = GET(new Request(`http://clawhouse.test/creator-onboarding/setup?creatorPublicAccount=${account}`));
    const payload = await response.json() as {
      contracts: { source: string; publicKitUrl: string; config: typeof contracts };
      keyMarketSetup: {
        environment: string;
        networkId: string;
        rpcUrl: string;
        contractId: string;
        fundingAmountNear: string;
        storageDepositNear: string;
        fundingNetwork: string;
        createMethod: string;
        preflightMethod: string;
        stateReadMethod: string;
        gasTgas: string;
        gas: string;
        methodArgs: {
          createAgentKey: Record<string, string>;
          getAgent: Record<string, string>;
          getState: Record<string, string>;
        };
        localAction: {
          storageDepositNear: string;
          env: Record<string, string>;
          functionCall: {
            methodName: string;
            argsJson: Record<string, string>;
            attachedDepositNear: string;
            gasTgas: string;
          };
          preflightCall: {
            methodName: string;
            argsJson: Record<string, string>;
            expectedMissingResult: null;
          };
          stateReadCall: {
            methodName: string;
            argsJson: Record<string, string>;
          };
        };
      };
    };
    const testnet = contracts.environments.testnet;
    const keyMarket = testnet.key_market;

    expect(payload.contracts.source).toBe("apps/clawhouse-app/config/public-onboarding-contracts.json");
    expect(payload.contracts.publicKitUrl).toBe("https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/contracts.json");
    expect(payload.contracts.config).toEqual(contracts);
    expect(payload.keyMarketSetup).toMatchObject({
      environment: "testnet",
      networkId: testnet.network_id,
      rpcUrl: testnet.rpc_url,
      contractId: keyMarket.contract_id,
      fundingAmountNear: keyMarket.funding_amount_near,
      storageDepositNear: keyMarket.storage_deposit_near,
      fundingNetwork: "testnet NEAR",
      createMethod: keyMarket.create_method,
      preflightMethod: keyMarket.preflight_method,
      stateReadMethod: keyMarket.state_read_method,
      methodArgs: {
        createAgentKey: keyMarket.method_args.create_agent_key,
        getAgent: keyMarket.method_args.get_agent,
        getState: keyMarket.method_args.get_state,
      },
      gasTgas: keyMarket.gas_tgas,
      gas: "100000000000000",
    });
    expect(payload.keyMarketSetup.localAction).toMatchObject({
      storageDepositNear: keyMarket.storage_deposit_near,
      env: {
        STORAGE_DEPOSIT: keyMarket.storage_deposit_near,
        ACCOUNT_ID: account,
        CONTRACT_ID: keyMarket.contract_id,
        NEAR_NETWORK_ID: testnet.network_id,
        NEAR_NODE_URL: testnet.rpc_url,
        NEAR_TGAS: keyMarket.gas_tgas,
        CLAWHOUSE_OPERATION_KEY_FILE: "~/.clawhouse/agents/<agent_id>/operation-key.json",
      },
      functionCall: {
        methodName: keyMarket.create_method,
        argsJson: keyMarket.method_args.create_agent_key,
        attachedDepositNear: keyMarket.storage_deposit_near,
        gasTgas: keyMarket.gas_tgas,
      },
      preflightCall: {
        methodName: keyMarket.preflight_method,
        argsJson: keyMarket.method_args.get_agent,
        expectedMissingResult: null,
      },
      stateReadCall: {
        methodName: keyMarket.state_read_method,
        argsJson: keyMarket.method_args.get_state,
      },
    });
  });

  test("key-market config route derives defaults from the shared contract config", async () => {
    const response = keyMarketConfigGET();
    const payload = await response.json() as {
      config: {
        networkId: string;
        nodeUrl: string;
        contractId: string;
        gas: string;
        createMethod: string;
        methodArgs: {
          createAgentKey: Record<string, string>;
          getAgent: Record<string, string>;
          getState: Record<string, string>;
        };
        storageDepositYocto: string;
      };
    };

    expect(payload.config).toMatchObject({
      networkId: contracts.environments.testnet.network_id,
      nodeUrl: contracts.environments.testnet.rpc_url,
      contractId: contracts.environments.testnet.key_market.contract_id,
      gas: "100000000000000",
      createMethod: contracts.environments.testnet.key_market.create_method,
      methodArgs: {
        createAgentKey: contracts.environments.testnet.key_market.method_args.create_agent_key,
        getAgent: contracts.environments.testnet.key_market.method_args.get_agent,
        getState: contracts.environments.testnet.key_market.method_args.get_state,
      },
      storageDepositYocto: "20000000000000000000000",
    });
  });

  test("blocks disabled contract environments selected by env", () => {
    process.env.CLAWHOUSE_KEY_MARKET_ENVIRONMENT = "mainnet";

    expect(() => GET(new Request("http://clawhouse.test/creator-onboarding/setup"))).toThrow(
      "Key-market contract environment is disabled: mainnet",
    );
  });

  test("keeps mainnet key-market onboarding disabled until configured", () => {
    const mainnet = contracts.environments.mainnet;

    expect(mainnet.status).toBe("disabled");
    expect(mainnet.key_market.contract_id).toBeNull();
    expect(mainnet.key_market.storage_deposit_near).toBeNull();
    expect(mainnet.key_market.funding_amount_near).toBeNull();
  });
});

function skillInstall(name: string, url: string) {
  return {
    tool: "skill_install",
    parameters: { name, url },
  };
}

function completionTemplateFromSkill(skill: string, creatorPublicAccount: string) {
  const sectionStart = skill.indexOf("## Completion Response");
  expect(sectionStart).toBeGreaterThanOrEqual(0);

  const section = skill.slice(sectionStart);
  const match = section.match(/```text\n([\s\S]*?)\n```/);
  expect(match).not.toBeNull();

  return `${match![1].replaceAll("<creator_public_account>", creatorPublicAccount)}\n`;
}
