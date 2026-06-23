import { NextResponse } from "next/server";
import { verifyMessage } from "near-api-js/nep413";
import { backendError, ledgerAdminAuthorizationHeader } from "../lib";
import { getProvider } from "../../key-market/lib";
import { createHolderReadGrant } from "./grant";
import {
  ReadTokenInputError,
  createHolderReadCookie,
  createWalletSessionCookie,
  decodeNonce,
  decodeSignature,
  normalizeSignedMessage,
  requireNonEmpty,
  setHolderReadCookie,
  setWalletSessionCookie,
  verifyReadAccessChallenge,
} from "./lib";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const authorization = ledgerAdminAuthorizationHeader();
    const challenge = verifyReadAccessChallenge(requireNonEmpty(body.challenge, "challenge"), authorization);
    const signedMessage = normalizeSignedMessage(body.signedMessage ?? body.signed_message);

    if (signedMessage.accountId !== challenge.holderAccountId) {
      throw new ReadTokenInputError("Signed account does not match holderAccountId");
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
    const grant = await createHolderReadGrant({
      boardId: challenge.boardId,
      holderAccountId: challenge.holderAccountId,
      authorization,
      metadata: {
        source: "clawhouse-app-wallet-nep413",
        signed_account_id: signedMessage.accountId,
        signed_public_key: signedMessage.publicKey,
        challenge_issued_at: challenge.issuedAt,
        wallet_session_expires_at: walletSession.expiresAt,
      },
    });
    const holderReadCookie = createHolderReadCookie({
      boardId: challenge.boardId,
      holderAccountId: challenge.holderAccountId,
      readToken: grant.readToken,
      expiresAt: grant.expiresAt,
      secret: authorization,
    });
    const includeRawReadToken = request.headers.get("x-clawhouse-client") === "script";
    const response = NextResponse.json({
      ok: true,
      boardId: challenge.boardId,
      holderAccountId: challenge.holderAccountId,
      valid: grant.granted,
      expiresAt: grant.expiresAt,
      access: grant.access,
      ...(includeRawReadToken ? { readToken: grant.readToken } : {}),
    });
    response.headers.set("cache-control", "no-store");
    setWalletSessionCookie(response, walletSession);
    if (grant.granted) setHolderReadCookie(response, holderReadCookie);
    return response;
  } catch (error) {
    if (error instanceof ReadTokenInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return backendError(error);
  }
}
