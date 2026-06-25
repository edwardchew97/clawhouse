import { JsonRpcProvider, nearToYocto, yoctoToNear } from "near-api-js";
import { NextResponse } from "next/server";
import { firstEnv } from "../../lib/env";
import { getPublicKeyMarketContractConfig } from "./contracts";
import { keyMarketEnv } from "./constants";

const defaultBuyMaxReserveNear = "0.05";
const defaultBuyMaxSearchLimit = 100_000;
const viewCacheTtlMs = 1_500;
const yoctoPerNear = BigInt("1000000000000000000000000");
const basePriceYocto = yoctoPerNear / BigInt(20);
const curveScale = BigInt(2_000);
const protocolFeeBps = BigInt(500);
const creatorFeeBps = BigInt(500);
const slippageBps = BigInt(100);
const bpsDenominator = BigInt(10_000);

type JsonRecord = Record<string, unknown>;

let provider: JsonRpcProvider | null = null;
let providerUrl = "";
const viewCache = new Map<string, { expiresAt: number; promise: Promise<unknown> }>();

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
  const cacheKey = `view:${contractId}:${methodName}:${stableJson(args)}`;
  return cachedView<T>(cacheKey, async () => getProvider().callFunction({
    contractId,
    method: methodName,
    args,
  }) as Promise<T>);
}

export async function viewAccount(accountId: string) {
  return cachedView<{ amount: bigint; locked: bigint }>(`account:${accountId}`, async () => getProvider().viewAccount({ accountId }));
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

export function localBuyQuote(agentId: string, supply: string | number | bigint, amount: string | number | bigint) {
  const supplyBefore = integerValue(supply, "supply");
  const quantity = positiveIntegerValue(amount, "amount");
  const supplyAfter = supplyBefore + quantity;
  const price = priceRange(supplyBefore, quantity);
  return priceQuote(agentId, quantity, supplyBefore, supplyAfter, price, true);
}

export function localSellQuote(agentId: string, supply: string | number | bigint, amount: string | number | bigint) {
  const supplyBefore = integerValue(supply, "supply");
  const quantity = positiveIntegerValue(amount, "amount");
  if (quantity >= supplyBefore) {
    throw new RouteInputError("Cannot sell final key");
  }
  const supplyAfter = supplyBefore - quantity;
  const price = priceRange(supplyAfter, quantity);
  return priceQuote(agentId, quantity, supplyBefore, supplyAfter, price, false);
}

export function maxBuyQuoteFromSupply(
  agentId: string,
  supply: string | number | bigint,
  spendableYocto: bigint,
  searchLimit: number,
  storageDepositYocto: string,
) {
  let low = 1;
  let high = searchLimit;
  let bestAmount = 0;
  let bestQuote: PriceQuote | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const quote = localBuyQuote(agentId, supply, mid);
    if (buyAttachedDeposit(quote, storageDepositYocto) <= spendableYocto) {
      bestAmount = mid;
      bestQuote = quote;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return {
    amount: bestAmount,
    quote: bestQuote,
    capped: bestAmount >= searchLimit,
  };
}

export function buyAttachedDeposit(quote: PriceQuote, storageDepositYocto = getKeyMarketConfig().storageDepositYocto) {
  return applyBps(BigInt(quote.total_cost), slippageBps) + BigInt(storageDepositYocto);
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

async function cachedView<T>(key: string, load: () => Promise<T>) {
  const now = Date.now();
  const cached = viewCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise as Promise<T>;

  const promise = load();
  viewCache.set(key, { expiresAt: now + viewCacheTtlMs, promise });
  try {
    return await promise;
  } catch (error) {
    if (viewCache.get(key)?.promise === promise) viewCache.delete(key);
    throw error;
  }
}

function stableJson(value: JsonRecord) {
  return JSON.stringify(value, Object.keys(value).sort());
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

function priceQuote(
  agentId: string,
  amount: bigint,
  supplyBefore: bigint,
  supplyAfter: bigint,
  price: bigint,
  isBuy: boolean,
): PriceQuote {
  const protocolFee = fee(price, protocolFeeBps);
  const creatorFee = fee(price, creatorFeeBps);
  const totalFees = protocolFee + creatorFee;
  return {
    agent_id: agentId,
    amount: amount.toString(),
    supply_before: supplyBefore.toString(),
    supply_after: supplyAfter.toString(),
    price: price.toString(),
    protocol_fee: protocolFee.toString(),
    creator_fee: creatorFee.toString(),
    total_cost: isBuy ? (price + totalFees).toString() : "0",
    payout: isBuy ? "0" : (price - totalFees).toString(),
  };
}

function priceRange(startSupply: bigint, amount: bigint) {
  const end = startSupply + amount - BigInt(1);
  const base = basePriceYocto * amount;
  const squareSum = sumSquares(end) - (startSupply === BigInt(0) ? BigInt(0) : sumSquares(startSupply - BigInt(1)));
  const curve = squareSum * yoctoPerNear / curveScale;
  return base + curve;
}

function sumSquares(n: bigint) {
  return n * (n + BigInt(1)) * (BigInt(2) * n + BigInt(1)) / BigInt(6);
}

function fee(price: bigint, bps: bigint) {
  return price * bps / bpsDenominator;
}

function positiveIntegerValue(value: string | number | bigint, label: string) {
  const parsed = integerValue(value, label);
  if (parsed <= BigInt(0)) throw new RouteInputError(`${label} must be greater than zero`);
  return parsed;
}

function integerValue(value: string | number | bigint, label: string) {
  const normalized = value.toString();
  if (!/^\d+$/.test(normalized)) throw new RouteInputError(`Invalid ${label}`);
  return BigInt(normalized);
}
