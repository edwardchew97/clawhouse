import { NextResponse } from "next/server";
import { verifyMessage } from "near-api-js/nep413";
import { backendError, fetchBackendJson, ledgerAdminAuthorizationHeader } from "../lib";
import { getKeyMarketConfig, getProvider } from "../../key-market/lib";
import {
  ReadTokenInputError,
  decodeNonce,
  decodeSignature,
  newReadToken,
  normalizeSignedMessage,
  readAccessTokenExpiry,
  requireNonEmpty,
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

    const { contractId, nodeUrl } = getKeyMarketConfig();
    const readToken = newReadToken();
    const expiresAt = readAccessTokenExpiry();
    const access = await fetchBackendJson(`/boards/${encodeURIComponent(challenge.boardId)}/read-access/near-key-market`, {
      method: "POST",
      headers: { authorization },
      body: {
        holder_account_id: challenge.holderAccountId,
        key_contract_id: contractId,
        rpc_url: nodeUrl,
        read_token: readToken,
        access_level: "key_holder_detail",
        expires_at: expiresAt,
        metadata: {
          source: "clawhouse-app-wallet-nep413",
          signed_account_id: signedMessage.accountId,
          signed_public_key: signedMessage.publicKey,
          challenge_issued_at: challenge.issuedAt,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      boardId: challenge.boardId,
      holderAccountId: challenge.holderAccountId,
      readToken,
      expiresAt,
      access,
    });
  } catch (error) {
    if (error instanceof ReadTokenInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return backendError(error);
  }
}
