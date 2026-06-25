import { NextResponse } from "next/server";
import {
  formatQuote,
  localBuyQuote,
  localSellQuote,
  type MarketState,
  quoteProtection,
  requireAgentId,
  requireAmount,
  routeError,
  RouteInputError,
  viewFunction,
} from "../lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const side = searchParams.get("side");
    if (side !== "buy" && side !== "sell") {
      throw new RouteInputError("side must be buy or sell");
    }

    const agentId = requireAgentId(searchParams.get("agentId"));
    const amount = requireAmount(searchParams.get("amount"));
    const state = await viewFunction<MarketState>("get_state", {
      agent_id: agentId,
      holder_id: null,
    });
    const quote = side === "buy"
      ? localBuyQuote(agentId, state.agent.supply, amount)
      : localSellQuote(agentId, state.agent.supply, amount);

    return NextResponse.json({
      ok: true,
      side,
      quote: formatQuote(quote),
      protection: quoteProtection(side, quote),
    });
  } catch (error) {
    return routeError(error);
  }
}
