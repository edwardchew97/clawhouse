import { JsonRpcProvider, nearToYocto, yoctoToNear } from "near-api-js";
import { NextResponse } from "next/server";
import { firstEnv } from "../../lib/env";
import { getPublicKeyMarketContractConfig } from "./contracts";
import { keyMarketEnv } from "./constants";

const defaultBuyMaxReserveNear = "0.05";
const defaultBuyMaxSearchLimit = 100_000;
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
  const publicConfig = getPublicKeyMarketContractConfig();
  const networkId = mirrorEnv("network_id", firstEnv([...keyMarketEnv.networkId]), publicConfig.networkId);
  const nodeUrl = mirrorRpcEnv(firstEnv([...keyMarketEnv.rpcUrl]), publicConfig);
  const contractId = mirrorEnv("contract_id", firstEnv([...keyMarketEnv.contractId]), publicConfig.contractId);
  const storageDepositYocto = parseNearAmount(
    mirrorEnv(
      "storage_deposit_near",
      firstEnv([...keyMarketEnv.storageDepositNear]),
      publicConfig.storageDepositNear,
    ),
  );
  const buyMaxReserveYocto = parseNearAmount(
    firstEnv([...keyMarketEnv.buyMaxReserveNear]) ?? defaultBuyMaxReserveNear,
  );

  return {
    networkId,
    nodeUrl,
    contractId,
    gas: mirrorEnv("gas", firstEnv([...keyMarketEnv.gas]), publicConfig.gas),
    createMethod: publicConfig.createMethod,
    preflightMethod: publicConfig.preflightMethod,
    stateReadMethod: publicConfig.stateReadMethod,
    methodArgs: publicConfig.methodArgs,
    methodNotes: publicConfig.methodNotes,
    storageDepositYocto,
    buyMaxReserveYocto,
    buyMaxSearchLimit: numberEnv(keyMarketEnv.buyMaxSearchLimit, defaultBuyMaxSearchLimit),
    defaultAgentId: firstEnv([...keyMarketEnv.defaultAgentId]) ?? null,
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

export function requireAccountId(value: string | null) {
  if (!value || !/^[a-z0-9._-]{2,64}$/.test(value)) {
    throw new RouteInputError("Invalid accountId");
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

function numberEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function mirrorRpcEnv(value: string | undefined, publicConfig: ReturnType<typeof getPublicKeyMarketContractConfig>) {
  if (!value || value === publicConfig.nodeUrl) return publicConfig.nodeUrl;
  if (value === `https://rpc.${publicConfig.networkId}.near.org`) return publicConfig.nodeUrl;
  throw new Error(`Key-market rpc_url env does not match public contract config: ${value}`);
}

function mirrorEnv(label: string, value: string | undefined, expected: string) {
  if (!value) return expected;
  if (value === expected) return value;
  throw new Error(`Key-market ${label} env does not match public contract config: ${value}`);
}

function parseNearAmount(value: string) {
  const parsed = nearToYocto(value as `${number}`);
  if (parsed === null) {
    throw new Error(`Invalid NEAR amount: ${value}`);
  }
  return parsed.toString();
}

export function yoctoToNearString(value: string) {
  if (!/^\d+$/.test(value)) return "";
  return yoctoToNear(BigInt(value));
}

function applyBps(value: bigint, bps: bigint) {
  return (value * (bpsDenominator + bps) + bpsDenominator - BigInt(1)) / bpsDenominator;
}

function removeBps(value: bigint, bps: bigint) {
  return (value * (bpsDenominator - bps)) / bpsDenominator;
}
