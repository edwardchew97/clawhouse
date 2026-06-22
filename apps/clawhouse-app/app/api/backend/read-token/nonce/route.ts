import { NextResponse } from "next/server";
import { backendError, ledgerAdminAuthorizationHeader } from "../../lib";
import {
  ReadTokenInputError,
  createReadAccessChallenge,
  requireAccountIdValue,
  requireBoardIdValue,
  signingRecipient,
} from "../lib";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const boardId = requireBoardIdValue(body.boardId ?? body.board_id);
    const holderAccountId = requireAccountIdValue(body.holderAccountId ?? body.holder_account_id ?? body.accountId);
    const challenge = createReadAccessChallenge({
      boardId,
      holderAccountId,
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
