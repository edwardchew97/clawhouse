import { NextResponse } from "next/server";
import {
  formatState,
  optionalAccountId,
  requireAgentId,
  routeError,
  viewFunction,
  type MarketState,
} from "../lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = requireAgentId(searchParams.get("agentId"));
    const holderId = optionalAccountId(searchParams.get("holderId"));
    const state = await viewFunction<MarketState>("get_state", {
      agent_id: agentId,
      holder_id: holderId,
    });

    return NextResponse.json({
      ok: true,
      state: formatState(state),
    });
  } catch (error) {
    return routeError(error);
  }
}
