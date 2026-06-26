import { NextResponse } from "next/server";
import {
  formatQuote,
  getKeyMarketConfig,
  maxBuyQuoteFromSupply,
  quoteProtection,
  requireAccountId,
  requireAgentId,
  routeError,
  type MarketState,
  viewFunction,
  viewAccount,
  yoctoToNearString,
} from "../lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = requireAgentId(searchParams.get("agentId"));
    const accountId = requireAccountId(searchParams.get("accountId"));
    const config = getKeyMarketConfig();
    const [account, state] = await Promise.all([
      viewAccount(accountId),
      viewFunction<MarketState>("get_state", {
        agent_id: agentId,
        holder_id: accountId,
      }),
    ]);
    const liquidYocto = account.amount > account.locked ? account.amount - account.locked : BigInt(0);
    const reserveYocto = BigInt(config.buyMaxReserveYocto);
    const spendableYocto = liquidYocto > reserveYocto ? liquidYocto - reserveYocto : BigInt(0);
    const result = maxBuyQuoteFromSupply(
      agentId,
      state.agent.supply,
      spendableYocto,
      config.buyMaxSearchLimit,
      config.storageDepositYocto,
    );
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
