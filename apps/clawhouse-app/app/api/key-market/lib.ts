import { JsonRpcProvider, nearToYocto, yoctoToNear } from "near-api-js";
import { NextResponse } from "next/server";

const defaultNetworkId = "testnet";
const defaultContractId = "clawhouse-key-20260619125948.testnet";
const defaultGas = "100000000000000";
const defaultStorageDepositNear = "0.02";
const defaultRpcUrls: Record<string, string> = {
  mainnet: "https://rpc.mainnet.fastnear.com",
  testnet: "https://rpc.testnet.fastnear.com",
};
const slippageBps = BigInt(100);
const bpsDenominator = BigInt(10_000);

type JsonRecord = Record<string, unknown>;

let provider: JsonRpcProvider | null = null;
let providerUrl = "";

export type PriceQuote = {
  agent_id: string;
  amount: string;
  supply_before: string;
  supply_after: string;
  price: string;
  protocol_fee: string;
  creator_fee: string;
  total_cost: string;
  payout: string;
};

export type MarketState = {
  agent: {
    agent_id: string;
    creator_id: string;
    name: string;
    metadata_uri: string;
    supply: string;
    reserve: string;
    created_at_ns: string;
  };
  holder_id: string | null;
  holder_balance: string | null;
  next_buy_price: PriceQuote;
  next_sell_price: PriceQuote | null;
};

export function getKeyMarketConfig() {
  const networkId = firstEnv(["CLAWHOUSE_KEY_NEAR_NETWORK_ID", "KEY_NEAR_NETWORK_ID", "NEAR_NETWORK_ID"])
    ?? defaultNetworkId;
  const nodeUrl = rpcUrlForNetwork(
    firstEnv(["CLAWHOUSE_KEY_NEAR_RPC_URL", "KEY_NEAR_RPC_URL", "NEAR_NODE_URL"]),
    networkId,
  )
    ?? defaultRpcUrls[networkId]
    ?? `https://rpc.${networkId}.near.org`;
  const contractId = firstEnv([
    "CLAWHOUSE_KEY_MARKET_CONTRACT_ID",
    "KEY_MARKET_CONTRACT_ID",
    "CONTRACT_ID",
  ]) ?? defaultContractId;
  const storageDepositYocto = parseNearAmount(
    firstEnv(["CLAWHOUSE_KEY_STORAGE_DEPOSIT_NEAR", "STORAGE_DEPOSIT"]) ?? defaultStorageDepositNear,
  );

  return {
    networkId,
    nodeUrl,
    contractId,
    gas: firstEnv(["CLAWHOUSE_KEY_MARKET_GAS", "NEAR_TGAS_YOCTO"]) ?? defaultGas,
    storageDepositYocto,
    defaultAgentId: firstEnv(["CLAWHOUSE_DEFAULT_AGENT_ID"]) ?? "terminal_chad6",
  };
}

export function getProvider() {
  const { nodeUrl } = getKeyMarketConfig();
  if (!provider || providerUrl !== nodeUrl) {
    provider = new JsonRpcProvider({ url: nodeUrl });
    providerUrl = nodeUrl;
  }
  return provider;
}

export async function viewFunction<T>(methodName: string, args: JsonRecord): Promise<T> {
  const { contractId } = getKeyMarketConfig();
  const result = await getProvider().callFunction({
    contractId,
    method: methodName,
    args,
  });
  return result as T;
}

export function requireAgentId(value: string | null) {
  if (!value || !/^[a-z0-9_-]{3,64}$/.test(value)) {
    throw new RouteInputError("Invalid agentId");
  }
  return value;
}

export function requireAmount(value: string | null) {
  if (!value || !/^[1-9]\d{0,5}$/.test(value)) {
    throw new RouteInputError("Invalid amount");
  }
  return value;
}

export function optionalAccountId(value: string | null) {
  if (!value) return null;
  if (!/^[a-z0-9._-]{2,64}$/.test(value)) {
    throw new RouteInputError("Invalid holderId");
  }
  return value;
}

export function formatQuote(quote: PriceQuote) {
  return {
    ...quote,
    price_near: yoctoToNearString(quote.price),
    protocol_fee_near: yoctoToNearString(quote.protocol_fee),
    creator_fee_near: yoctoToNearString(quote.creator_fee),
    total_cost_near: yoctoToNearString(quote.total_cost),
    payout_near: yoctoToNearString(quote.payout),
  };
}

export function formatState(state: MarketState) {
  return {
    ...state,
    agent: {
      ...state.agent,
      reserve_near: yoctoToNearString(state.agent.reserve),
    },
    next_buy_price: formatQuote(state.next_buy_price),
    next_sell_price: state.next_sell_price ? formatQuote(state.next_sell_price) : null,
  };
}

export function quoteProtection(side: "buy" | "sell", quote: PriceQuote) {
  if (side === "buy") {
    const totalCost = BigInt(quote.total_cost);
    const maxPrice = applyBps(totalCost, slippageBps);
    const attachedDeposit = maxPrice + BigInt(getKeyMarketConfig().storageDepositYocto);
    return {
      max_price: maxPrice.toString(),
      max_price_near: yoctoToNearString(maxPrice.toString()),
      attached_deposit: attachedDeposit.toString(),
      attached_deposit_near: yoctoToNearString(attachedDeposit.toString()),
      slippage_bps: slippageBps.toString(),
    };
  }

  const payout = BigInt(quote.payout);
  const minPayout = removeBps(payout, slippageBps);
  return {
    min_payout: minPayout.toString(),
    min_payout_near: yoctoToNearString(minPayout.toString()),
    slippage_bps: slippageBps.toString(),
  };
}

export function routeError(error: unknown) {
  if (error instanceof RouteInputError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : "Unknown key market error";
  const status = message.includes("WasmTrap") || message.includes("does not exist") ? 404 : 502;
  return NextResponse.json({ ok: false, error: message }, { status });
}

export class RouteInputError extends Error {}

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function rpcUrlForNetwork(value: string | undefined, networkId: string) {
  if (!value) return undefined;
  if (value === `https://rpc.${networkId}.near.org`) {
    return defaultRpcUrls[networkId];
  }
  return value;
}

function parseNearAmount(value: string) {
  const parsed = nearToYocto(value as `${number}`);
  if (parsed === null) {
    throw new Error(`Invalid NEAR amount: ${value}`);
  }
  return parsed.toString();
}

function yoctoToNearString(value: string) {
  if (!/^\d+$/.test(value)) return "";
  return yoctoToNear(BigInt(value));
}

function applyBps(value: bigint, bps: bigint) {
  return (value * (bpsDenominator + bps) + bpsDenominator - BigInt(1)) / bpsDenominator;
}

function removeBps(value: bigint, bps: bigint) {
  return (value * (bpsDenominator - bps)) / bpsDenominator;
}
