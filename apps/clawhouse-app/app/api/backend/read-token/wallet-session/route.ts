import { NextResponse } from "next/server";
import { verifyMessage } from "near-api-js/nep413";
import { backendError, ledgerAdminAuthorizationHeader } from "../../lib";
import { getProvider } from "../../../key-market/lib";
import {
  ReadTokenInputError,
  clearHolderReadCookie,
  clearWalletSessionCookie,
  createWalletSessionCookie,
  decodeNonce,
  decodeSignature,
  normalizeSignedMessage,
  readWalletSessionCookie,
  requireAccountIdValue,
  requireNonEmpty,
  setWalletSessionCookie,
  verifyWalletSessionChallenge,
} from "../lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = requireAccountIdValue(searchParams.get("accountId") ?? searchParams.get("account_id"));
    const authorization = ledgerAdminAuthorizationHeader();
    const session = readWalletSessionCookie(request, authorization);
    if (!session) return invalidSession("missing_wallet_session", true);
    if (session.accountId !== accountId) return invalidSession("wallet_account_mismatch", true);

    return validSession({
      accountId: session.accountId,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    if (error instanceof ReadTokenInputError) {
      return invalidSession("invalid_wallet_session", true);
    }
    return backendError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const authorization = ledgerAdminAuthorizationHeader();
    const challenge = verifyWalletSessionChallenge(requireNonEmpty(body.challenge, "challenge"), authorization);
    const signedMessage = normalizeSignedMessage(body.signedMessage ?? body.signed_message);

    if (signedMessage.accountId !== challenge.accountId) {
      throw new ReadTokenInputError("Signed account does not match accountId");
    }

    await verifyMessage({
      signerAccountId: signedMessage.accountId,
      signerPublicKey: signedMessage.publicKey,
      payload: {
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: decodeNonce(challenge.nonce),
      },
      signature: decodeSignature(signedMessage.signature),
      provider: getProvider(),
    });

    const walletSession = createWalletSessionCookie({
      accountId: signedMessage.accountId,
      publicKey: signedMessage.publicKey,
      secret: authorization,
      expiresAt: challenge.walletSessionExpiresAt,
    });
    const response = validSession({
      accountId: walletSession.accountId,
      expiresAt: walletSession.expiresAt,
    });
    setWalletSessionCookie(response, walletSession);
    return response;
  } catch (error) {
    if (error instanceof ReadTokenInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return backendError(error);
  }
}

function validSession(input: { accountId: string; expiresAt: string }) {
  const response = NextResponse.json({ ok: true, valid: true, ...input });
  response.headers.set("cache-control", "no-store");
  return response;
}

function invalidSession(reason: string, clearWallet = false) {
  const response = NextResponse.json({
    ok: true,
    valid: false,
    reason,
    error_code: reason,
    needs_auth: true,
    hint_action: reason === "wallet_account_mismatch" ? "re_sign_wallet" : "request_wallet_session",
  });
  response.headers.set("cache-control", "no-store");
  if (clearWallet) {
    clearHolderReadCookie(response);
    clearWalletSessionCookie(response);
  }
  return response;
}
