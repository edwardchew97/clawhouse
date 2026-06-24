import { NextResponse } from "next/server";
import {
  formatQuote,
  getKeyMarketConfig,
  getProvider,
  quoteProtection,
  requireAccountId,
  requireAgentId,
  routeError,
  viewFunction,
  yoctoToNearString,
  type PriceQuote,
} from "../lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = requireAgentId(searchParams.get("agentId"));
    const accountId = requireAccountId(searchParams.get("accountId"));
    const config = getKeyMarketConfig();
    const account = await getProvider().viewAccount({ accountId });
    const liquidYocto = account.amount > account.locked ? account.amount - account.locked : BigInt(0);
    const reserveYocto = BigInt(config.buyMaxReserveYocto);
    const spendableYocto = liquidYocto > reserveYocto ? liquidYocto - reserveYocto : BigInt(0);
    const result = await maxBuyQuote(agentId, spendableYocto, config.buyMaxSearchLimit);
    const protection = result.quote ? quoteProtection("buy", result.quote) : null;

    return NextResponse.json({
      ok: true,
      agent_id: agentId,
      account_id: accountId,
      balance_near: yoctoToNearString(account.amount.toString()),
      spendable_near: yoctoToNearString(spendableYocto.toString()),
      reserve_near: yoctoToNearString(reserveYocto.toString()),
      maxBuy: {
        amount: result.amount.toString(),
        capped: result.capped,
        quote: result.quote ? formatQuote(result.quote) : null,
        attached_deposit_near: protection && "attached_deposit_near" in protection
          ? protection.attached_deposit_near
          : null,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

async function maxBuyQuote(agentId: string, spendableYocto: bigint, searchLimit: number) {
  let bestAmount = 0;
  let bestQuote: PriceQuote | null = null;
  let low = 1;
  let high = 1;

  while (high <= searchLimit) {
    const quote = await buyQuote(agentId, high);
    if (attachedDeposit(quote) > spendableYocto) break;
    bestAmount = high;
    bestQuote = quote;
    low = high + 1;
    high *= 2;
  }

  let cappedHigh = Math.min(high, searchLimit);
  while (low <= cappedHigh) {
    const mid = Math.floor((low + cappedHigh) / 2);
    const quote = await buyQuote(agentId, mid);
    if (attachedDeposit(quote) <= spendableYocto) {
      bestAmount = mid;
      bestQuote = quote;
      low = mid + 1;
    } else {
      cappedHigh = mid - 1;
    }
  }

  return {
    amount: bestAmount,
    quote: bestQuote,
    capped: bestAmount >= searchLimit,
  };
}

async function buyQuote(agentId: string, amount: number) {
  return viewFunction<PriceQuote>("get_buy_price", {
    agent_id: agentId,
    amount: amount.toString(),
  });
}

function attachedDeposit(quote: PriceQuote) {
  const protection = quoteProtection("buy", quote);
  if (!("attached_deposit" in protection)) return BigInt(0);
  return BigInt(protection.attached_deposit ?? "0");
}
