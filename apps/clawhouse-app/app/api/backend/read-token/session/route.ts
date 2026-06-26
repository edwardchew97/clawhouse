import { NextResponse } from "next/server";
import { backendError, fetchBackendJson, ledgerAdminAuthorizationHeader } from "../../lib";
import { createHolderReadGrant } from "../grant";
import {
  ReadTokenInputError,
  clearHolderReadCookie,
  clearWalletSessionCookie,
  createHolderReadCookie,
  readHolderReadCookie,
  readWalletSessionCookie,
  requireAccountIdValue,
  requireBoardIdValue,
  setHolderReadCookie,
} from "../lib";

export const dynamic = "force-dynamic";

const refreshSkewMs = 30_000;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const boardId = requireBoardIdValue(searchParams.get("boardId") ?? searchParams.get("board_id"));
    const holderAccountId = requireAccountIdValue(
      searchParams.get("holderAccountId") ?? searchParams.get("holder_account_id") ?? searchParams.get("accountId"),
    );
    const authorization = ledgerAdminAuthorizationHeader();
    const walletSessionResult = readWalletSession(request, authorization);
    if (!walletSessionResult.session) {
      return invalidSession(
        walletSessionResult.reason ?? "missing_wallet_session",
        { clearWallet: walletSessionResult.clearWallet, needsAuth: true },
      );
    }
    if (walletSessionResult.session.accountId !== holderAccountId) {
      return invalidSession("wallet_account_mismatch", { clearWallet: true });
    }

    const holderCookieResult = readHolderCookie(request, authorization);
    if (
      holderCookieResult.cookie
      && holderCookieResult.cookie.boardId === boardId
      && holderCookieResult.cookie.holderAccountId === holderAccountId
      && Date.parse(holderCookieResult.cookie.expiresAt) > Date.now() + refreshSkewMs
      && await holderReadTokenWorks(boardId, holderCookieResult.cookie.readToken)
    ) {
      return validSession({
        boardId,
        holderAccountId,
        expiresAt: holderCookieResult.cookie.expiresAt,
        walletSessionExpiresAt: walletSessionResult.session.expiresAt,
        refreshed: false,
      });
    }

    const grant = await createHolderReadGrant({
      boardId,
      holderAccountId,
      authorization,
      metadata: {
        source: "clawhouse-app-wallet-session",
        session_account_id: walletSessionResult.session.accountId,
        session_public_key: walletSessionResult.session.publicKey,
        wallet_session_issued_at: walletSessionResult.session.issuedAt,
        wallet_session_expires_at: walletSessionResult.session.expiresAt,
      },
    });
    if (!grant.granted) {
      return invalidSession("read_access_denied", { clearHolder: true });
    }

    const holderReadCookie = createHolderReadCookie({
      boardId,
      holderAccountId,
      readToken: grant.readToken,
      expiresAt: grant.expiresAt,
      secret: authorization,
    });
    const response = validSession({
      boardId,
      holderAccountId,
      expiresAt: grant.expiresAt,
      walletSessionExpiresAt: walletSessionResult.session.expiresAt,
      refreshed: true,
    });
    setHolderReadCookie(response, holderReadCookie);
    return response;
  } catch (error) {
    if (error instanceof ReadTokenInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;
    if (status === 401 || status === 403) {
      return invalidSession("read_access_unauthorized", { clearHolder: true, needsAuth: true });
    }
    return backendError(error);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "no-store");
  clearHolderReadCookie(response);
  clearWalletSessionCookie(response);
  return response;
}

function readWalletSession(request: Request, authorization: string) {
  try {
    const session = readWalletSessionCookie(request, authorization);
    return session
      ? { session, reason: null, clearWallet: false }
      : { session: null, reason: "missing_wallet_session", clearWallet: false };
  } catch {
    return { session: null, reason: "invalid_wallet_session", clearWallet: true };
  }
}

function readHolderCookie(request: Request, authorization: string) {
  try {
    const cookie = readHolderReadCookie(request, authorization);
    return { cookie, clearHolder: false };
  } catch {
    return { cookie: null, clearHolder: true };
  }
}

async function holderReadTokenWorks(boardId: string, readToken: string) {
  try {
    await fetchBackendJson(`/boards/${encodeURIComponent(boardId)}/events`, {
      headers: { "x-clawhouse-read-token": readToken },
    });
    return true;
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;
    if (status === 401 || status === 403) return false;
    throw error;
  }
}

function validSession(input: {
  boardId: string;
  holderAccountId: string;
  expiresAt: string;
  walletSessionExpiresAt: string;
  refreshed: boolean;
}) {
  const response = NextResponse.json({ ok: true, valid: true, ...input });
  response.headers.set("cache-control", "no-store");
  return response;
}

function invalidSession(
  reason: string | null,
  options: { clearHolder?: boolean; clearWallet?: boolean; needsAuth?: boolean } = {},
) {
  const payload = {
    ok: true,
    valid: false,
    reason,
    error_code: reason,
    needs_auth: options.needsAuth ?? false,
    hint_action: reason === "wallet_account_mismatch" ? "re_sign_wallet" : "request_wallet_session",
  };
  const response = NextResponse.json(payload);
  response.headers.set("cache-control", "no-store");
  if (options.clearHolder) clearHolderReadCookie(response);
  if (options.clearWallet) {
    clearHolderReadCookie(response);
    clearWalletSessionCookie(response);
  }
  return response;
}
