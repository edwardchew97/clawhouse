import { NextResponse } from "next/server";
import {
  backendError,
  fetchBackendJson,
  getBackendConfig,
  publicBackendConfig,
  requireBoardId,
} from "../lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const boardId = requireBoardId(searchParams.get("boardId") ?? getBackendConfig().defaultBoardId);
    const path = `/boards/${encodeURIComponent(boardId)}`;

    const [board, events, portfolio, pnl, balanceChanges, prices] = await Promise.allSettled([
      fetchBackendJson(path),
      fetchBackendJson(`${path}/events`),
      fetchBackendJson(`${path}/portfolio`),
      fetchBackendJson(`${path}/pnl`),
      fetchBackendJson(`${path}/balance-changes`),
      fetchBackendJson(`${path}/prices`),
    ]);

    return NextResponse.json({
      ok: board.status === "fulfilled",
      config: publicBackendConfig(),
      boardId,
      board: settledValue(board),
      events: settledValue(events),
      portfolio: settledValue(portfolio),
      pnl: settledValue(pnl),
      balanceChanges: settledValue(balanceChanges),
      prices: settledValue(prices),
      errors: {
        board: settledError(board),
        events: settledError(events),
        portfolio: settledError(portfolio),
        pnl: settledError(pnl),
        balanceChanges: settledError(balanceChanges),
        prices: settledError(prices),
      },
    });
  } catch (error) {
    return backendError(error);
  }
}

function settledValue<T>(result: PromiseSettledResult<T>) {
  return result.status === "fulfilled" ? result.value : null;
}

function settledError(result: PromiseSettledResult<unknown>) {
  if (result.status === "fulfilled") return null;
  return result.reason instanceof Error ? result.reason.message : "Backend request failed";
}
