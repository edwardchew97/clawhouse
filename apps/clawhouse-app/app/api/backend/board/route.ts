import { NextResponse } from "next/server";
import {
  backendError,
  fetchBackendJson,
  getBackendConfig,
  ledgerAdminAuthorizationHeader,
  publicBackendConfig,
  requireBoardId,
} from "../lib";
import { paperAccountIdForBoard } from "./paper-activity";
import {
  clearHolderReadCookie,
  holderReadCookieName,
  readHolderReadCookie,
} from "../read-token/lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const configuredBoardId = searchParams.get("boardId") ?? getBackendConfig().defaultBoardId;
    if (!configuredBoardId) {
      return NextResponse.json({
        ok: false,
        config: publicBackendConfig(),
        boardId: null,
        board: null,
        events: null,
        portfolio: null,
        pnl: null,
        balanceChanges: null,
        prices: null,
        paperLeaderboard: null,
        paperActivity: null,
        errors: {
          board: "No default board configured",
          events: null,
          portfolio: null,
          pnl: null,
          balanceChanges: null,
          prices: null,
          paperLeaderboard: null,
          paperActivity: null,
        },
      });
    }
    const boardId = requireBoardId(configuredBoardId);
    const path = `/boards/${encodeURIComponent(boardId)}`;
    let clearReadCookie = false;
    let readToken = "";
    if (request.headers.get("cookie")?.includes(`${holderReadCookieName}=`)) {
      try {
        const holderReadCookie = readHolderReadCookie(request, ledgerAdminAuthorizationHeader());
        if (holderReadCookie?.boardId === boardId) {
          readToken = holderReadCookie.readToken;
        } else if (holderReadCookie) {
          clearReadCookie = true;
        }
      } catch {
        clearReadCookie = true;
      }
    }
    const detailOptions = readToken ? { headers: { "x-clawhouse-read-token": readToken } } : undefined;

    const [board, events, portfolio, pnl, balanceChanges, prices, paperLeaderboard] = await Promise.allSettled([
      fetchBackendJson(path, detailOptions),
      fetchBackendJson(`${path}/events`, detailOptions),
      fetchBackendJson(`${path}/portfolio`, detailOptions),
      fetchBackendJson(`${path}/pnl`, detailOptions),
      fetchBackendJson(`${path}/balance-changes`, detailOptions),
      fetchBackendJson(`${path}/prices`, detailOptions),
      fetchBackendJson("/paper/leaderboard"),
    ]);
    const boardValue = settledValue(board);
    const paperLeaderboardValue = settledValue(paperLeaderboard);
    const paperAccountId = paperAccountIdForBoard(boardValue, paperLeaderboardValue, boardId);
    const paperActivity = paperAccountId
      ? await Promise.allSettled([
          fetchBackendJson(`/paper/accounts/${encodeURIComponent(paperAccountId)}/activity?limit=240`, {
            headers: { authorization: ledgerAdminAuthorizationHeader() },
          }),
        ]).then((results) => results[0])
      : null;

    const response = NextResponse.json({
      ok: board.status === "fulfilled",
      config: publicBackendConfig(),
      boardId,
      board: boardValue,
      events: settledValue(events),
      portfolio: settledValue(portfolio),
      pnl: settledValue(pnl),
      balanceChanges: settledValue(balanceChanges),
      prices: settledValue(prices),
      paperLeaderboard: paperLeaderboardValue,
      paperActivity: paperActivity ? settledValue(paperActivity) : null,
      errors: {
        board: settledError(board),
        events: settledError(events),
        portfolio: settledError(portfolio),
        pnl: settledError(pnl),
        balanceChanges: settledError(balanceChanges),
        prices: settledError(prices),
        paperLeaderboard: settledError(paperLeaderboard),
        paperActivity: paperActivity ? settledError(paperActivity) : null,
      },
    });
    if (clearReadCookie) clearHolderReadCookie(response);
    response.headers.set("cache-control", "no-store");
    return response;
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
