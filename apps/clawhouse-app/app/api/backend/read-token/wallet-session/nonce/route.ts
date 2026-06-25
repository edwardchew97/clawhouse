import { NextResponse } from "next/server";
import { backendError, ledgerAdminAuthorizationHeader } from "../../../lib";
import {
  ReadTokenInputError,
  createWalletSessionChallenge,
  requireAccountIdValue,
  signingRecipient,
} from "../../lib";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const accountId = requireAccountIdValue(body.accountId ?? body.account_id);
    const challenge = createWalletSessionChallenge({
      accountId,
      recipient: signingRecipient(request),
      secret: ledgerAdminAuthorizationHeader(),
    });

    return NextResponse.json({ ok: true, challenge });
  } catch (error) {
    if (error instanceof ReadTokenInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return backendError(error);
  }
}
