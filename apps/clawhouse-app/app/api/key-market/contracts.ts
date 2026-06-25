import { teraToGas } from "near-api-js";
import contracts from "../../../config/public-onboarding-contracts.json";
import { firstEnv } from "../../lib/env";

type ContractEnvironment = keyof typeof contracts.environments;
type EnabledContractEnvironment = Extract<ContractEnvironment, "testnet">;

export type PublicKeyMarketContractConfig = {
  environment: EnabledContractEnvironment;
  networkId: string;
  nodeUrl: string;
  contractId: string;
  createMethod: string;
  preflightMethod: string;
  stateReadMethod: string;
  methodArgs: {
    createAgentKey: Record<string, string>;
    getAgent: Record<string, string>;
    getState: Record<string, string>;
  };
  methodNotes: Record<string, string>;
  storageDepositNear: string;
  gasTgas: string;
  gas: string;
  signer: {
    source: string;
    accountIdEnv: string[];
    keyFileEnv: string;
  };
};

const defaultEnvironment = contracts.default_environment as ContractEnvironment;

export function selectedContractEnvironment() {
  const requested = firstEnv([contracts.environment_env, "CLAWHOUSE_KEY_NEAR_NETWORK_ID", "KEY_NEAR_NETWORK_ID", "NEAR_NETWORK_ID"])
    ?? defaultEnvironment;
  if (!isContractEnvironment(requested)) {
    throw new ContractConfigError(`Unknown key-market contract environment: ${requested}`);
  }
  return requested;
}

export function getPublicKeyMarketContractConfig(environment = selectedContractEnvironment()): PublicKeyMarketContractConfig {
  const config = contracts.environments[environment];
  if (config.status !== "enabled") {
    throw new ContractConfigError(`Key-market contract environment is disabled: ${environment}`);
  }
  const keyMarket = config.key_market;
  if (!keyMarket.contract_id || !keyMarket.storage_deposit_near || !keyMarket.gas_tgas) {
    throw new ContractConfigError(`Key-market contract config is incomplete: ${environment}`);
  }

  return {
    environment: environment as EnabledContractEnvironment,
    networkId: config.network_id,
    nodeUrl: config.rpc_url,
    contractId: keyMarket.contract_id,
    createMethod: keyMarket.create_method,
    preflightMethod: keyMarket.preflight_method,
    stateReadMethod: keyMarket.state_read_method,
    methodArgs: {
      createAgentKey: { ...keyMarket.method_args.create_agent_key },
      getAgent: { ...keyMarket.method_args.get_agent },
      getState: { ...keyMarket.method_args.get_state },
    },
    methodNotes: { ...keyMarket.method_notes },
    storageDepositNear: keyMarket.storage_deposit_near,
    gasTgas: keyMarket.gas_tgas,
    gas: teraToGas(keyMarket.gas_tgas as `${number}`).toString(),
    signer: {
      source: keyMarket.signer.source,
      accountIdEnv: [...keyMarket.signer.account_id_env],
      keyFileEnv: keyMarket.signer.key_file_env,
    },
  };
}

export function publicContractsPayload() {
  return contracts;
}

function isContractEnvironment(value: string): value is ContractEnvironment {
  return Object.prototype.hasOwnProperty.call(contracts.environments, value);
}

export class ContractConfigError extends Error {}
